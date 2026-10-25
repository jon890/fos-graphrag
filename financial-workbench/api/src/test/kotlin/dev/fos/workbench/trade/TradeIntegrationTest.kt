package dev.fos.workbench.trade

import dev.fos.workbench.auth.Role
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.raceAll
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.util.UUID

class TradeIntegrationTest : IntegrationTest() {

    @Autowired lateinit var trades: TradeService

    private val tradesPath = "/api/me/trades"

    private fun userId(email: String): String = users.findByEmail(email)!!.id

    private fun item(externalId: String, ticker: String, market: String = "KR", price: Double = 70000.0): Map<String, Any?> = mapOf(
        "broker" to "TOSS", "externalId" to externalId, "side" to "BUY", "market" to market, "ticker" to ticker,
        "quantity" to 3, "price" to price, "currency" to "KRW", "amount" to price * 3, "executedAt" to "2026-10-24T10:00:00+09:00",
    )

    private fun saveOne(ownerId: String, item: Map<String, Any?>): TradeSaveResult = trades.save(ownerId, listOf(item), null).single()

    private fun tradeCount(ownerId: String): Long =
        neo4j.query("MATCH (t:Trade {ownerId: \$ownerId}) RETURN count(t) AS n").bind(ownerId).to("ownerId")
            .fetch().one().get()["n"] as Long

    private fun tradeExists(tradeId: String): Boolean =
        neo4j.query("MATCH (t:Trade {id: \$id}) RETURN t.id AS id").bind(tradeId).to("id").fetch().one().isPresent

    private fun listIds(client: ApiClient, query: String): List<String> {
        val response = client.get("$tradesPath?$query")
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        return response.body["items"].toList().map { it["id"].asString() }
    }

    private fun uniqueTicker() = "T${UUID.randomUUID().toString().take(8)}".uppercase()

    @Test
    fun `같은 체결을 다시 보내면 새로 만들지 않고 저장된 값을 돌려준다`() {
        val ownerId = userId(newUser(Role.VIEWER))
        val ticker = uniqueTicker()

        val first = saveOne(ownerId, item("e1", ticker, price = 100.0))
        val second = saveOne(ownerId, item("e1", ticker, price = 999.0))

        assertThat(first.status).isEqualTo("created")
        assertThat(second.status).isEqualTo("existing")
        assertThat(second.trade.id).isEqualTo(first.trade.id)
        assertThat(second.trade.price).describedAs("두 번째에 보낸 단가는 저장되지 않는다").isEqualTo(100.0)
        assertThat(tradeCount(ownerId)).isEqualTo(1)

        val inOneRequest = trades.save(ownerId, listOf(item("e2", ticker), item("e2", ticker)), null)
        assertThat(inOneRequest.map { it.index to it.status }).containsExactly(0 to "created", 1 to "existing")
        assertThat(inOneRequest[1].trade.id).isEqualTo(inOneRequest[0].trade.id)
        assertThat(tradeCount(ownerId)).isEqualTo(2)
    }

    @Test
    fun `저장한 체결은 시각을 UTC 초로 두고 저장 경로를 남긴다`() {
        val ownerId = userId(newUser(Role.VIEWER))

        val saved = saveOne(ownerId, item("utc", uniqueTicker()))

        assertThat(saved.trade.executedAt).isEqualTo("2026-10-24T01:00:00Z")
        assertThat(saved.trade.createdVia).isEqualTo("AGENT")
        assertThat(saved.trade.name).isNull()
        assertThat(saved.trade.fee).isNull()
        assertThat(saved.trade.decisions).isEmpty()
    }

    @Test
    fun `항목 하나가 틀리면 아무것도 저장하지 않는다`() {
        val ownerId = userId(newUser(Role.VIEWER))
        val ticker = uniqueTicker()

        val bad = item("bad", ticker) + ("accountNo" to "123-45")
        val error = runCatching { trades.save(ownerId, listOf(item("good", ticker), bad), null) }.exceptionOrNull()

        assertThat(error).isInstanceOf(dev.fos.workbench.web.ValidationFailedException::class.java)
        assertThat(tradeCount(ownerId)).isZero()
    }

    @Test
    fun `같은 체결을 동시에 저장해도 하나만 남는다`() {
        val ownerId = userId(newUser(Role.VIEWER))
        val ticker = uniqueTicker()

        val results = raceAll({ saveOne(ownerId, item("race", ticker)) }, { saveOne(ownerId, item("race", ticker)) })

        assertThat(results.map { it.status }).containsExactlyInAnyOrder("created", "existing")
        assertThat(results.map { it.trade.id }.distinct()).hasSize(1)
        assertThat(tradeCount(ownerId)).isEqualTo(1)
    }

    @Test
    fun `시장과 종목 코드로 종목을 잇고 나중에 만든 종목은 다시 보낼 때 잇는다`() {
        val fixtures = Fixtures(loggedIn(ALICE))
        val ownerId = userId(newUser(Role.VIEWER))
        val nasdaqTicker = "T${fixtures.suffix}".uppercase()
        val nasdaq = fixtures.node(
            "Security",
            mapOf("market" to "NASDAQ", "ticker" to nasdaqTicker, "name" to "미국 종목-${fixtures.suffix}", "securityType" to "COMMON"),
        )

        val linked = saveOne(ownerId, item("us-1", nasdaqTicker.lowercase(), market = "US"))
        assertThat(linked.trade.ticker).isEqualTo(nasdaqTicker)
        assertThat(linked.trade.market).isEqualTo("US")
        assertThat(linked.trade.security?.id).isEqualTo(nasdaq.id)
        assertThat(linked.trade.security?.type).isEqualTo("Security")
        assertThat(linked.trade.security?.label).isEqualTo("미국 종목-${fixtures.suffix}")

        val laterTicker = "L${fixtures.suffix}".uppercase()
        val unlinked = saveOne(ownerId, item("kr-1", laterTicker))
        assertThat(unlinked.trade.security).isNull()

        val security = fixtures.security("나중 종목", laterTicker)
        val resent = saveOne(ownerId, item("kr-1", laterTicker))
        assertThat(resent.status).isEqualTo("existing")
        assertThat(resent.trade.security?.id).isEqualTo(security.id)
    }

    @Test
    fun `내 체결은 주인만 보고 주인만 지운다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val admin = loggedIn(ADMIN)
        val fixtures = Fixtures(alice)
        val ticker = "M${fixtures.suffix}".uppercase()
        val security = fixtures.security("내 체결 종목", ticker)
        val aliceLinked = saveOne(userId(ALICE), item("mine1-$ticker", ticker)).trade
        val aliceOther = saveOne(userId(ALICE), item("mine2-$ticker", ticker, market = "US")).trade
        val bobTrade = saveOne(userId(BOB), item("bob1-$ticker", ticker)).trade

        assertThat(aliceLinked.security?.id).isEqualTo(security.id)
        assertThat(aliceOther.security).describedAs("US 시장에는 KRX 종목이 없다").isNull()
        assertThat(listIds(alice, "ticker=${ticker.lowercase()}")).containsExactlyInAnyOrder(aliceLinked.id, aliceOther.id)
        assertThat(listIds(alice, "securityId=${security.id}")).containsExactly(aliceLinked.id)
        assertThat(listIds(alice, "securityId=no-such-id")).isEmpty()
        assertThat(listIds(bob, "ticker=$ticker")).containsExactly(bobTrade.id)
        assertThat(listIds(admin, "ticker=$ticker")).isEmpty()

        val item = alice.get("$tradesPath?securityId=${security.id}").body["items"].single()
        assertThat(item["externalId"].asString()).isEqualTo("mine1-$ticker")
        assertThat(item["security"]["id"].asString()).isEqualTo(security.id)
        assertThat(item.has("fee") && item["fee"].isNull).describedAs(item.toString()).isTrue()

        val byBob = bob.send("DELETE", "$tradesPath/${aliceLinked.id}", null)
        assertThat(byBob.status).describedAs(byBob.body.toString()).isEqualTo(404)
        assertThat(byBob.code).isEqualTo("NOT_FOUND")
        assertThat(tradeExists(aliceLinked.id)).isTrue()

        val byAlice = alice.send("DELETE", "$tradesPath/${aliceLinked.id}", null)
        assertThat(byAlice.status).describedAs(byAlice.body.toString()).isEqualTo(204)
        assertThat(tradeExists(aliceLinked.id)).isFalse()
        assertThat(listIds(alice, "ticker=$ticker")).containsExactly(aliceOther.id)
    }

    @Test
    fun `체결은 지식 조회 어디에도 나오지 않는다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fixtures = Fixtures(alice)
        val ticker = "K${fixtures.suffix}".uppercase()
        val security = fixtures.security("숨은 체결 종목", ticker)
        val company = fixtures.company("숨은 체결 기업")
        val link = alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to company.id, "toId" to security.id))
        assertThat(link.status).describedAs(link.body.toString()).isEqualTo(201)

        val countsBefore = bob.get("/api/nodes/counts").body.toString()
        val graphBefore = bob.get("/api/graph/neighborhood?id=${security.id}&hops=2").body["nodes"].toList().map { it["id"].asString() }
        val historyBefore = bob.get("/api/changes?targetId=${security.id}").body["totalItems"].asLong()

        val externalId = "hidden-${fixtures.suffix}"
        val saved = saveOne(userId(ALICE), item(externalId, ticker)).trade
        assertThat(saved.security?.id).isEqualTo(security.id)

        val responses = mapOf(
            "search" to bob.get("/api/nodes?q=${fixtures.suffix}"),
            "counts" to bob.get("/api/nodes/counts"),
            "detail" to bob.get("/api/nodes/${security.id}"),
            "graph" to bob.get("/api/graph/neighborhood?id=${security.id}&hops=2"),
            "trace" to bob.get("/api/nodes/${security.id}/trace"),
            "history" to bob.get("/api/changes?targetId=${security.id}"),
        )
        responses.forEach { (name, response) ->
            assertThat(response.status).describedAs("$name: ${response.body}").isEqualTo(200)
            assertThat(response.body.toString()).describedAs(name).doesNotContain(externalId).doesNotContain(saved.id)
        }
        assertThat(responses.getValue("counts").body.toString()).isEqualTo(countsBefore)
        assertThat(responses.getValue("detail").body["relationships"].toList().map { it["type"].asString() }).doesNotContain("OF_SECURITY")
        val graphAfter = responses.getValue("graph").body["nodes"].toList().map { it["id"].asString() }
        assertThat(graphAfter).containsExactlyInAnyOrderElementsOf(graphBefore)
        assertThat(responses.getValue("history").body["totalItems"].asLong()).isEqualTo(historyBefore)
    }

    @Test
    fun `사용자를 지우면 그 사용자의 체결만 함께 지워진다`() {
        val ownerId = userId(newUser(Role.VIEWER))
        val ticker = uniqueTicker()
        saveOne(ownerId, item("gone-1", ticker))
        saveOne(ownerId, item("gone-2", ticker))
        val aliceTrade = saveOne(userId(ALICE), item("stay-$ticker", ticker)).trade

        neo4j.query(
            """
            MATCH (u:User {id: ${'$'}id})
            OPTIONAL MATCH (u)-[:OWNS]->(x)
            DETACH DELETE u, x
            """,
        ).bind(ownerId).to("id").run()

        assertThat(tradeCount(ownerId)).isZero()
        assertThat(tradeExists(aliceTrade.id)).isTrue()
    }
}
