package dev.fos.workbench.knowledge

import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.web.OntologyViolationException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.PlatformTransactionManager
import java.util.UUID

class SeedLoaderIntegrationTest : IntegrationTest() {

    @Autowired lateinit var seeds: SeedLoader
    @Autowired lateinit var nodes: NodeService
    @Autowired lateinit var relationships: RelationshipService
    @Autowired lateinit var holder: OntologyHolder
    @Autowired lateinit var transactionManager: PlatformTransactionManager

    @Test
    fun `시작할 때 초기 데이터가 들어가고 이력은 system 이다`() {
        val alice = loggedIn(ALICE)
        val found = alice.get("/api/nodes?q=FLNC&types=Security").body["items"]
            .filter { it["label"].asString() == "Fluence Energy Class A" }
        assertThat(found).describedAs("초기 데이터의 FLNC 종목").hasSize(1)

        val flnc = found.single()
        val first = alice.get("/api/changes?targetId=${flnc.id}").body["items"].last()
        assertThat(first["action"].asString()).isEqualTo("CREATE")
        assertThat(first["actor"] == null || first["actor"].isNull).describedAs("system 작업자는 사용자로 보이지 않는다: ${first["actor"]}").isTrue()

        assertThat(count("MATCH (s:SeedRun {key: 'investment-logic-2026-10'}) RETURN count(s) AS c")).isEqualTo(1)

        val decision = alice.get("/api/nodes?q=FLNC+첫+매수&types=Decision").body["items"]
            .single { it["label"].asString() == "FLNC 첫 매수" }
        val related = alice.get("/api/nodes/${decision.id}").body["relationships"].toList()
            .filter { it["type"].asString() == "HAS_DECISION" }
            .map { it["from"]["label"].asString() }
        assertThat(related).contains("Fluence Energy Class A")
    }

    @Test
    fun `다시 돌려도 새로 만들지 않는다`() {
        assertThat(seeds.run()).describedAs("이미 적용한 파일은 건너뛴다").isZero()

        assertThat(count("MATCH (n:Knowledge:Company {name: 'Fluence Energy', archived: false}) RETURN count(n) AS c")).isEqualTo(1)
        assertThat(count("MATCH (s:SeedRun {key: 'investment-logic-2026-10'}) RETURN count(s) AS c")).isEqualTo(1)
    }

    @Test
    fun `이미 있는 관계를 다시 적은 파일도 적용된다`() {
        val key = "test-dup-${UUID.randomUUID().toString().take(8)}"
        val relationshipCount =
            "MATCH (:Knowledge:Company {name: 'Fluence Energy', archived: false})-[r:HAS_VALUATION]->(:Knowledge:Valuation {title: 'FLNC 간이 DCF (Valley AI 화면)', archived: false}) " +
                "WHERE r.archived = false RETURN count(r) AS c"
        val file = SeedFile(
            key = key,
            nodes = listOf(
                SeedNode("a", "Company", mapOf("name" to "Fluence Energy", "country" to "US")),
                SeedNode("b", "Valuation", mapOf("title" to "FLNC 간이 DCF (Valley AI 화면)", "currentPrice" to 22.10, "currency" to "USD", "method" to "DCF")),
            ),
            relationships = listOf(SeedRelationship("HAS_VALUATION", "a", "b")),
        )

        assertThat(count(relationshipCount)).describedAs("적용 전 Fluence Energy 와 FLNC 간이 DCF 사이의 HAS_VALUATION").isEqualTo(1)
        seeds.applyInTransaction(file)

        assertThat(count("MATCH (s:SeedRun {key: '$key'}) RETURN count(s) AS c")).isEqualTo(1)
        assertThat(count(relationshipCount)).describedAs("적용 후 Fluence Energy 와 FLNC 간이 DCF 사이의 HAS_VALUATION").isEqualTo(1)
    }

    @Test
    fun `초기 데이터의 사슬이 모두 들어간다`() {
        assertThat(
            count(
                "MATCH (:Knowledge:Decision {title: 'FLNC 첫 매수', archived: false})<-[:HAS_DECISION]-(:Knowledge:Security)<-[:ISSUES]-(:Knowledge:Company)<-[:BENEFITS]-(:Knowledge:Bottleneck)<-[:CREATES]-(:Knowledge:Change) RETURN count(*) AS c",
            ),
        ).isEqualTo(1)
        val kinds = neo4j.query(
            "MATCH (:Knowledge:Company {name: 'Fluence Energy', archived: false})-[:HAS_VALUATION]->(:Knowledge:Valuation)-[:HAS_SCENARIO]->(s:Knowledge:Scenario) RETURN s.kind AS kind",
        ).fetch().all().map { it["kind"] as String }
        assertThat(kinds).contains("BEAR", "BASE", "BULL")
    }

    @Test
    fun `파일 안에서 실패하면 그 파일의 노드와 적용 기록이 남지 않는다`() {
        val suffix = UUID.randomUUID().toString().take(8)
        val key = "test-fail-$suffix"
        val file = SeedFile(
            key = key,
            nodes = listOf(
                SeedNode("a", "Concept", mapOf("name" to "롤백개념-$suffix", "summary" to "테스트")),
                SeedNode("b", "Concept", mapOf("name" to "필수값없음-$suffix")),
            ),
        )

        assertThrows<RuntimeException> { seeds.applyInTransaction(file) }

        assertThat(count("MATCH (s:SeedRun {key: '$key'}) RETURN count(s) AS c")).isZero()
        assertThat(count("MATCH (n:Knowledge {name: '롤백개념-$suffix'}) RETURN count(n) AS c")).describedAs("롤백된 노드").isZero()
    }

    @Test
    fun `최신 버전에 없는 타입을 쓰는 파일은 적용하지 않고 기록도 남기지 않는다`() {
        val key = "test-unknown-${UUID.randomUUID().toString().take(8)}"
        val file = SeedFile(key = key, nodes = listOf(SeedNode("a", "NoSuchType", mapOf("name" to "x"))))

        assertThrows<OntologyViolationException> { seeds.applyInTransaction(file) }

        assertThat(count("MATCH (s:SeedRun {key: '$key'}) RETURN count(s) AS c")).isZero()
    }

    @Test
    fun `같은 이름이 이미 있으면 그 노드를 쓴다`() {
        val alice = loggedIn(ALICE)
        val suffix = Fixtures(alice).suffix
        val created = alice.post(
            "/api/nodes",
            mapOf("type" to "Concept", "properties" to mapOf("name" to "테스트개념-$suffix", "summary" to "테스트")),
        )
        assertThat(created.status).describedAs(created.body.toString()).isEqualTo(201)

        assertThat(seeds.findExisting("Concept", "테스트개념-${suffix.uppercase()}")).isEqualTo(created.body.id)
        assertThat(seeds.findExisting("Person", "테스트개념-$suffix")).describedAs("다른 타입").isNull()

        alice.post("/api/nodes/${created.body.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(seeds.findExisting("Concept", "테스트개념-$suffix")).describedAs("보관된 노드").isNull()
    }

    @Test
    fun `seeds enabled 가 false 이면 아무것도 하지 않는다`() {
        val disabled = SeedLoader(neo4j, nodes, relationships, holder, WorkbenchProperties(seeds = WorkbenchProperties.Seeds(enabled = false)), transactionManager)

        assertThat(disabled.run()).isZero()
    }

    private fun count(cypher: String): Long = neo4j.query(cypher).fetch().one().map { (it["c"] as Number).toLong() }.orElse(0L)

}
