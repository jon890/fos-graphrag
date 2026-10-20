package dev.fos.workbench.knowledge

import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.Neo4jChangeEventRecorder
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
    fun `Claim 생성 중 이력이 실패하면 Claim 과 연결 관계가 모두 남지 않는다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val supplier = fx.company("공급사")
        val customer = fx.company("고객사")
        val document = fx.document("사업보고서")

        recorder.fail = true
        try {
            assertThat(fx.claim("SUPPLIES_TO", supplier.id, customer.id, listOf(document.id)).status).isEqualTo(500)
        } finally {
            recorder.fail = false
        }
        val count = neo4j.query("MATCH (c:Claim)-[:SUBJECT]->(:Knowledge {id: \$id}) RETURN count(c) AS n").bind(supplier.id).to("id")
            .fetch().one().get()["n"] as Long
        assertThat(count).isZero()
    }
}
