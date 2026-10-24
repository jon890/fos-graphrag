package dev.fos.workbench

import dev.fos.workbench.config.Neo4jSchemaInitializer
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

/** PR 리뷰에서 나온 입력 상한, 인덱스, 빈 수정, 이력 노출, 근거 규칙을 실제 Neo4j 로 확인한다. */
class ReviewFixIntegrationTest : IntegrationTest() {

    @Autowired lateinit var schema: Neo4jSchemaInitializer

    @Test
    fun `근거 문서 수, 검색어 길이, 본문 크기에 상한이 있다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val docs = (1..21).map { "00000000-0000-0000-0000-${it.toString().padStart(12, '0')}" }
        val tooMany = fx.claim("BELONGS_TO_SECTOR", fx.company("a").id, fx.sector("b").id, docs)
        assertThat(tooMany.code).isEqualTo("VALIDATION_FAILED")
        assertThat(tooMany.body["details"]["fieldErrors"]["documentIds"].asString()).contains("20")

        assertThat(alice.get("/api/nodes?q=${"x".repeat(101)}").code).isEqualTo("VALIDATION_FAILED")
        assertThat(alice.get("/api/nodes?q=${"x".repeat(100)}").status).isEqualTo(200)

        val huge = """{"type":"Company","properties":{"name":"${"가".repeat(30_000)}"}}"""
        val large = alice.sendRaw("POST", "/api/nodes", huge)
        assertThat(large.status).isEqualTo(413)
        assertThat(large.code).isEqualTo("PAYLOAD_TOO_LARGE")
        val chunked = alice.sendRaw("POST", "/api/nodes", """{"type":"Company","properties":{"name":"x"}}""", chunked = true)
        assertThat(chunked.status).isEqualTo(411)
    }

    @Test
    fun `검색어 인덱스는 TEXT 이고 관계 타입마다 id 인덱스가 있으며 다시 돌려도 같다`() {
        fun indexes(): Map<String, String> =
            neo4j.query("SHOW INDEXES YIELD name, type RETURN name, type").fetch().all()
                .associate { (it["name"] as String) to (it["type"] as String) }

        // 첫 버전처럼 RANGE 인덱스가 있던 DB 를 흉내 낸다
        neo4j.query("DROP INDEX knowledge_search_text IF EXISTS").run()
        neo4j.query("CREATE INDEX knowledge_search_text IF NOT EXISTS FOR (n:Knowledge) ON (n.searchText)").run()
        assertThat(indexes()["knowledge_search_text"]).isEqualTo("RANGE")

        schema.initialize()
        schema.initialize()
        val after = indexes()
        assertThat(after["knowledge_search_text"]).isEqualTo("TEXT")
        listOf("ISSUES", "SUBJECT", "OBJECT", "SUPPORTED_BY").forEach {
            assertThat(after[Neo4jSchemaInitializer.relationshipIndexName(it)]).isEqualTo("RANGE")
        }
        // 검색 쿼리가 TEXT 인덱스를 쓴다
        val plan = neo4j.query("EXPLAIN MATCH (n:Knowledge) WHERE n.searchText CONTAINS 'abc' RETURN n").run().plan()
        assertThat(plan.toString()).contains("NodeIndexContainsScan").contains("TEXT INDEX n:Knowledge(searchText)")
        // 관계 id 조회가 타입별 인덱스를 쓴다
        val relPlan = neo4j.query("EXPLAIN MATCH (:Knowledge)-[r:ISSUES {id: 'x'}]->(:Knowledge) RETURN r").run().plan()
        assertThat(relPlan.toString()).contains("RelationshipIndexSeek")
    }

    @Test
    fun `바뀐 값이 없는 수정은 revision 을 올리지 않고 이력도 남기지 않는다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val company = fx.company("빈수정")
        val same = alice.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("country" to "KR")))
        assertThat(same.status).isEqualTo(200)
        assertThat(same.body.revision).isEqualTo(1)
        assertThat(alice.get("/api/changes?targetId=${company.id}").body["totalItems"].asLong()).isEqualTo(1)

        val claim = fx.claim("BELONGS_TO_SECTOR", company.id, fx.sector("상대").id, listOf(fx.document("d").id)).body
        val sameClaim = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to 1, "description" to claim["properties"]["description"].asString()))
        assertThat(sameClaim.body.revision).isEqualTo(1)
        bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED", "note" to "확인"))
        val sameReview = bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 2, "status" to "REVIEWED", "note" to "확인"))
        assertThat(sameReview.body.revision).isEqualTo(2)
        assertThat(alice.get("/api/changes?targetId=${claim.id}").body["totalItems"].asLong()).isEqualTo(2)

        val admin = loggedIn(ADMIN)
        val user = admin.post("/api/users", mapOf("email" to "noop-${UUID.randomUUID().toString().take(8)}@example.com", "displayName" to "같음", "role" to "VIEWER")).body
        val sameUser = admin.patch("/api/users/${user.id}", mapOf("expectedRevision" to 1, "role" to "VIEWER", "displayName" to "같음"))
        assertThat(sameUser.body.revision).isEqualTo(1)
        assertThat(admin.get("/api/changes?targetId=${user.id}").body["totalItems"].asLong()).isEqualTo(1)
    }

    @Test
    fun `사용자 관리 이벤트는 ADMIN 에게만 보인다`() {
        val admin = loggedIn(ADMIN)
        val email = "hidden-${UUID.randomUUID().toString().take(8)}@example.com"
        val user = admin.post("/api/users", mapOf("email" to email, "displayName" to "숨김", "role" to "VIEWER")).body
        assertThat(admin.get("/api/changes?targetId=${user.id}").body["totalItems"].asLong()).isEqualTo(1)

        for (other in listOf(loggedIn(VIEWER), loggedIn(ALICE))) {
            assertThat(other.get("/api/changes?targetId=${user.id}").body["totalItems"].asLong()).isZero()
            val all = other.get("/api/changes?size=100").body["items"].toList()
            assertThat(all.none { it["targetKind"].asString() == "USER" }).isTrue()
            assertThat(other.get("/api/changes?actor=$ADMIN&size=100").body["items"].toList().none { it["targetKind"].asString() == "USER" }).isTrue()
        }
    }

    @Test
    fun `Claim 의 마지막 활성 근거 문서는 보관할 수 없고 근거가 없는 Claim 은 복원과 검토 완료를 거절한다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val doc1 = fx.document("근거1")
        val doc2 = fx.document("근거2")
        val claim = fx.claim("BELONGS_TO_SECTOR", fx.company("a").id, fx.sector("b").id, listOf(doc1.id, doc2.id)).body

        assertThat(alice.post("/api/nodes/${doc1.id}/archive", mapOf("expectedRevision" to 1)).status).isEqualTo(200)
        val last = alice.post("/api/nodes/${doc2.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(last.status).isEqualTo(409)
        assertThat(last.code).isEqualTo("LAST_EVIDENCE")
        assertThat(last.body["details"]["claimIds"][0].asString()).isEqualTo(claim.id)

        // Claim 을 먼저 보관하면 근거 문서도 보관할 수 있고, 그 뒤 Claim 복원은 거절한다
        alice.post("/api/nodes/${claim.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(alice.post("/api/nodes/${doc2.id}/archive", mapOf("expectedRevision" to 1)).status).isEqualTo(200)
        assertThat(alice.post("/api/nodes/${claim.id}/restore", mapOf("expectedRevision" to 2)).code).isEqualTo("NO_ACTIVE_EVIDENCE")
        alice.post("/api/nodes/${doc2.id}/restore", mapOf("expectedRevision" to 2))
        assertThat(alice.post("/api/nodes/${claim.id}/restore", mapOf("expectedRevision" to 2)).status).isEqualTo(200)

        // 이전 버전 데이터처럼 근거가 모두 보관된 활성 Claim 은 검토 완료할 수 없다
        neo4j.query("MATCH (d:Knowledge) WHERE d.id IN \$ids SET d.archived = true").bind(listOf(doc1.id, doc2.id)).to("ids").run()
        val review = bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 3, "status" to "REVIEWED"))
        assertThat(review.code).isEqualTo("NO_ACTIVE_EVIDENCE")
        assertThat(bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 3, "status" to "REJECTED")).status).isEqualTo(200)
    }

    @Test
    fun `저장한 시각은 자릿수가 고정되어 있다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("시각")
        assertThat(company["createdAt"].asString()).matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{6}Z")
        val event = alice.get("/api/changes?targetId=${company.id}").body["items"][0]
        assertThat(event["at"].asString()).hasSize(27)
    }
}
