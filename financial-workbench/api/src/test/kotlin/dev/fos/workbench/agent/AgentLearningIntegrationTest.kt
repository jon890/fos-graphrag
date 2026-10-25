package dev.fos.workbench.agent

import dev.fos.workbench.auth.Role
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode

class AgentLearningIntegrationTest : IntegrationTest() {

    /** 조회 전용 사용자 한 명의 세션과 연동 토큰 */
    private class Viewer(val session: ApiClient, val token: String)

    private fun viewer(): Viewer {
        val session = loggedIn(newUser(Role.VIEWER))
        val response = session.post("/api/me/tokens", mapOf("name" to "Hermes"))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return Viewer(session, response.body["token"].asString())
    }

    private fun get(token: String, path: String): ApiClient.Response = anonymous().bearer("GET", path, token)

    private fun ok(token: String, path: String): JsonNode {
        val response = get(token, path)
        assertThat(response.status).describedAs("$path: ${response.body}").isEqualTo(200)
        return response.body
    }

    private fun relate(session: ApiClient, type: String, fromId: String, toId: String) {
        val response = session.post("/api/relationships", mapOf("type" to type, "fromId" to fromId, "toId" to toId))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
    }

    private fun archive(session: ApiClient, id: String) {
        val revision = session.get("/api/nodes/$id").body["node"]["revision"].asLong()
        val response = session.post("/api/nodes/$id/archive", mapOf("expectedRevision" to revision))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
    }

    private fun mark(session: ApiClient, id: String, level: String, note: String?) {
        val response = session.send("PUT", "/api/me/knowledge/$id", mapOf("level" to level, "note" to note))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
    }

    private fun label(node: JsonNode, key: String): String = node["properties"][key].asString()

    /** 기업이 종목을 발행하고, 종목에 결정이, 기업에 밸류에이션과 시나리오 둘(낙관, 비관 순서로 만듦)이 걸린 장면 */
    private class Scene(
        val alice: ApiClient,
        val company: JsonNode,
        val security: JsonNode,
        val decision: JsonNode,
        val valuation: JsonNode,
        val bull: JsonNode,
        val bear: JsonNode,
        val ticker: String,
        val reason: String,
    )

    private fun scene(): Scene {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val ticker = "ZQ" + fx.suffix.uppercase()
        val company = fx.company("종목찾기기업")
        val security = fx.node(
            "Security",
            mapOf("market" to "NASDAQ", "ticker" to ticker, "name" to "종목찾기 보통주-${fx.suffix}", "currency" to "USD"),
        )
        relate(alice, "ISSUES", company.id, security.id)
        val reason = "나".repeat(600)
        val decision = fx.node(
            "Decision",
            mapOf("title" to "첫 매수-${fx.suffix}", "action" to "BUY", "decidedAt" to "2026-09-14", "reason" to reason),
        )
        relate(alice, "HAS_DECISION", security.id, decision.id)
        val valuation = fx.node(
            "Valuation",
            mapOf("title" to "밸류에이션-${fx.suffix}", "currentPrice" to 12.5, "asOf" to "2026-09-14", "currency" to "USD"),
        )
        relate(alice, "HAS_VALUATION", company.id, valuation.id)
        val bull = fx.node("Scenario", mapOf("title" to "낙관-${fx.suffix}", "kind" to "BULL", "valuePerShare" to 20))
        val bear = fx.node("Scenario", mapOf("title" to "비관-${fx.suffix}", "kind" to "BEAR", "valuePerShare" to 8))
        relate(alice, "HAS_SCENARIO", valuation.id, bull.id)
        relate(alice, "HAS_SCENARIO", valuation.id, bear.id)
        return Scene(alice, company, security, decision, valuation, bull, bear, ticker, reason)
    }

    private fun step(trace: JsonNode, nodeId: String): JsonNode =
        trace["steps"].firstOrNull { it["node"]["id"].asString() == nodeId }
            ?: throw AssertionError("단계에 $nodeId 가 없다: $trace")

    @Test
    fun `근거 따라가기는 관계 문장과 토큰 주인의 이해 표시만 담는다`() {
        val s = scene()
        val p = viewer()
        val q = viewer()
        mark(p.session, s.security.id, "UNSURE", "P 메모")

        val trace = ok(p.token, "/api/v1/nodes/${s.decision.id}/trace")
        assertThat(trace["root"]["id"].asString()).isEqualTo(s.decision.id)
        assertThat(trace["root"]["typeLabel"].asString()).isEqualTo("투자 결정")

        val root = step(trace, s.decision.id)
        assertThat(root["depth"].asInt()).isEqualTo(0)
        assertThat(root["via"].isNull).describedAs(root.toString()).isTrue()
        val missing = root["missing"].toList().single { it["relationshipType"].asString() == "BASED_ON" }
        assertThat(missing["label"].asString()).isEqualTo("결정의 근거")
        assertThat(missing["candidates"].toList().map { it["id"].asString() }).contains(s.valuation.id)

        val security = step(trace, s.security.id)
        assertThat(security["depth"].asInt()).isEqualTo(1)
        assertThat(security["via"]["relationshipType"].asString()).isEqualTo("HAS_DECISION")
        assertThat(security["via"]["childId"].asString()).isEqualTo(s.decision.id)
        assertThat(security["via"]["sentence"].asString())
            .isEqualTo("${label(s.decision, "title")}은(는) ${label(s.security, "name")}에 대한 결정이다")
        assertThat(security["myKnowledge"]["level"].asString()).isEqualTo("UNSURE")
        assertThat(security["myKnowledge"]["note"].asString()).isEqualTo("P 메모")

        val company = step(trace, s.company.id)
        assertThat(company["depth"].asInt()).isEqualTo(2)
        assertThat(company["via"]["relationshipType"].asString()).isEqualTo("ISSUES")

        val other = step(ok(q.token, "/api/v1/nodes/${s.decision.id}/trace"), s.security.id)
        assertThat(other.has("myKnowledge")).describedAs(other.toString()).isTrue()
        assertThat(other["myKnowledge"].isNull).describedAs(other.toString()).isTrue()
    }

    @Test
    fun `근거 따라가기의 아래쪽 항목은 지금 항목에서 나가는 관계의 문장을 담고 보관한 항목은 404 다`() {
        val s = scene()
        val p = viewer()

        val trace = ok(p.token, "/api/v1/nodes/${s.security.id}/trace")
        val dependent = trace["dependents"].toList().single { it["node"]["id"].asString() == s.decision.id }
        assertThat(dependent["relationshipType"].asString()).isEqualTo("HAS_DECISION")
        assertThat(dependent["sentence"].asString())
            .isEqualTo("${label(s.decision, "title")}은(는) ${label(s.security, "name")}에 대한 결정이다")

        archive(s.alice, s.decision.id)
        val archived = get(p.token, "/api/v1/nodes/${s.decision.id}/trace")
        assertThat(archived.status).describedAs(archived.body.toString()).isEqualTo(404)
        assertThat(archived.code).isEqualTo("NOT_FOUND")
    }

    @Test
    fun `종목 찾기는 대소문자를 무시해 종목과 결정과 밸류에이션을 한 번에 돌려준다`() {
        val s = scene()
        val p = viewer()
        val path = "/api/v1/securities/lookup?market=us&ticker=${s.ticker.lowercase()}"

        val found = ok(p.token, path)
        assertThat(found["market"].asString()).isEqualTo("US")
        assertThat(found["ticker"].asString()).isEqualTo(s.ticker.lowercase())
        assertThat(found["matchesTruncated"].asBoolean()).isFalse()
        assertThat(found["matches"].size()).describedAs(found.toString()).isEqualTo(1)
        val match = found["matches"][0]
        assertThat(match["security"]["id"].asString()).isEqualTo(s.security.id)
        assertThat(match["security"]["typeLabel"].asString()).isEqualTo("종목")
        assertThat(match["security"]["market"].asString()).isEqualTo("NASDAQ")
        assertThat(match["security"]["marketLabel"].asString()).isEqualTo("나스닥")
        assertThat(match["security"]["ticker"].asString()).isEqualTo(s.ticker)
        assertThat(match["security"]["currency"].asString()).isEqualTo("USD")
        assertThat(match["issuer"]["id"].asString()).isEqualTo(s.company.id)

        val decision = match["decisions"][0]
        assertThat(decision["node"]["id"].asString()).isEqualTo(s.decision.id)
        assertThat(decision["action"].asString()).isEqualTo("BUY")
        assertThat(decision["actionLabel"].asString()).isEqualTo("매수")
        assertThat(decision["decidedAt"].asString()).isEqualTo("2026-09-14")
        assertThat(decision["reason"].asString()).hasSize(501).endsWith("…").startsWith(s.reason.take(500))
        assertThat(decision["basedOn"].size()).isEqualTo(0)
        assertThat(match["decisionsTruncated"].asBoolean()).isFalse()

        val valuation = match["valuations"][0]
        assertThat(valuation["node"]["id"].asString()).isEqualTo(s.valuation.id)
        assertThat(valuation["currentPrice"].asDouble()).isEqualTo(12.5)
        assertThat(valuation["asOf"].asString()).isEqualTo("2026-09-14")
        assertThat(valuation["method"].isNull).describedAs(valuation.toString()).isTrue()
        assertThat(valuation["scenarios"].toList().map { it["kind"].asString() }).containsExactly("BEAR", "BULL")
        assertThat(valuation["scenarios"][0]["node"]["id"].asString()).isEqualTo(s.bear.id)
        assertThat(valuation["scenarios"][0]["valuePerShare"].asDouble()).isEqualTo(8.0)
        assertThat(valuation["scenariosTruncated"].asBoolean()).isFalse()

        relate(s.alice, "BASED_ON", s.valuation.id, s.decision.id)
        val basedOn = ok(p.token, path)["matches"][0]["decisions"][0]["basedOn"]
        assertThat(basedOn.toList().map { it["id"].asString() }).containsExactly(s.valuation.id)

        archive(s.alice, s.bear.id)
        val scenarios = ok(p.token, path)["matches"][0]["valuations"][0]["scenarios"]
        assertThat(scenarios.toList().map { it["node"]["id"].asString() }).containsExactly(s.bull.id)
    }

    @Test
    fun `종목 찾기는 시장이 다르면 빈 목록이고 시장 없이도 찾으며 잘못된 입력은 400 이다`() {
        val s = scene()
        val p = viewer()

        val kr = ok(p.token, "/api/v1/securities/lookup?market=KR&ticker=${s.ticker}")
        assertThat(kr["matches"].isArray).isTrue()
        assertThat(kr["matches"].size()).describedAs(kr.toString()).isEqualTo(0)

        val any = ok(p.token, "/api/v1/securities/lookup?ticker=${s.ticker}")
        assertThat(any.has("market")).isTrue()
        assertThat(any["market"].isNull).describedAs(any.toString()).isTrue()
        assertThat(any["matches"].toList().map { it["security"]["id"].asString() }).containsExactly(s.security.id)

        val badMarket = get(p.token, "/api/v1/securities/lookup?market=XX&ticker=${s.ticker}")
        assertThat(badMarket.status).describedAs(badMarket.body.toString()).isEqualTo(400)
        assertThat(badMarket.code).isEqualTo("VALIDATION_FAILED")
        assertThat(badMarket.body["details"]["fieldErrors"].has("market")).describedAs(badMarket.body.toString()).isTrue()

        val noTicker = get(p.token, "/api/v1/securities/lookup?market=US")
        assertThat(noTicker.status).describedAs(noTicker.body.toString()).isEqualTo(400)
        assertThat(noTicker.code).isEqualTo("VALIDATION_FAILED")
        assertThat(noTicker.body["details"]["fieldErrors"].has("ticker")).describedAs(noTicker.body.toString()).isTrue()

        val tooLong = get(p.token, "/api/v1/securities/lookup?ticker=${"A".repeat(33)}")
        assertThat(tooLong.status).describedAs(tooLong.body.toString()).isEqualTo(400)
        assertThat(tooLong.body["details"]["fieldErrors"].has("ticker")).describedAs(tooLong.body.toString()).isTrue()
    }

    @Test
    fun `공부 목록은 토큰 주인의 표시만 담고 보관한 항목을 뺀다`() {
        val s = scene()
        val p = viewer()
        val q = viewer()
        mark(p.session, s.security.id, "UNSURE", "P 메모")
        mark(p.session, s.bull.id, "LEARNING", null)

        val mine = ok(p.token, "/api/v1/me/knowledge")
        val item = mine["items"].toList().single { it["node"]["id"].asString() == s.security.id }
        assertThat(item["node"]["typeLabel"].asString()).isEqualTo("종목")
        assertThat(item["level"].asString()).isEqualTo("UNSURE")
        assertThat(item["note"].asString()).isEqualTo("P 메모")
        assertThat(item["contexts"].toList().map { it["decision"]["id"].asString() }).contains(s.decision.id)

        val others = ok(q.token, "/api/v1/me/knowledge")["items"].toList().map { it["node"]["id"].asString() }
        assertThat(others).doesNotContain(s.security.id)

        archive(s.alice, s.bull.id)
        val after = ok(p.token, "/api/v1/me/knowledge")
        assertThat(after["items"].toList().map { it["node"]["id"].asString() }).containsExactly(s.security.id)
        assertThat(after["totalItems"].asLong()).isEqualTo(1)
        val session = p.session.get("/api/me/knowledge")
        assertThat(session.status).describedAs(session.body.toString()).isEqualTo(200)
        assertThat(session.body["items"].toList().map { it["node"]["id"].asString() }).contains(s.security.id, s.bull.id)

        val badLevel = get(p.token, "/api/v1/me/knowledge?level=BAD")
        assertThat(badLevel.status).describedAs(badLevel.body.toString()).isEqualTo(400)
        assertThat(badLevel.code).isEqualTo("VALIDATION_FAILED")
        val tooBig = get(p.token, "/api/v1/me/knowledge?size=51")
        assertThat(tooBig.status).describedAs(tooBig.body.toString()).isEqualTo(400)
        assertThat(tooBig.code).isEqualTo("VALIDATION_FAILED")
    }
}
