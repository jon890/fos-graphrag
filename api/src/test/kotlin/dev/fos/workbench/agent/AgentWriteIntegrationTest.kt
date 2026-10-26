package dev.fos.workbench.agent

import dev.fos.workbench.auth.Role
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.race
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import java.net.URLEncoder
import java.util.UUID

class AgentWriteIntegrationTest : IntegrationTest() {

    /** 세션으로 로그인한 사람이 범위를 골라 토큰을 발급하고 원문을 돌려준다. 토큰마다 요청 한도가 따로다 */
    private fun issue(session: ApiClient, scope: String): String {
        val response = session.post("/api/me/tokens", mapOf("name" to "Hermes", "scope" to scope))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        assertThat(response.body["scope"].asString()).isEqualTo(scope)
        return response.body["token"].asString()
    }

    private fun bearer(method: String, path: String, token: String, body: Any? = null): ApiClient.Response =
        anonymous().bearer(method, path, token, body)

    private fun ok(response: ApiClient.Response, case: String): JsonNode {
        assertThat(response.status).describedAs("$case: ${response.body}").isEqualTo(200)
        return response.body
    }

    private fun unique() = UUID.randomUUID().toString().take(8)

    private fun uniqueTicker() = "W${unique()}".uppercase()

    private fun enc(s: String) = URLEncoder.encode(s, Charsets.UTF_8)

    private fun trade(
        externalId: String, ticker: String, executedAt: String = "2026-10-24T10:00:00+09:00", quantity: Any = 3,
    ): Map<String, Any?> = mapOf(
        "broker" to "TOSS", "externalId" to externalId, "side" to "BUY", "market" to "KR", "ticker" to ticker,
        "quantity" to quantity, "price" to 1000.0, "currency" to "krw", "amount" to 3000.0, "executedAt" to executedAt,
    )

    private fun postTrades(token: String, vararg items: Map<String, Any?>): ApiClient.Response =
        bearer("POST", "/api/v1/trades", token, mapOf("trades" to items.toList()))

    private fun totalTrades(token: String): Long = ok(bearer("GET", "/api/v1/trades", token), "체결 목록")["totalItems"].asLong()

    private fun tradeIds(token: String, query: String): List<String> =
        ok(bearer("GET", "/api/v1/trades?$query", token), query)["items"].toList().map { it["externalId"].asString() }

    private fun linkProposal(tradeIds: List<String>, decisionId: String, dedupeKey: String? = null): Map<String, Any?> = buildMap {
        put("kind", "LINK_TRADE_DECISION")
        put("payload", mapOf("tradeIds" to tradeIds, "decisionId" to decisionId))
        put("rationale", "같은 날의 체결은 이 결정을 실행한 것이다.")
        dedupeKey?.let { put("dedupeKey", it) }
    }

    private fun postProposals(token: String, vararg items: Map<String, Any?>): ApiClient.Response =
        bearer("POST", "/api/v1/proposals", token, mapOf("proposals" to items.toList()))

    private fun decision(fixtures: Fixtures): JsonNode = fixtures.node("Decision", mapOf("title" to "결정-${fixtures.suffix}", "action" to "BUY"))

    private fun fieldErrors(response: ApiClient.Response): JsonNode = response.body["details"]["fieldErrors"]

    private fun assertValidationFailed(response: ApiClient.Response, field: String, case: String) {
        assertThat(response.status).describedAs("$case: ${response.body}").isEqualTo(400)
        assertThat(response.code).describedAs(case).isEqualTo("VALIDATION_FAILED")
        assertThat(fieldErrors(response).has(field)).describedAs("$case: fieldErrors 에 $field 가 있어야 한다. ${response.body}").isTrue()
    }

    @Test
    fun `조회만 토큰의 쓰기는 403 INSUFFICIENT_SCOPE 이고 조회는 된다`() {
        val session = loggedIn(newUser(Role.EDITOR))
        val read = issue(session, "READ")
        val readWrite = issue(session, "READ_WRITE")

        val me = ok(bearer("GET", "/api/v1/me", read), "READ 토큰의 me")
        assertThat(me["token"]["scope"].asString()).isEqualTo("READ")
        assertThat(me["writeRateLimitPerMinute"].asInt()).isEqualTo(10)
        assertThat(ok(bearer("GET", "/api/v1/me", readWrite), "READ_WRITE 토큰의 me")["token"]["scope"].asString()).isEqualTo("READ_WRITE")

        val trades = postTrades(read, trade("scope-${unique()}", uniqueTicker()))
        val proposals = postProposals(read, linkProposal(listOf(UUID.randomUUID().toString()), UUID.randomUUID().toString()))
        for ((case, response) in listOf("체결" to trades, "제안" to proposals)) {
            assertThat(response.status).describedAs("$case: ${response.body}").isEqualTo(403)
            assertThat(response.code).describedAs(case).isEqualTo("INSUFFICIENT_SCOPE")
            assertThat(response.body["message"].asString())
                .isEqualTo("이 토큰은 조회만 할 수 있습니다. 「조회와 기록」 토큰을 새로 발급하세요.")
        }
        assertThat(totalTrades(read)).describedAs("조회만 토큰의 쓰기는 체결을 만들지 않는다").isZero()
        assertThat(ok(bearer("GET", "/api/v1/proposals", read), "READ 토큰의 제안 목록")["totalItems"].asLong()).isZero()
    }

    @Test
    fun `조회만 토큰이 배열 본문을 보내면 403 INSUFFICIENT_SCOPE 이고 기록 토큰이면 400 이다`() {
        val session = loggedIn(newUser(Role.EDITOR))
        val read = issue(session, "READ")
        val readWrite = issue(session, "READ_WRITE")

        for (target in listOf("/api/v1/trades", "/api/v1/proposals")) {
            val byRead = bearer("POST", target, read, listOf(mapOf("kind" to "STUDY_NOTE")))
            assertThat(byRead.status).describedAs("$target: ${byRead.body}").isEqualTo(403)
            assertThat(byRead.code).describedAs(target).isEqualTo("INSUFFICIENT_SCOPE")

            assertValidationFailed(bearer("POST", target, readWrite, listOf(mapOf("kind" to "STUDY_NOTE"))), "body", "$target 배열 본문")
        }
    }

    @Test
    fun `같은 체결을 다시 보내거나 동시에 보내도 한 번만 저장된다`() {
        val token = issue(loggedIn(newUser(Role.VIEWER)), "READ_WRITE")
        val ticker = uniqueTicker()
        val first = trade("a-$ticker", ticker.lowercase())
        val second = trade("b-$ticker", ticker)

        val created = ok(postTrades(token, first, second), "처음 저장")["results"].toList()
        assertThat(created.map { it["index"].asInt() to it["status"].asString() }).containsExactly(0 to "created", 1 to "created")
        val saved = created[0]["trade"]
        assertThat(saved.propertyNames().asSequence().toSet()).containsExactlyInAnyOrder(
            "id", "broker", "externalId", "side", "market", "ticker", "name", "quantity", "price", "currency", "amount", "fee",
            "executedAt", "createdAt", "security", "decisions",
        )
        assertThat(saved["ticker"].asString()).isEqualTo(ticker)
        assertThat(saved["currency"].asString()).isEqualTo("KRW")
        assertThat(saved["executedAt"].asString()).isEqualTo("2026-10-24T01:00:00Z")
        assertThat(saved["name"].isNull).isTrue()
        assertThat(saved["security"].isNull).describedAs("이 종목 코드의 종목이 없다").isTrue()

        val again = ok(postTrades(token, first, second), "다시 저장")["results"].toList()
        assertThat(again.map { it["status"].asString() }).containsExactly("existing", "existing")
        assertThat(again.map { it["trade"]["id"].asString() }).isEqualTo(created.map { it["trade"]["id"].asString() })
        assertThat(totalTrades(token)).isEqualTo(2)

        val racer = issue(loggedIn(newUser(Role.VIEWER)), "READ_WRITE")
        val raced = race({ postTrades(racer, first, second) }, { postTrades(racer, first, second) })
        assertThat(raced.map { it.status }).describedAs(raced.map { it.body }.toString()).containsOnly(200)
        assertThat(totalTrades(racer)).isEqualTo(2)
    }

    @Test
    fun `항목 하나라도 틀리면 아무것도 저장하지 않는다`() {
        val token = issue(loggedIn(newUser(Role.VIEWER)), "READ_WRITE")
        val ticker = uniqueTicker()

        val negative = postTrades(token, trade("ok-$ticker", ticker), trade("bad-$ticker", ticker, quantity = -1))
        assertValidationFailed(negative, "trades[1].quantity", "두 번째 항목의 수량이 음수")
        assertThat(totalTrades(token)).describedAs("첫 항목도 저장하지 않는다").isZero()

        val extraKey = bearer("POST", "/api/v1/trades", token, mapOf("trades" to listOf(trade("x-$ticker", ticker)), "accounts" to listOf("123-45")))
        assertValidationFailed(extraKey, "accounts", "최상위의 다른 키")

        val tooMany = postTrades(token, *(0..50).map { trade("m$it-$ticker", ticker) }.toTypedArray())
        assertValidationFailed(tooMany, "trades", "51건")
        assertThat(totalTrades(token)).isZero()

        val atLimit = postTrades(token, *(0 until 50).map { trade("m$it-$ticker", ticker) }.toTypedArray())
        assertThat(ok(atLimit, "50건")["results"].toList()).hasSize(50)
        assertThat(totalTrades(token)).isEqualTo(50)
    }

    @Test
    fun `체결 목록은 시각과 종목 코드로 좁히고 오프셋 없는 시각은 400 이다`() {
        val token = issue(loggedIn(newUser(Role.VIEWER)), "READ_WRITE")
        val x = uniqueTicker()
        val y = uniqueTicker()
        ok(
            postTrades(
                token,
                trade("x1", x, executedAt = "2026-10-01T00:00:00Z"),
                trade("x2", x, executedAt = "2026-10-10T00:00:00Z"),
                trade("y1", y, executedAt = "2026-10-05T00:00:00Z"),
            ),
            "저장",
        )

        assertThat(tradeIds(token, "")).describedAs("체결 시각이 늦은 순서").containsExactly("x2", "y1", "x1")
        assertThat(tradeIds(token, "from=${enc("2026-10-05T00:00:00Z")}")).describedAs("from 은 그 시각을 포함한다").containsExactly("x2", "y1")
        assertThat(tradeIds(token, "from=${enc("2026-10-05T09:00:00+09:00")}")).describedAs("오프셋은 UTC 로 바꾼다").containsExactly("x2", "y1")
        assertThat(tradeIds(token, "to=${enc("2026-10-05T00:00:00Z")}")).describedAs("to 는 그 시각을 뺀다").containsExactly("x1")
        assertThat(tradeIds(token, "ticker=${x.lowercase()}")).describedAs("종목 코드는 대소문자를 무시한다").containsExactly("x2", "x1")
        assertThat(tradeIds(token, "ticker=$x&from=${enc("2026-10-05T00:00:00Z")}")).containsExactly("x2")

        assertValidationFailed(bearer("GET", "/api/v1/trades?from=2026-10-01", token), "from", "오프셋 없는 from")
        assertValidationFailed(bearer("GET", "/api/v1/trades?to=yesterday", token), "to", "형식이 틀린 to")
        assertValidationFailed(bearer("GET", "/api/v1/trades?ticker=${"A".repeat(33)}", token), "ticker", "33자 종목 코드")
        assertValidationFailed(bearer("GET", "/api/v1/trades?size=51", token), "size", "페이지 크기 51")
    }

    @Test
    fun `열람자의 토큰도 제안을 올리고 거절 이유를 다시 읽는다`() {
        val fixtures = Fixtures(loggedIn(newUser(Role.EDITOR)))
        val decisionId = decision(fixtures).id
        val ownerEmail = newUser(Role.VIEWER)
        val session = loggedIn(ownerEmail)
        val token = issue(session, "READ_WRITE")
        val tradeId = ok(postTrades(token, trade("p-${fixtures.suffix}", uniqueTicker())), "체결 저장")["results"][0]["trade"]["id"].asString()
        val dedupeKey = "link:${fixtures.suffix}"

        val created = ok(postProposals(token, linkProposal(listOf(tradeId), decisionId, dedupeKey)), "제안 올리기")["results"].single()
        assertThat(created["index"].asInt()).isZero()
        assertThat(created["status"].asString()).isEqualTo("created")
        val proposal = created["proposal"]
        assertThat(proposal.propertyNames().asSequence().toSet()).containsExactlyInAnyOrder(
            "id", "kind", "status", "payload", "rationale", "evidence", "dedupeKey", "createdAt", "decidedAt", "decisionNote", "result", "lastError",
        )
        assertThat(proposal["kind"].asString()).isEqualTo("LINK_TRADE_DECISION")
        assertThat(proposal["status"].asString()).isEqualTo("PENDING")
        assertThat(proposal["dedupeKey"].asString()).isEqualTo(dedupeKey)
        assertThat(proposal["payload"]["decisionId"].asString()).isEqualTo(decisionId)
        assertThat(proposal["decidedAt"].isNull).isTrue()
        val proposalId = proposal["id"].asString()

        val pending = ok(bearer("GET", "/api/v1/proposals?status=PENDING", token), "대기 목록")["items"].toList()
        assertThat(pending.map { it["id"].asString() }).containsExactly(proposalId)

        val again = ok(postProposals(token, linkProposal(listOf(tradeId), decisionId, dedupeKey)), "다시 올리기")["results"].single()
        assertThat(again["status"].asString()).isEqualTo("existing")
        assertThat(again["proposal"]["id"].asString()).isEqualTo(proposalId)

        val rejected = session.post("/api/me/proposals/$proposalId/reject", mapOf("reason" to "다른 결정을 실행한 체결이다"))
        assertThat(rejected.status).describedAs(rejected.body.toString()).isEqualTo(200)

        assertThat(ok(bearer("GET", "/api/v1/proposals?status=PENDING", token), "거절 뒤 대기 목록")["totalItems"].asLong()).isZero()
        val done = ok(bearer("GET", "/api/v1/proposals?status=REJECTED", token), "거절 목록")["items"].toList().single()
        assertThat(done["id"].asString()).isEqualTo(proposalId)
        assertThat(done["status"].asString()).isEqualTo("REJECTED")
        assertThat(done["decisionNote"].asString()).isEqualTo("다른 결정을 실행한 체결이다")
        assertThat(done["decidedAt"].isNull).isFalse()

        assertValidationFailed(bearer("GET", "/api/v1/proposals?status=DONE", token), "status", "없는 상태")
        assertValidationFailed(bearer("POST", "/api/v1/proposals", token, mapOf("proposals" to emptyList<Any>(), "extra" to 1)), "extra", "최상위의 다른 키")
    }

    @Test
    fun `쓰기 요청은 토큰마다 1분에 10번이고 조회와 다른 토큰은 따로 센다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val token = issue(session, "READ_WRITE")
        val other = issue(session, "READ_WRITE")

        repeat(10) {
            val response = bearer("POST", "/api/v1/trades", token, mapOf("trades" to emptyList<Any>()))
            assertThat(response.status).describedAs("${it + 1}번째: ${response.body}").isEqualTo(400)
        }
        val limited = postTrades(token, trade("limit-${unique()}", uniqueTicker()))
        assertThat(limited.status).describedAs(limited.body.toString()).isEqualTo(429)
        assertThat(limited.code).isEqualTo("RATE_LIMITED")
        val retryAfter = limited.header("Retry-After")?.toLongOrNull()
        assertThat(retryAfter).describedAs("Retry-After=${limited.header("Retry-After")}").isNotNull().isBetween(1L, 60L)
        assertThat(limited.body["details"]["retryAfterSeconds"].asLong()).isEqualTo(retryAfter)
        assertThat(totalTrades(token)).describedAs("한도에 걸린 요청은 저장하지 않는다").isZero()

        ok(bearer("GET", "/api/v1/me", token), "같은 토큰의 조회")
        ok(postTrades(other, trade("other-${unique()}", uniqueTicker())), "같은 주인의 다른 토큰")
    }

    @Test
    fun `조회만 토큰의 쓰기도 쓰기 한도에 센다`() {
        val token = issue(loggedIn(newUser(Role.VIEWER)), "READ")

        repeat(10) {
            val response = postTrades(token, trade("r-${unique()}", uniqueTicker()))
            assertThat(response.status).describedAs("${it + 1}번째: ${response.body}").isEqualTo(403)
        }
        val limited = postTrades(token, trade("r-${unique()}", uniqueTicker()))
        assertThat(limited.status).describedAs(limited.body.toString()).isEqualTo(429)
        assertThat(limited.code).isEqualTo("RATE_LIMITED")
    }

    @Test
    fun `한 사용자의 체결과 제안은 다른 사용자의 v1 응답에 섞이지 않는다`() {
        val aliceSession = loggedIn(newUser(Role.EDITOR, "Alice"))
        val bobSession = loggedIn(newUser(Role.EDITOR, "Bob"))
        val fixtures = Fixtures(aliceSession)
        val ticker = "S${fixtures.suffix}".uppercase()
        val security = fixtures.security("분리 종목", ticker)
        val decisionId = decision(fixtures).id
        val alice = issue(aliceSession, "READ_WRITE")
        val bob = issue(bobSession, "READ_WRITE")

        val aliceExternalId = "alice-${fixtures.suffix}"
        val aliceTrade = ok(postTrades(alice, trade(aliceExternalId, ticker)), "Alice 체결")["results"][0]["trade"]
        assertThat(aliceTrade["security"]["id"].asString()).describedAs("시장과 종목 코드로 종목을 잇는다").isEqualTo(security.id)
        val aliceProposalId = ok(postProposals(alice, linkProposal(listOf(aliceTrade.id), decisionId)), "Alice 제안")["results"][0]["proposal"]["id"]
            .asString()
        val bobTradeId = ok(postTrades(bob, trade("bob-${fixtures.suffix}", ticker)), "Bob 체결")["results"][0]["trade"]["id"].asString()

        val paths = listOf(
            "/api/v1/trades",
            "/api/v1/proposals",
            "/api/v1/nodes?q=$ticker",
            "/api/v1/nodes/${security.id}",
            "/api/v1/nodes/${security.id}/trace",
            "/api/v1/graph/neighborhood?id=${security.id}&hops=2",
            "/api/v1/securities/lookup?ticker=$ticker",
            "/api/v1/me/knowledge",
        )
        for (path in paths) {
            val text = ok(bearer("GET", path, bob), path).toString()
            for (secret in listOf(aliceExternalId, aliceTrade.id, aliceProposalId)) {
                assertThat(text).describedAs("$path 의 응답에 Alice 의 $secret 이 없어야 한다").doesNotContain(secret)
            }
        }
        assertThat(ok(bearer("GET", "/api/v1/trades", bob), "Bob 체결 목록")["items"].toList().map { it.id }).containsExactly(bobTradeId)

        val foreign = postProposals(alice, linkProposal(listOf(bobTradeId), decisionId))
        assertThat(foreign.status).describedAs(foreign.body.toString()).isEqualTo(404)
        assertThat(foreign.code).isEqualTo("NOT_FOUND")
    }
}
