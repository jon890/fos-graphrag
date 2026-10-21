package dev.fos.workbench.knowledge

import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired

class LegacyValueCleanupIntegrationTest : IntegrationTest() {

    @Autowired lateinit var cleanup: LegacyValueCleanup

    @Test
    fun `목록 밖 국가와 통화를 고치고 system 이력을 남긴다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val company = fx.company("가상전자").id
        val security = fx.security("가상전자 보통주").id
        setProp(company, "country", " 한국 ")
        setProp(security, "currency", "원")

        assertThat(cleanup.run()).isGreaterThanOrEqualTo(2)

        assertThat(stored(company)).containsEntry("country", "KR").containsEntry("revision", 2L)
        assertThat(stored(security)).containsEntry("currency", "KRW").containsEntry("revision", 2L)

        val latest = alice.get("/api/changes?targetId=$company").body["items"][0]
        assertThat(latest["action"].asString()).isEqualTo("UPDATE")
        assertThat(latest["actor"] == null || latest["actor"].isNull).describedAs("system 작업자는 사용자로 보이지 않는다: ${latest["actor"]}").isTrue()
        assertThat(latest["note"].asString()).isEqualTo("온톨로지 목록에 맞춰 예전 값을 고쳤다")
        assertThat(latest["changes"]["country"]["before"].asString()).isEqualTo(" 한국 ")
        assertThat(latest["changes"]["country"]["after"].asString()).isEqualTo("KR")
    }

    @Test
    fun `다시 돌려도 바꾸지 않고, 맞지 않는 값과 보관된 노드와 처음부터 enum 이던 속성은 그대로 둔다`() {
        val fx = Fixtures(loggedIn(ALICE))
        val fixable = fx.company("가상전자").id
        val unknown = fx.company("가상물산").id
        val archived = fx.company("가상보관").id
        val listed = fx.security("가상전자 보통주").id
        setProp(fixable, "country", "한국")
        setProp(unknown, "country", "루피아")
        setProp(archived, "country", "한국")
        neo4j.query("MATCH (n:Knowledge {id: \$id}) SET n.archived = true").bind(archived).to("id").run()
        setProp(listed, "market", "krx_kospi")
        val untouched = listOf(unknown, archived, listed).associateWith { stored(it) }

        cleanup.run()
        assertThat(stored(fixable)).containsEntry("country", "KR").containsEntry("revision", 2L)

        cleanup.run()
        assertThat(stored(fixable)).describedAs("두 번째 정리는 고친 노드를 다시 고치지 않는다").containsEntry("revision", 2L)
        untouched.forEach { (id, before) ->
            assertThat(stored(id)).describedAs("정리 대상이 아닌 노드 $id").isEqualTo(before)
        }
        assertThat(stored(unknown)).containsEntry("country", "루피아").containsEntry("revision", 1L)
        assertThat(stored(archived)).containsEntry("country", "한국").containsEntry("revision", 1L)
        assertThat(stored(listed)).containsEntry("market", "krx_kospi").containsEntry("revision", 1L)
    }

    private fun setProp(id: String, prop: String, value: String) {
        // 속성 이름은 이 테스트가 정한 상수다
        neo4j.query("MATCH (n:Knowledge {id: \$id}) SET n.`$prop` = \$v").bindAll(mapOf("id" to id, "v" to value)).run()
    }

    @Suppress("UNCHECKED_CAST")
    private fun stored(id: String): Map<String, Any?> =
        neo4j.query("MATCH (n:Knowledge {id: \$id}) RETURN properties(n) AS n").bind(id).to("id")
            .fetch().one().map { it["n"] as Map<String, Any?> }.orElseThrow()
}
