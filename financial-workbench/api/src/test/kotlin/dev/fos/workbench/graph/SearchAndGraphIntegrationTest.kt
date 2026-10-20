package dev.fos.workbench.graph

import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.test.context.TestPropertySource
import java.net.URLEncoder

@TestPropertySource(
    properties = [
        "workbench.graph.max-nodes=5", "workbench.graph.max-relationships=6",
        "workbench.detail.max-relationships=3", "workbench.detail.max-claims=2",
    ],
)
class SearchAndGraphIntegrationTest : IntegrationTest() {

    private fun q(s: String) = URLEncoder.encode(s, Charsets.UTF_8)

    @Test
    fun `보관한 노드는 기본 검색에서 빠지고 보관 포함 검색에 나온다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val company = fx.company("검색대상")
        val name = company["label"].asString()

        assertThat(alice.get("/api/nodes?q=${q(name)}").body["totalItems"].asLong()).isEqualTo(1)
        alice.post("/api/nodes/${company.id}/archive", mapOf("expectedRevision" to 1))

        assertThat(alice.get("/api/nodes?q=${q(name)}").body["totalItems"].asLong()).isZero()
        val withArchived = alice.get("/api/nodes?q=${q(name)}&includeArchived=true").body
        assertThat(withArchived["items"][0]["archived"].asBoolean()).isTrue()
    }

    @Test
    fun `종목 코드와 타입으로 찾는다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val security = fx.security("검색종목", ticker = "Q${fx.suffix}")
        val byTicker = alice.get("/api/nodes?q=${q("q" + fx.suffix)}&types=Security").body
        assertThat(byTicker["items"].toList().map { it["id"].asString() }).containsExactly(security.id)
        assertThat(alice.get("/api/nodes?q=${q("q" + fx.suffix)}&types=Company").body["totalItems"].asLong()).isZero()
        assertThat(alice.get("/api/nodes?types=Account").code).isEqualTo("ONTOLOGY_VIOLATION")
    }

    @Test
    fun `페이지 크기는 100 을 넘을 수 없다`() {
        val alice = loggedIn(ALICE)
        assertThat(alice.get("/api/nodes?size=101").code).isEqualTo("VALIDATION_FAILED")
        assertThat(alice.get("/api/nodes?page=-1").code).isEqualTo("VALIDATION_FAILED")
    }

    @Test
    fun `주변 그래프는 홉 수와 노드 수를 제한하고 잘림을 표시한다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val center = fx.company("중심")
        repeat(10) { i ->
            val security = fx.security("종목$i", ticker = "N${fx.suffix}$i")
            alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to center.id, "toId" to security.id))
        }

        assertThat(alice.get("/api/graph/neighborhood?id=${center.id}&hops=3").code).isEqualTo("VALIDATION_FAILED")

        val graph = alice.get("/api/graph/neighborhood?id=${center.id}").body
        assertThat(graph["nodes"].size()).isEqualTo(5)
        assertThat(graph["truncated"].asBoolean()).isTrue()
        assertThat(graph["limits"]["maxNodes"].asInt()).isEqualTo(5)
        assertThat(graph["nodes"][0]["id"].asString()).isEqualTo(center.id)
        assertThat(graph["edges"].size()).isEqualTo(4)

        // 상세의 관계 목록도 상한까지만 주고 잘림을 표시한다
        val detail = alice.get("/api/nodes/${center.id}").body
        assertThat(detail["relationships"].size()).isEqualTo(3)
        assertThat(detail["relationshipsTruncated"].asBoolean()).isTrue()
        assertThat(detail["claimsTruncated"].asBoolean()).isFalse()
        assertThat(detail["limits"]["maxRelationships"].asInt()).isEqualTo(3)
    }

    @Test
    fun `필터는 경로 위 모든 노드에 적용되어 검토되지 않은 Claim 을 거친 이웃을 보이지 않는다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val a = fx.company("A")
        val b = fx.company("B")
        val c = fx.company("C")
        val d = fx.document("근거")
        fx.claim("SUPPLIES_TO", a.id, b.id, listOf(d.id))
        val reviewed = fx.claim("COMPETES_WITH", a.id, c.id, listOf(d.id)).body
        bob.post("/api/claims/${reviewed.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED"))

        val onlyReviewed = alice.get("/api/graph/neighborhood?id=${a.id}&hops=2&reviewStatus=REVIEWED&types=Company,Claim").body
        assertThat(onlyReviewed["nodes"].toList().map { it["id"].asString() })
            .containsExactlyInAnyOrder(a.id, reviewed.id, c.id)

        // 타입 필터도 경로 전체에 적용된다. Claim 을 빼면 Claim 을 거쳐야 닿는 기업도 보이지 않는다
        val companiesOnly = alice.get("/api/graph/neighborhood?id=${a.id}&hops=2&types=Company").body
        assertThat(companiesOnly["nodes"].toList().map { it["id"].asString() }).containsExactly(a.id)
    }

    @Test
    fun `보관된 이웃과 관계는 그래프에서 빠지고 2홉은 Claim 너머까지 본다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val supplier = fx.company("공급사")
        val customer = fx.company("고객사")
        val document = fx.document("보고서")
        val claim = fx.claim("SUPPLIES_TO", supplier.id, customer.id, listOf(document.id)).body

        val oneHop = alice.get("/api/graph/neighborhood?id=${supplier.id}").body
        assertThat(oneHop["truncated"].asBoolean()).isFalse()
        assertThat(oneHop["nodes"].toList().map { it["id"].asString() }).containsExactlyInAnyOrder(supplier.id, claim.id)

        val twoHops = alice.get("/api/graph/neighborhood?id=${supplier.id}&hops=2").body
        assertThat(twoHops["nodes"].toList().map { it["id"].asString() })
            .containsExactlyInAnyOrder(supplier.id, claim.id, customer.id, document.id)
        assertThat(twoHops["edges"].toList().map { it["type"].asString() }).containsExactlyInAnyOrder("SUBJECT", "OBJECT", "SUPPORTED_BY")

        val draftOnly = alice.get("/api/graph/neighborhood?id=${supplier.id}&reviewStatus=REVIEWED").body
        assertThat(draftOnly["nodes"].size()).isEqualTo(1)

        alice.post("/api/nodes/${claim.id}/archive", mapOf("expectedRevision" to 1))
        val afterArchive = alice.get("/api/graph/neighborhood?id=${supplier.id}&hops=2").body
        assertThat(afterArchive["nodes"].toList().map { it["id"].asString() }).containsExactly(supplier.id)

        alice.post("/api/nodes/${supplier.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(alice.get("/api/graph/neighborhood?id=${supplier.id}").status).isEqualTo(404)
    }

    @Test
    fun `검토 대기 목록은 보관되지 않은 DRAFT Claim 만 돌려준다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val a = fx.company("a")
        val b = fx.company("b")
        val d = fx.document("d")
        val draft = fx.claim("SUPPLIES_TO", a.id, b.id, listOf(d.id)).body
        val reviewed = fx.claim("COMPETES_WITH", a.id, b.id, listOf(d.id)).body
        val archived = fx.claim("SUPPLIES_TO", b.id, a.id, listOf(d.id)).body
        bob.post("/api/claims/${reviewed.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED"))
        alice.post("/api/nodes/${archived.id}/archive", mapOf("expectedRevision" to 1))

        val queue = alice.get("/api/claims?reviewStatus=DRAFT&size=100").body
        val ids = queue["items"].toList().map { it["id"].asString() }
        assertThat(ids).contains(draft.id).doesNotContain(reviewed.id, archived.id)
        assertThat(queue["items"].toList().all { it["reviewStatus"].asString() == "DRAFT" }).isTrue()
        assertThat(alice.get("/api/claims?reviewStatus=DONE").code).isEqualTo("VALIDATION_FAILED")
    }
}
