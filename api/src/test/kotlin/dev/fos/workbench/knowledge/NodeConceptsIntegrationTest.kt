package dev.fos.workbench.knowledge

import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class NodeConceptsIntegrationTest : IntegrationTest() {

    @Test
    fun `상세의 concepts 는 개념으로 나가는 보관되지 않은 관계의 끝을 만든 순서로 담는다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val valuation = fx.node("Valuation", mapOf("title" to "밸류에이션-${fx.suffix}", "currentPrice" to 10000))
        val dcf = fx.node("Concept", mapOf("name" to "DCF-${fx.suffix}", "summary" to "현금흐름을 할인해 더한 가치"))
        val per = fx.node("Concept", mapOf("name" to "PER-${fx.suffix}", "summary" to "주가를 주당순이익으로 나눈 값"))
        val toDcf = alice.post("/api/relationships", mapOf("type" to "USES_CONCEPT", "fromId" to valuation.id, "toId" to dcf.id))
        assertThat(toDcf.status).describedAs(toDcf.body.toString()).isEqualTo(201)
        val toPer = alice.post("/api/relationships", mapOf("type" to "USES_CONCEPT", "fromId" to valuation.id, "toId" to per.id))
        assertThat(toPer.status).isEqualTo(201)

        val detail = alice.get("/api/nodes/${valuation.id}")
        assertThat(detail.status).isEqualTo(200)
        val concepts = detail.body["concepts"]
        assertThat(concepts.toList().map { it["id"].asString() }).containsExactly(dcf.id, per.id)
        assertThat(concepts[0]["label"].asString()).isEqualTo("DCF-${fx.suffix}")
        assertThat(concepts[0]["summary"].asString()).isEqualTo("현금흐름을 할인해 더한 가치")
        assertThat(concepts[0]["relationshipType"].asString()).isEqualTo("USES_CONCEPT")
        assertThat(concepts[1]["summary"].asString()).isEqualTo("주가를 주당순이익으로 나눈 값")

        val archivedLink = alice.post("/api/relationships/${toDcf.body.id}/archive", mapOf("expectedRevision" to toDcf.body.revision))
        assertThat(archivedLink.status).describedAs(archivedLink.body.toString()).isEqualTo(200)
        assertThat(alice.get("/api/nodes/${valuation.id}").body["concepts"].toList().map { it["id"].asString() }).containsExactly(per.id)

        val archivedConcept = alice.post("/api/nodes/${per.id}/archive", mapOf("expectedRevision" to per.revision))
        assertThat(archivedConcept.status).describedAs(archivedConcept.body.toString()).isEqualTo(200)
        assertThat(alice.get("/api/nodes/${valuation.id}").body["concepts"].size()).isEqualTo(0)
    }

    @Test
    fun `주장이 개념을 대상으로 삼아도 주장 관계는 상세의 concepts 에 담지 않는다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val person = fx.node("Person", mapOf("name" to "투자자-${fx.suffix}"))
        val concept = fx.node("Concept", mapOf("name" to "안전마진-${fx.suffix}", "summary" to "가치와 가격의 차이"))
        val document = fx.document("인터뷰")
        val claim = fx.claim("ADVOCATES", person.id, concept.id, listOf(document.id))
        assertThat(claim.status).describedAs(claim.body.toString()).isEqualTo(201)

        val detail = alice.get("/api/nodes/${claim.body.id}")
        assertThat(detail.status).describedAs(detail.body.toString()).isEqualTo(200)
        assertThat(detail.body["concepts"].toList()).describedAs(detail.body["concepts"].toString()).isEmpty()
    }
}
