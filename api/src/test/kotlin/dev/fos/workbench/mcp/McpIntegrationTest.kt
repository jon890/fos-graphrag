package dev.fos.workbench.mcp

import dev.fos.workbench.auth.Role
import dev.fos.workbench.config.params
import dev.fos.workbench.ontology.NodeTypeDef
import dev.fos.workbench.ontology.OntologyLoader
import dev.fos.workbench.ontology.PropertyDef
import dev.fos.workbench.ontology.PropertyType
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.OAuthFlow
import dev.fos.workbench.support.id
import io.modelcontextprotocol.client.McpClient
import io.modelcontextprotocol.client.McpSyncClient
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport
import io.modelcontextprotocol.json.jackson3.JacksonMcpJsonMapper
import io.modelcontextprotocol.spec.McpSchema
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.test.context.TestPropertySource
import tools.jackson.databind.JsonNode
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.UUID

class McpIntegrationTest : IntegrationTest() {

    /** docs/api-contract.md 「원격 MCP(`/mcp`)」 의 도구 표 */
    private val contractTools = listOf(
        "get_connection", "get_ontology", "get_ontology_yaml", "search_nodes", "get_node", "trace_node", "get_neighborhood", "lookup_security",
        "list_my_knowledge", "record_trades", "list_my_trades", "submit_proposals", "propose_ontology_change",
        "list_my_proposals",
    )
    private val writeTools = setOf("record_trades", "submit_proposals", "propose_ontology_change")

    @Test
    fun `토큰이 없거나 틀리면 401 과 보호 자원 메타데이터를 가리키는 WWW-Authenticate 다`() {
        val mcp = Mcp(this)
        val metadata = "resource_metadata=\"${mcp.base}/.well-known/oauth-protected-resource/mcp\""

        val missing = mcp.raw("POST", null, INITIALIZE)
        assertThat(missing.status).describedAs(missing.body.toString()).isEqualTo(401)
        assertThat(missing.code).isEqualTo("UNAUTHENTICATED")
        assertThat(missing.body["message"].asString()).isEqualTo("연결이 필요합니다. 앱에서 다시 로그인하세요.")
        val challenge = missing.header("WWW-Authenticate")
        assertThat(challenge).describedAs("토큰 없음").startsWith("Bearer ").contains(metadata).contains("scope=\"read write\"")
            .doesNotContain("invalid_token")

        val wrongToken = "fwa_" + "A".repeat(43)
        val wrong = mcp.raw("POST", wrongToken, INITIALIZE)
        assertThat(wrong.status).describedAs(wrong.body.toString()).isEqualTo(401)
        assertThat(wrong.header("WWW-Authenticate")).describedAs("틀린 토큰").contains(metadata).contains("scope=\"read write\"")
            .contains("error=\"invalid_token\"")
        assertThat(wrong.body.toString()).describedAs("응답에 원문이 남으면 안 된다").doesNotContain(wrongToken)
    }

    @Test
    fun `다른 Origin 은 인증보다 먼저 403 이고 토큰을 붙인 GET 은 405 다`() {
        val mcp = Mcp(this)
        val evil = mcp.raw("POST", null, INITIALIZE, origin = "https://evil.example")
        assertThat(evil.status).describedAs(evil.body.toString()).isEqualTo(403)
        assertThat(evil.code).isEqualTo("FORBIDDEN")

        val tokens = mcp.connect(loggedIn(newUser(Role.VIEWER)), "READ")
        val sameOrigin = mcp.raw("POST", tokens.access, INITIALIZE, origin = mcp.base)
        assertThat(sameOrigin.status).describedAs("같은 Origin: ${sameOrigin.body}").isEqualTo(200)
        assertThat(mcp.raw("GET", tokens.access, null).status).describedAs("GET").isEqualTo(405)
        assertThat(mcp.raw("DELETE", tokens.access, null).status).describedAs("DELETE").isEqualTo(405)
    }

    @Test
    fun `OAuth 접근 토큰으로 initialize 하면 서버 이름과 계약의 도구와 힌트가 보인다`() {
        val mcp = Mcp(this)
        val tokens = mcp.connect(loggedIn(newUser(Role.VIEWER)), "READ_WRITE")
        mcp.client(tokens.access).use { client ->
            val info = client.currentInitializationResult.serverInfo()
            assertThat(info.name()).isEqualTo("valuation-ontology")
            assertThat(info.title()).isEqualTo("가치투자 온톨로지")

            val tools = client.listTools().tools().associateBy { it.name() }
            assertThat(tools.keys).containsAll(contractTools)
            for ((name, tool) in tools) {
                assertThat(tool.description()).describedAs("$name 의 설명").containsPattern("[가-힣]")
                assertThat(tool.title()).describedAs("$name 의 제목").containsPattern("[가-힣]")
                val hints = tool.annotations()
                assertThat(hints).describedAs("$name 의 annotations").isNotNull()
                assertThat(hints.openWorldHint()).describedAs("$name openWorldHint").isFalse()
                if (name in writeTools) {
                    assertThat(hints.readOnlyHint()).describedAs("$name readOnlyHint").isFalse()
                    assertThat(hints.destructiveHint()).describedAs("$name destructiveHint").isFalse()
                    assertThat(hints.idempotentHint()).describedAs("$name idempotentHint").isTrue()
                } else {
                    assertThat(hints.readOnlyHint()).describedAs("$name readOnlyHint").isTrue()
                }
            }
        }
    }

    @Test
    fun `get_connection 은 OAuth 연결과 연동 토큰을 가른다`() {
        val mcp = Mcp(this)
        val session = loggedIn(newUser(Role.EDITOR, name = "MCP주인"))
        val appName = "Claude Code ${UUID.randomUUID().toString().take(6)}"
        val tokens = mcp.connect(session, "READ_WRITE", appName)
        val grantId = mcp.grantId(session, appName)

        val oauth = mcp.client(tokens.access).use { mcp.ok(it, "get_connection") }
        assertThat(oauth["connection"]["kind"].asString()).isEqualTo("OAUTH")
        assertThat(oauth["connection"]["id"].asString()).isEqualTo(grantId)
        assertThat(oauth["connection"]["name"].asString()).isEqualTo(appName)
        assertThat(oauth["connection"]["scope"].asString()).isEqualTo("READ_WRITE")
        assertThat(oauth["user"]["displayName"].asString()).isEqualTo("MCP주인")
        assertThat(oauth["user"]["role"].asString()).isEqualTo("EDITOR")
        assertThat(oauth.toString()).describedAs("결과에 원문이 남으면 안 된다").doesNotContain(tokens.access)

        val issued = session.post("/api/me/tokens", mapOf("name" to "Hermes", "scope" to "READ"))
        assertThat(issued.status).describedAs(issued.body.toString()).isEqualTo(201)
        val integration = mcp.client(issued.body["token"].asString()).use { mcp.ok(it, "get_connection") }
        assertThat(integration["connection"]["kind"].asString()).isEqualTo("INTEGRATION_TOKEN")
        assertThat(integration["connection"]["id"].asString()).isEqualTo(issued.body["id"].asString())
        assertThat(integration["connection"]["name"].asString()).isEqualTo("Hermes")
        assertThat(integration["connection"]["scope"].asString()).isEqualTo("READ")
        assertThat(integration["connection"].has("last4")).isFalse()
    }

    @Test
    fun `search_nodes 는 기업을 찾고 없는 항목의 get_node 는 NOT_FOUND 도구 오류다`() {
        val mcp = Mcp(this)
        val session = loggedIn(newUser(Role.EDITOR))
        val fixtures = Fixtures(session)
        val company = fixtures.company("엠씨피전자")
        val tokens = mcp.connect(session, "READ")

        mcp.client(tokens.access).use { client ->
            val found = mcp.ok(client, "search_nodes", mapOf("q" to "엠씨피전자-${fixtures.suffix}", "types" to listOf("Company")))
            assertThat(found["items"].toList().map { it["id"].asString() }).containsExactly(company.id)

            val missingId = UUID.randomUUID().toString()
            val missing = mcp.call(client, "get_node", mapOf("id" to missingId))
            assertThat(missing.isError).describedAs(missing.body.toString()).isTrue()
            assertThat(missing.body["code"].asString()).isEqualTo("NOT_FOUND")
            assertThat(missing.body["details"]["id"].asString()).isEqualTo(missingId)

            val badPage = mcp.call(client, "search_nodes", mapOf("size" to 51))
            assertThat(badPage.isError).describedAs("size 51: ${badPage.body}").isTrue()
            assertThat(badPage.body["code"].asString()).isEqualTo("VALIDATION_FAILED")
            assertThat(badPage.body["details"]["fieldErrors"].has("size")).isTrue()
        }
    }

    @Test
    fun `조회만 연결의 record_trades 는 INSUFFICIENT_SCOPE 이고 조회와 기록 연결은 연결 id 로 저장한다`() {
        val mcp = Mcp(this)
        val ticker = mcp.uniqueTicker()
        val trade = mcp.trade("ext-${UUID.randomUUID()}", ticker)

        val readSession = loggedIn(newUser(Role.VIEWER))
        mcp.client(mcp.connect(readSession, "READ").access).use { client ->
            val denied = mcp.call(client, "record_trades", mapOf("trades" to listOf(trade)))
            assertThat(denied.isError).describedAs(denied.body.toString()).isTrue()
            assertThat(denied.body["code"].asString()).isEqualTo("INSUFFICIENT_SCOPE")
            assertThat(denied.body["message"].asString()).isEqualTo(
                "조회만 허락된 연결입니다. 기록하려면 더보기 → 연동에서 이 연결을 끊고 앱에서 다시 로그인해 「조회와 기록」 을 고르세요.",
            )
            assertThat(mcp.ok(client, "list_my_trades", mapOf("ticker" to ticker))["totalItems"].asLong()).isZero()
        }

        val session = loggedIn(newUser(Role.VIEWER))
        val appName = "기록 앱 ${UUID.randomUUID().toString().take(6)}"
        val tokens = mcp.connect(session, "READ_WRITE", appName)
        val grantId = mcp.grantId(session, appName)
        mcp.client(tokens.access).use { client ->
            val first = mcp.ok(client, "record_trades", mapOf("trades" to listOf(trade)))
            assertThat(first["results"][0]["status"].asString()).isEqualTo("created")
            val second = mcp.ok(client, "record_trades", mapOf("trades" to listOf(trade)))
            assertThat(second["results"][0]["status"].asString()).isEqualTo("existing")
            val tradeId = first["results"][0]["trade"]["id"].asString()
            assertThat(second["results"][0]["trade"]["id"].asString()).isEqualTo(tradeId)

            val stored = neo4j.query("MATCH (t:Trade {id: \$id}) RETURN t.tokenId AS tokenId, t.createdVia AS createdVia")
                .bind(tradeId).to("id").fetch().one().orElseThrow()
            assertThat(stored["tokenId"]).describedAs("체결의 tokenId").isEqualTo(grantId)
            assertThat(stored["createdVia"]).isEqualTo("AGENT")
        }
    }

    @Test
    fun `조회만 연결은 온톨로지 변경을 제안하지 못하고 조회와 기록 연결은 받은 YAML 을 고쳐 올린다`() {
        val mcp = Mcp(this)
        val readSession = loggedIn(newUser(Role.VIEWER))
        mcp.client(mcp.connect(readSession, "READ").access).use { client ->
            val got = mcp.ok(client, "get_ontology_yaml")
            val denied = mcp.call(
                client, "propose_ontology_change",
                mapOf("baseVersion" to got["version"].asInt(), "yaml" to withType(got["yaml"].asString()), "rationale" to "합성 근거"),
            )
            assertThat(denied.isError).describedAs(denied.body.toString()).isTrue()
            assertThat(denied.body["code"].asString()).isEqualTo("INSUFFICIENT_SCOPE")
            assertThat(mcp.ok(client, "list_my_proposals")["totalItems"].asLong()).isZero()
        }

        mcp.client(mcp.connect(loggedIn(newUser(Role.EDITOR)), "READ_WRITE").access).use { client ->
            val got = mcp.ok(client, "get_ontology_yaml")
            val result = mcp.ok(
                client, "propose_ontology_change",
                mapOf(
                    "baseVersion" to got["version"].asInt(), "yaml" to withType(got["yaml"].asString()), "rationale" to "합성 근거",
                    "note" to "MCP 메모",
                ),
            )
            assertThat(result["status"].asString()).isEqualTo("created")
            assertThat(result["proposal"]["kind"].asString()).isEqualTo("ONTOLOGY_CHANGE")
            assertThat(result["proposal"]["payload"]["baseVersion"].asInt()).isEqualTo(got["version"].asInt())
            assertThat(result["proposal"]["payload"]["note"].asString()).isEqualTo("MCP 메모")
        }
    }

    @Test
    fun `64KiB 를 넘는 온톨로지 변경 제안도 MCP 로 올린다`() {
        val mcp = Mcp(this)
        mcp.client(mcp.connect(loggedIn(newUser(Role.EDITOR)), "READ_WRITE").access).use { client ->
            val got = mcp.ok(client, "get_ontology_yaml")
            val yaml = withType(got["yaml"].asString(), description = "긴 설명 ".repeat(20_000))
            assertThat(yaml.toByteArray().size).describedAs("YAML 크기").isBetween(64 * 1024, 400 * 1024)

            val result = mcp.call(client, "propose_ontology_change", mapOf("baseVersion" to got["version"].asInt(), "yaml" to yaml, "rationale" to "합성 근거"))

            assertThat(result.isError).describedAs(result.body.toString()).isFalse()
            assertThat(result.body["status"].asString()).isEqualTo("created")
        }
    }

    /** 받은 YAML 에 테스트마다 다른 노드 타입 하나를 더한다 */
    private fun withType(yaml: String, description: String = "x"): String {
        val o = OntologyLoader.parse(yaml)
        val type = "Mcp${UUID.randomUUID().toString().filter { it.isLetter() }.take(6).uppercase()}"
        val def = NodeTypeDef(
            label = "테스트 타입", description = description, labelProperty = "title",
            properties = mapOf("title" to PropertyDef(PropertyType.STRING, label = "제목", required = true)),
        )
        return OntologyLoader.toYaml(o.copy(nodeTypes = o.nodeTypes + (type to def)))
    }

    @Test
    fun `한 사용자가 MCP 로 기록한 체결은 다른 사용자의 list_my_trades 에 없다`() {
        val mcp = Mcp(this)
        val ticker = mcp.uniqueTicker()
        val alice = mcp.connect(loggedIn(newUser(Role.VIEWER, "Alice")), "READ_WRITE")
        val bob = mcp.connect(loggedIn(newUser(Role.VIEWER, "Bob")), "READ_WRITE")

        mcp.client(alice.access).use { client ->
            mcp.ok(client, "record_trades", mapOf("trades" to listOf(mcp.trade("a-${UUID.randomUUID()}", ticker))))
            assertThat(mcp.ok(client, "list_my_trades", mapOf("ticker" to ticker))["totalItems"].asLong()).isEqualTo(1)
        }
        mcp.client(bob.access).use { client ->
            val listed = mcp.ok(client, "list_my_trades", mapOf("ticker" to ticker))
            assertThat(listed["totalItems"].asLong()).describedAs(listed.toString()).isZero()
        }
    }

    @Test
    fun `끊은 연결과 끝난 접근 토큰은 401 이다`() {
        val mcp = Mcp(this)
        val session = loggedIn(newUser(Role.VIEWER))
        val appName = "끊을 앱 ${UUID.randomUUID().toString().take(6)}"
        val revoked = mcp.connect(session, "READ", appName)
        assertThat(mcp.raw("POST", revoked.access, INITIALIZE).status).describedAs("끊기 전").isEqualTo(200)
        val deleted = session.send("DELETE", "/api/me/connections/${mcp.grantId(session, appName)}", null)
        assertThat(deleted.status).describedAs(deleted.body.toString()).isIn(200, 204)
        assertThat(mcp.raw("POST", revoked.access, INITIALIZE).status).describedAs("끊은 뒤").isEqualTo(401)

        val expiredName = "끝날 앱 ${UUID.randomUUID().toString().take(6)}"
        val expired = mcp.connect(session, "READ", expiredName)
        neo4j.query("MATCH (g:OAuthGrant {id: \$id}) SET g.accessExpiresAt = \$past")
            .bindAll(params("id" to mcp.grantId(session, expiredName), "past" to "2000-01-01T00:00:00.000000Z")).run()
        val response = mcp.raw("POST", expired.access, INITIALIZE)
        assertThat(response.status).describedAs("끝난 토큰: ${response.body}").isEqualTo(401)
        assertThat(response.header("WWW-Authenticate")).contains("error=\"invalid_token\"")
    }

    @Test
    fun `api v1 은 OAuth 접근 토큰을 받지 않는다`() {
        val tokens = Mcp(this).connect(loggedIn(newUser(Role.VIEWER)), "READ_WRITE")
        val response = anonymous().bearer("GET", "/api/v1/me", tokens.access)
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(401)
    }

    @Nested
    @TestPropertySource(properties = ["workbench.agent.rate-limit-per-minute=3"])
    inner class RateLimit : IntegrationTest() {
        @Test
        fun `연결마다 1분 한도를 넘으면 429 와 Retry-After 다`() {
            val mcp = Mcp(this)
            val tokens = mcp.connect(loggedIn(newUser(Role.VIEWER)), "READ")
            repeat(3) {
                val ok = mcp.raw("POST", tokens.access, INITIALIZE)
                assertThat(ok.status).describedAs("${it + 1}번째: ${ok.body}").isEqualTo(200)
            }
            val limited = mcp.raw("POST", tokens.access, INITIALIZE)
            assertThat(limited.status).describedAs(limited.body.toString()).isEqualTo(429)
            assertThat(limited.code).isEqualTo("RATE_LIMITED")
            val retryAfter = limited.header("Retry-After")?.toLongOrNull()
            assertThat(retryAfter).describedAs("Retry-After=${limited.header("Retry-After")}").isNotNull().isBetween(1L, 60L)
        }
    }

    @Nested
    @TestPropertySource(properties = ["workbench.agent.write-rate-limit-per-minute=2"])
    inner class WriteLimit : IntegrationTest() {
        @Test
        fun `조회 도구는 쓰기 한도에 세지 않고 세 번째 record_trades 는 RATE_LIMITED 도구 오류다`() {
            val mcp = Mcp(this)
            val tokens = mcp.connect(loggedIn(newUser(Role.VIEWER)), "READ_WRITE")
            mcp.client(tokens.access).use { client ->
                repeat(4) { mcp.ok(client, "get_connection") }
                repeat(2) {
                    mcp.ok(client, "record_trades", mapOf("trades" to listOf(mcp.trade("w-${UUID.randomUUID()}", mcp.uniqueTicker()))))
                }
                val limited = mcp.call(client, "record_trades", mapOf("trades" to listOf(mcp.trade("w-${UUID.randomUUID()}", mcp.uniqueTicker()))))
                assertThat(limited.isError).describedAs(limited.body.toString()).isTrue()
                assertThat(limited.body["code"].asString()).isEqualTo("RATE_LIMITED")
                assertThat(limited.body["details"]["retryAfterSeconds"].asLong()).isBetween(1L, 60L)
            }
        }
    }

    /** 테스트 하나가 MCP 를 부르는 도우미. nested 클래스는 자기 서버를 쓰므로 그 테스트 인스턴스로 만든다 */
    private class Mcp(private val test: IntegrationTest) {
        data class Result(val isError: Boolean, val body: JsonNode)

        val base = "http://localhost:${test.environment.getProperty("local.server.port")}"
        private val flow = OAuthFlow(test.anonymous())
        private val http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build()

        /** 등록, 동의, 코드 교환을 거쳐 [appName] 앱의 연결을 만든다 */
        fun connect(session: ApiClient, grantedScope: String, appName: String = "MCP 테스트 앱"): OAuthFlow.Tokens {
            val clientId = flow.register(name = appName)
            val verifier = flow.newVerifier()
            val code = flow.approve(session, clientId, verifier, grantedScope = grantedScope)
            val response = flow.exchange(clientId, code, verifier)
            assertThat(response.status).describedAs("교환: ${response.body}").isEqualTo(200)
            return OAuthFlow.Tokens(response.body["access_token"].asString(), response.body["refresh_token"].asString(), clientId)
        }

        fun grantId(session: ApiClient, appName: String): String {
            val list = session.get("/api/me/connections")
            assertThat(list.status).describedAs(list.body.toString()).isEqualTo(200)
            return list.body.toList().single { it["clientName"].asString() == appName }["id"].asString()
        }

        /** SDK 클라이언트로 initialize 까지 마친다. 요청마다 `Authorization` 을 싣는다 */
        fun client(token: String): McpSyncClient {
            val transport = HttpClientStreamableHttpTransport.builder(base).endpoint("/mcp")
                .clientBuilder(HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)))
                .requestBuilder(HttpRequest.newBuilder().header("Authorization", "Bearer $token"))
                .jsonMapper(JacksonMcpJsonMapper(test.mapper))
                .build()
            return McpClient.sync(transport).requestTimeout(Duration.ofSeconds(30)).build().also { it.initialize() }
        }

        fun call(client: McpSyncClient, name: String, args: Map<String, Any?> = emptyMap()): Result {
            val result = client.callTool(McpSchema.CallToolRequest(name, args))
            val text = (result.content().single() as McpSchema.TextContent).text()
            return Result(result.isError == true, test.mapper.readTree(text))
        }

        fun ok(client: McpSyncClient, name: String, args: Map<String, Any?> = emptyMap()): JsonNode {
            val result = call(client, name, args)
            assertThat(result.isError).describedAs("$name: ${result.body}").isFalse()
            return result.body
        }

        /** SDK 를 거치지 않고 보낸다. 인증과 Origin 의 HTTP 응답을 보려는 것이다 */
        fun raw(method: String, token: String?, body: String?, origin: String? = null): ApiClient.Response {
            val builder = HttpRequest.newBuilder(URI.create("$base/mcp")).timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json").header("Accept", "application/json, text/event-stream")
            token?.let { builder.header("Authorization", "Bearer $it") }
            origin?.let { builder.header("Origin", it) }
            val publisher = body?.let { HttpRequest.BodyPublishers.ofString(it) } ?: HttpRequest.BodyPublishers.noBody()
            val response = http.send(builder.method(method, publisher).build(), HttpResponse.BodyHandlers.ofString())
            val json = runCatching { test.mapper.readTree(response.body()) }.getOrNull() ?: test.mapper.createObjectNode()
            return ApiClient.Response(response.statusCode(), json, response.headers().map())
        }

        fun uniqueTicker() = "M${UUID.randomUUID().toString().take(8)}".uppercase()

        fun trade(externalId: String, ticker: String): Map<String, Any?> = mapOf(
            "broker" to "TOSS", "externalId" to externalId, "side" to "BUY", "market" to "KR", "ticker" to ticker,
            "quantity" to 3, "price" to 1000.0, "currency" to "KRW", "amount" to 3000.0, "executedAt" to "2026-10-24T10:00:00+09:00",
        )
    }

    companion object {
        private const val INITIALIZE =
            """{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}"""
    }
}
