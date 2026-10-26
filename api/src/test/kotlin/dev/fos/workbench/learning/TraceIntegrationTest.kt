package dev.fos.workbench.learning

import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode

class TraceIntegrationTest : IntegrationTest() {

    /** 변화 → 병목 ← 산업, 병목 → 기업 → 종목 → 결정, 기업 → 밸류에이션. 병목에 근거 문서, 밸류에이션에 개념, 기업에 초안 주장 */
    private inner class Chain(val client: ApiClient) {
        val fx = Fixtures(client)
        val change = fx.node("Change", mapOf("title" to "변화-${fx.suffix}", "category" to "TECHNOLOGY"))
        val sector = fx.sector("산업")
        val bottleneck = fx.node("Bottleneck", mapOf("title" to "병목-${fx.suffix}", "status" to "HYPOTHESIS"))
        val company = fx.company("기업")
        val security = fx.security("기업 보통주")
        val valuation = fx.node("Valuation", mapOf("title" to "밸류에이션-${fx.suffix}", "currentPrice" to 100))
        val decision = fx.node("Decision", mapOf("title" to "결정-${fx.suffix}", "action" to "BUY"))
        val document = fx.document("병목 근거")
        val concept = fx.node("Concept", mapOf("name" to "개념-${fx.suffix}", "summary" to "합성 개념"))
        val creates = link(client, "CREATES", change.id, bottleneck.id)
        val hasBottleneck = link(client, "HAS_BOTTLENECK", sector.id, bottleneck.id)
        val benefits = link(client, "BENEFITS", bottleneck.id, company.id)
        val issues = link(client, "ISSUES", company.id, security.id)
        val hasValuation = link(client, "HAS_VALUATION", company.id, valuation.id)
        val hasDecision = link(client, "HAS_DECISION", security.id, decision.id)

        init {
            link(client, "EVIDENCED_BY", bottleneck.id, document.id)
            link(client, "USES_CONCEPT", valuation.id, concept.id)
            val claim = fx.claim("BELONGS_TO_SECTOR", company.id, sector.id, listOf(fx.document("주장 근거").id))
            assertThat(claim.status).describedAs(claim.body.toString()).isEqualTo(201)
        }
    }

    private fun link(client: ApiClient, type: String, fromId: String, toId: String): JsonNode {
        val response = client.post("/api/relationships", mapOf("type" to type, "fromId" to fromId, "toId" to toId))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return response.body
    }

    private fun trace(client: ApiClient, id: String): JsonNode {
        val response = client.get("/api/nodes/$id/trace")
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        return response.body
    }

    private fun stepIds(view: JsonNode): List<String> = view["steps"].toList().map { it["node"]["id"].asString() }

    private fun step(view: JsonNode, nodeId: String): JsonNode =
        view["steps"].firstOrNull { it["node"]["id"].asString() == nodeId }
            ?: throw AssertionError("단계에 $nodeId 가 없다: ${stepIds(view)}")

    private fun summary(client: ApiClient): JsonNode {
        val response = client.get("/api/me/knowledge/summary")
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        return response.body
    }

    private fun mark(client: ApiClient, id: String, level: String) {
        val response = client.send("PUT", "/api/me/knowledge/$id", mapOf("level" to level))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
    }

    @Test
    fun `결정에서 근거 단계를 깊이 순서로 모으고 단계마다 상태와 근거를 붙인다`() {
        val c = Chain(loggedIn(ALICE))
        val view = trace(c.client, c.decision.id)

        assertThat(view["rootId"].asString()).isEqualTo(c.decision.id)
        assertThat(stepIds(view)).containsExactly(c.decision.id, c.security.id, c.company.id, c.bottleneck.id, c.change.id, c.sector.id)
        assertThat(view["steps"].toList().map { it["depth"].asInt() }).containsExactly(0, 1, 2, 3, 4, 4)
        assertThat(view["truncated"].asBoolean()).isFalse()
        assertThat(view["limits"]["maxDepth"].asInt()).isEqualTo(6)
        assertThat(view["limits"]["maxSteps"].asInt()).isEqualTo(60)

        val root = view["steps"][0]
        assertThat(root.has("childId")).isTrue()
        assertThat(root["childId"].isNull).isTrue()
        assertThat(root["relationshipType"].isNull).isTrue()

        val security = step(view, c.security.id)
        assertThat(security["childId"].asString()).isEqualTo(c.decision.id)
        assertThat(security["relationshipType"].asString()).isEqualTo("HAS_DECISION")
        assertThat(security["relationshipId"].asString()).isEqualTo(c.hasDecision.id)

        val bottleneck = step(view, c.bottleneck.id)
        assertThat(bottleneck["status"].asString()).isEqualTo("SUPPORTED")
        assertThat(bottleneck["documents"].toList().map { it["id"].asString() }).containsExactly(c.document.id)
        val company = step(view, c.company.id)
        assertThat(company["status"].asString()).isEqualTo("PARTIAL")
        assertThat(company["claims"].toList().map { it["predicate"].asString() }).containsExactly("BELONGS_TO_SECTOR")
        assertThat(company["claims"][0]["reviewStatus"].asString()).isEqualTo("DRAFT")
        assertThat(step(view, c.change.id)["status"].asString()).isEqualTo("MISSING")
        // 근거 문서와 개념은 붙는 것이지 단계가 아니다
        assertThat(stepIds(view)).doesNotContain(c.document.id, c.concept.id, c.valuation.id)
    }

    @Test
    fun `잇지 않은 관계를 후보와 함께 알려 주고 이으면 사라진다`() {
        val c = Chain(loggedIn(ALICE))
        val before = step(trace(c.client, c.decision.id), c.decision.id)
        val basedOn = before["missing"].toList().firstOrNull { it["relationshipType"].asString() == "BASED_ON" }
            ?: throw AssertionError("결정의 missing 에 BASED_ON 이 없다: ${before["missing"]}")
        assertThat(basedOn["candidates"].toList().map { it["id"].asString() }).contains(c.valuation.id)
        assertThat(before["missing"].toList().map { it["relationshipType"].asString() }).doesNotContain("HAS_DECISION")

        link(c.client, "BASED_ON", c.valuation.id, c.decision.id)
        val after = trace(c.client, c.decision.id)
        for (s in after["steps"]) {
            assertThat(s["missing"].size()).describedAs("${s["node"]["type"].asString()} 의 missing: ${s["missing"]}").isEqualTo(0)
        }
        val valuation = step(after, c.valuation.id)
        assertThat(valuation["depth"].asInt()).isEqualTo(1)
        assertThat(valuation["concepts"].toList().map { it["id"].asString() }).containsExactly(c.concept.id)
        assertThat(after["steps"].toList().map { it["depth"].asInt() }).isSorted()
    }

    @Test
    fun `보관한 관계는 따라가지 않고 보관했거나 없는 항목은 404 다`() {
        val c = Chain(loggedIn(ALICE))
        val archived = c.client.post("/api/relationships/${c.hasBottleneck.id}/archive", mapOf("expectedRevision" to c.hasBottleneck.revision))
        assertThat(archived.status).describedAs(archived.body.toString()).isEqualTo(200)
        assertThat(stepIds(trace(c.client, c.decision.id))).contains(c.change.id).doesNotContain(c.sector.id)

        val archivedDecision = c.client.post("/api/nodes/${c.decision.id}/archive", mapOf("expectedRevision" to c.decision.revision))
        assertThat(archivedDecision.status).describedAs(archivedDecision.body.toString()).isEqualTo(200)
        val gone = c.client.get("/api/nodes/${c.decision.id}/trace")
        assertThat(gone.status).isEqualTo(404)
        assertThat(gone.code).isEqualTo("NOT_FOUND")

        assertThat(c.client.get("/api/nodes/00000000-0000-0000-0000-000000000000/trace").status).isEqualTo(404)
    }

    @Test
    fun `단계의 이해 표시는 요청한 사람 것만 담는다`() {
        val c = Chain(loggedIn(ALICE))
        val viewer = loggedIn(VIEWER)
        mark(viewer, c.bottleneck.id, "UNSURE")

        val mine = step(trace(viewer, c.decision.id), c.bottleneck.id)
        assertThat(mine["knowledge"]["level"].asString()).isEqualTo("UNSURE")
        assertThat(mine["knowledge"]["nodeId"].asString()).isEqualTo(c.bottleneck.id)

        val editors = step(trace(c.client, c.decision.id), c.bottleneck.id)
        assertThat(editors.has("knowledge")).isTrue()
        assertThat(editors["knowledge"].isNull).describedAs(editors["knowledge"].toString()).isTrue()
    }

    @Test
    fun `아래쪽 항목은 지금 항목에서 나가는 관계의 끝이다`() {
        val c = Chain(loggedIn(ALICE))
        val view = trace(c.client, c.company.id)
        assertThat(view["dependents"].toList().map { it["node"]["id"].asString() }).containsExactly(c.security.id, c.valuation.id)
        assertThat(view["dependents"].toList().map { it["relationshipId"].asString() }).containsExactly(c.issues.id, c.hasValuation.id)
        assertThat(view["dependentsTruncated"].asBoolean()).isFalse()
    }

    @Test
    fun `단계가 60개를 넘으면 60개까지만 담고 잘림을 알린다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val bottleneck = fx.node("Bottleneck", mapOf("title" to "한도 병목-${fx.suffix}", "status" to "HYPOTHESIS"))
        repeat(60) { i ->
            val change = fx.node("Change", mapOf("title" to "한도 변화 $i-${fx.suffix}", "category" to "TECHNOLOGY"))
            link(alice, "CREATES", change.id, bottleneck.id)
        }
        val view = trace(alice, bottleneck.id)
        assertThat(view["truncated"].asBoolean()).isTrue()
        assertThat(view["steps"].size()).isEqualTo(60)
        assertThat(view["steps"][0]["node"]["id"].asString()).isEqualTo(bottleneck.id)
    }

    @Test
    fun `모든 단계를 KNOWN 으로 표시한 결정만 이해한 결정으로 세고 다른 사람의 요약은 그대로다`() {
        val alice = loggedIn(ALICE)
        val c = Chain(alice)
        val viewer = loggedIn(VIEWER)
        val steps = stepIds(trace(viewer, c.decision.id))
        val viewerBefore = summary(viewer)
        val aliceBefore = summary(alice)
        assertThat(viewerBefore["counts"].propertyNames().asSequence().toList()).containsExactlyInAnyOrder("KNOWN", "UNSURE", "LEARNING")
        assertThat(viewerBefore["decisionsTruncated"].asBoolean()).isFalse()

        // 하나만 빠져도 세지 않는다
        steps.dropLast(1).forEach { mark(viewer, it, "KNOWN") }
        mark(viewer, steps.last(), "UNSURE")
        val partial = summary(viewer)
        assertThat(partial["decisions"]["understood"].asLong()).isEqualTo(viewerBefore["decisions"]["understood"].asLong())
        assertThat(partial["counts"]["KNOWN"].asLong()).isEqualTo(viewerBefore["counts"]["KNOWN"].asLong() + steps.size - 1)

        mark(viewer, steps.last(), "KNOWN")
        val after = summary(viewer)
        assertThat(after["decisions"]["understood"].asLong()).isEqualTo(viewerBefore["decisions"]["understood"].asLong() + 1)
        assertThat(after["decisions"]["total"].asLong()).isGreaterThanOrEqualTo(after["decisions"]["understood"].asLong())

        val aliceAfter = summary(alice)
        assertThat(aliceAfter["counts"]).isEqualTo(aliceBefore["counts"])
        assertThat(aliceAfter["decisions"]["understood"].asLong()).isEqualTo(aliceBefore["decisions"]["understood"].asLong())
    }
}
