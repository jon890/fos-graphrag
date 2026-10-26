package dev.fos.workbench.knowledge

import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.Neo4jChangeEventRecorder
import dev.fos.workbench.ontology.NodeTypeDef
import dev.fos.workbench.ontology.OntologyLoader
import dev.fos.workbench.ontology.OntologyVersionStore
import dev.fos.workbench.ontology.PropertyDef
import dev.fos.workbench.ontology.PropertyType
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.data.neo4j.core.Neo4jClient
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * 이력 기록이 실패하면 데이터 변경도 롤백되는지 실제 Neo4j 로 확인한다.
 * 기록기는 진짜 Neo4j 기록기를 감싸고, 실패 스위치가 켜졌을 때만 예외를 던진다.
 */
@Import(TransactionConsistencyIntegrationTest.FailingRecorderConfig::class)
class TransactionConsistencyIntegrationTest : IntegrationTest() {

    class SwitchableRecorder(private val delegate: ChangeEventRecorder) : ChangeEventRecorder {
        @Volatile var fail = false

        override fun record(event: ChangeEventDraft) {
            delegate.record(event)
            if (fail) throw IllegalStateException("이력 저장 실패를 흉내 낸다")
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    class FailingRecorderConfig {
        @Bean
        @Primary
        fun switchableRecorder(client: Neo4jClient, mapper: JsonMapper) = SwitchableRecorder(Neo4jChangeEventRecorder(client, mapper))
    }

    @org.springframework.beans.factory.annotation.Autowired
    lateinit var recorder: SwitchableRecorder

    @org.springframework.beans.factory.annotation.Autowired
    lateinit var versions: OntologyVersionStore

    @Test
    fun `이력 기록이 실패하면 노드 변경도 남지 않는다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("롤백대상")

        recorder.fail = true
        try {
            val response = alice.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("country" to "US")))
            assertThat(response.status).isEqualTo(500)
        } finally {
            recorder.fail = false
        }

        val current = alice.get("/api/nodes/${company.id}").body["node"]
        assertThat(current["revision"].asLong()).isEqualTo(1)
        assertThat(current["properties"]["country"].asString()).isEqualTo("KR")
        assertThat(alice.get("/api/changes?targetId=${company.id}").body["totalItems"].asLong()).isEqualTo(1)
        // 잠금 표시도 롤백되어 남지 않는다
        val lock = neo4j.query("MATCH (n:Knowledge {id: \$id}) RETURN n._lock AS lock").bind(company.id).to("id").fetch().one().get()
        assertThat(lock["lock"]).isNull()
    }

    @Test
    fun `온톨로지 저장에서 이력 기록이 실패하면 버전도 holder 도 그대로다`() {
        val admin = loggedIn(ADMIN)
        // 다른 테스트 클래스의 컨텍스트가 버전을 올렸을 수 있어 정의와 번호는 DB 의 최신 버전에서 읽는다
        val latest = versions.latest()!!
        val type = "Rollback" + UUID.randomUUID().toString().filter { it.isLetter() }.uppercase().take(6)
        val def = NodeTypeDef(
            label = "롤백", description = "x", labelProperty = "title",
            properties = mapOf("title" to PropertyDef(PropertyType.STRING, label = "제목", required = true)),
        )
        val yaml = OntologyLoader.toYaml(latest.ontology.copy(nodeTypes = latest.ontology.nodeTypes + (type to def)))
        val before = state(admin)

        recorder.fail = true
        try {
            val response = admin.post("/api/ontology/versions", mapOf("baseVersion" to latest.version, "yaml" to yaml))
            assertThat(response.status).describedAs(response.body.toString()).isEqualTo(500)
        } finally {
            recorder.fail = false
        }

        assertThat(state(admin)).isEqualTo(before)
    }

    /** GET /api/ontology 의 version, OntologyHead 의 번호, OntologyVersion 개수 */
    private fun state(admin: ApiClient): Triple<Int, Long, Long> {
        val head = neo4j.query("MATCH (h:OntologyHead {key: 'ontology'}) RETURN h.version AS c").fetch().one().map { (it["c"] as Number).toLong() }.get()
        val count = neo4j.query("MATCH (v:OntologyVersion) RETURN count(v) AS c").fetch().one().map { (it["c"] as Number).toLong() }.get()
        return Triple(admin.get("/api/ontology").body["version"].asInt(), head, count)
    }

    @Test
    fun `Claim 생성 중 이력이 실패하면 Claim 과 연결 관계가 모두 남지 않는다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val supplier = fx.company("공급사")
        val customer = fx.sector("반도체")
        val document = fx.document("사업보고서")

        recorder.fail = true
        try {
            assertThat(fx.claim("BELONGS_TO_SECTOR", supplier.id, customer.id, listOf(document.id)).status).isEqualTo(500)
        } finally {
            recorder.fail = false
        }
        val count = neo4j.query("MATCH (c:Claim)-[:SUBJECT]->(:Knowledge {id: \$id}) RETURN count(c) AS n").bind(supplier.id).to("id")
            .fetch().one().get()["n"] as Long
        assertThat(count).isZero()
    }
}
