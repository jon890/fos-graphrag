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
import java.net.URLEncoder
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
        val found = alice.get("/api/nodes?q=${URLEncoder.encode("warren buffett", Charsets.UTF_8)}&types=Person").body["items"]
            .filter { it["label"].asString() == "워런 버핏" }
        assertThat(found).describedAs("초기 데이터의 워런 버핏").hasSize(1)

        val buffett = found.single()
        assertThat(buffett["properties"]["role"].asString()).isEqualTo("INVESTOR")
        val first = alice.get("/api/changes?targetId=${buffett.id}").body["items"].last()
        assertThat(first["action"].asString()).isEqualTo("CREATE")
        assertThat(first["actor"] == null || first["actor"].isNull).describedAs("system 작업자는 사용자로 보이지 않는다: ${first["actor"]}").isTrue()

        assertThat(count("MATCH (s:SeedRun {key: 'investing-basics-2026-10'}) RETURN count(s) AS c")).isEqualTo(1)

        val marginId = conceptId("안전마진")
        val related = alice.get("/api/nodes/$marginId").body["relationships"].toList()
            .filter { it["type"].asString() == "RELATED_TO" }
            .map { it["to"]["label"].asString() }
        assertThat(related).contains("내재가치")
    }

    @Test
    fun `다시 돌려도 새로 만들지 않는다`() {
        assertThat(seeds.run()).describedAs("이미 적용한 파일은 건너뛴다").isZero()

        assertThat(count("MATCH (n:Knowledge:Person {name: '워런 버핏', archived: false}) RETURN count(n) AS c")).isEqualTo(1)
        assertThat(count("MATCH (s:SeedRun {key: 'investing-basics-2026-10'}) RETURN count(s) AS c")).isEqualTo(1)
    }

    @Test
    fun `이미 있는 관계를 다시 적은 파일도 적용된다`() {
        val key = "test-dup-${UUID.randomUUID().toString().take(8)}"
        val file = SeedFile(
            key = key,
            nodes = listOf(
                SeedNode("a", "Concept", mapOf("name" to "안전마진", "summary" to "내재가치보다 충분히 낮은 값에 사서 판단 착오에 대비하는 여유")),
                SeedNode("b", "Concept", mapOf("name" to "내재가치", "summary" to "기업이 앞으로 벌어들일 현금을 지금 가치로 할인한 값")),
            ),
            relationships = listOf(SeedRelationship("RELATED_TO", "a", "b")),
        )

        seeds.applyInTransaction(file)

        assertThat(count("MATCH (s:SeedRun {key: '$key'}) RETURN count(s) AS c")).isEqualTo(1)
        assertThat(
            count(
                "MATCH (:Knowledge:Concept {name: '안전마진', archived: false})-[r:RELATED_TO]->(:Knowledge:Concept {name: '내재가치', archived: false}) " +
                    "WHERE r.archived = false RETURN count(r) AS c",
            ),
        ).describedAs("두 개념 사이의 RELATED_TO").isEqualTo(1)
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

    private fun conceptId(name: String): String =
        neo4j.query("MATCH (n:Knowledge:Concept {name: \$name, archived: false}) RETURN n.id AS id").bind(name).to("name")
            .fetch().one().map { it["id"] as String }.orElseThrow()
}
