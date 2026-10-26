package dev.fos.workbench.oauth

import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.params
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.IntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.test.context.TestPropertySource
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import java.util.UUID

class OAuthRegistrationIntegrationTest : IntegrationTest() {

    private val callback = "http://localhost:53682/callback"

    private fun base() = "http://localhost:${environment.getProperty("local.server.port")}"

    private fun register(body: Map<String, Any?>): ApiClient.Response = anonymous().send("POST", "/oauth/register", body, withCsrf = false)

    private fun assertOAuthError(response: ApiClient.Response, status: Int, error: String, vararg notEchoed: String) {
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(status)
        assertThat(response.body["error"]?.asString()).describedAs(response.body.toString()).isEqualTo(error)
        assertThat(response.body.has("code")).describedAs("ApiError 형식이 아니어야 한다: ${response.body}").isFalse()
        notEchoed.forEach { assertThat(response.body.toString()).describedAs("보낸 값이 오류 본문에 실리면 안 된다").doesNotContain(it) }
    }

    /** ApiClient 는 Content-Type 을 application/json 으로 고정하므로 다른 Content-Type 은 직접 보낸다 */
    private fun postRaw(contentType: String, body: String): Pair<Int, String> {
        val client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build()
        val request = HttpRequest.newBuilder(URI.create(base() + "/oauth/register")).timeout(Duration.ofSeconds(30))
            .header("Content-Type", contentType).POST(HttpRequest.BodyPublishers.ofString(body)).build()
        val response = client.send(request, HttpResponse.BodyHandlers.ofString())
        return response.statusCode() to response.body()
    }

    private fun clientCount(id: String): Long =
        neo4j.query("MATCH (c:OAuthClient {id: \$id}) RETURN count(c) AS n").bind(id).to("id")
            .fetch().one().map { (it["n"] as Number).toLong() }.orElseThrow()

    @Test
    fun `보호 자원 메타데이터는 두 경로가 같은 본문이고 요청 주소로 자원과 인가 서버를 알린다`() {
        val client = anonymous()
        val plain = client.get("/.well-known/oauth-protected-resource")
        val mcp = client.get("/.well-known/oauth-protected-resource/mcp")

        assertThat(plain.status).isEqualTo(200)
        assertThat(mcp.status).isEqualTo(200)
        assertThat(mcp.body).isEqualTo(plain.body)
        assertThat(mcp.body["resource"].asString()).isEqualTo("${base()}/mcp")
        assertThat(mcp.body["authorization_servers"].toList().map { it.asString() }).containsExactly(base())
        assertThat(mcp.body["scopes_supported"].toList().map { it.asString() }).containsExactly("read", "write")
        assertThat(mcp.header("Cache-Control")).isEqualTo("max-age=300")
    }

    @Test
    fun `인가 서버 메타데이터는 네 엔드포인트와 S256, 공개 클라이언트만 알린다`() {
        val response = anonymous().get("/.well-known/oauth-authorization-server")

        assertThat(response.status).isEqualTo(200)
        val body = response.body
        assertThat(body["issuer"].asString()).isEqualTo(base())
        assertThat(body["authorization_endpoint"].asString()).isEqualTo("${base()}/oauth/authorize")
        assertThat(body["token_endpoint"].asString()).isEqualTo("${base()}/oauth/token")
        assertThat(body["registration_endpoint"].asString()).isEqualTo("${base()}/oauth/register")
        assertThat(body["revocation_endpoint"].asString()).isEqualTo("${base()}/oauth/revoke")
        assertThat(body["code_challenge_methods_supported"].toList().map { it.asString() }).containsExactly("S256")
        assertThat(body["token_endpoint_auth_methods_supported"].toList().map { it.asString() }).containsExactly("none")
        assertThat(body["authorization_response_iss_parameter_supported"].asBoolean()).isTrue()
        assertThat(response.header("Cache-Control")).isEqualTo("max-age=300")
    }

    @Test
    fun `등록하면 201 과 UUID client_id 를 주고 이름이 없으면 이름 없는 앱이다`() {
        val response = register(mapOf("redirect_uris" to listOf(callback)))

        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        val body = response.body
        val id = body["client_id"].asString()
        assertThat(UUID.fromString(id).toString()).isEqualTo(id)
        assertThat(body["client_name"].asString()).isEqualTo("이름 없는 앱")
        assertThat(body["token_endpoint_auth_method"].asString()).isEqualTo("none")
        assertThat(body["redirect_uris"].toList().map { it.asString() }).containsExactly(callback)
        assertThat(body["grant_types"].toList().map { it.asString() }).containsExactly("authorization_code", "refresh_token")
        assertThat(body["response_types"].toList().map { it.asString() }).containsExactly("code")
        assertThat(body["client_id_issued_at"].asLong()).isCloseTo(Instant.now().epochSecond, org.assertj.core.data.Offset.offset(60L))
        assertThat(body.has("client_secret")).isFalse()

        val stored = neo4j.query("MATCH (c:OAuthClient {id: \$id}) RETURN properties(c) AS c").bind(id).to("id").fetch().one().orElseThrow()["c"] as Map<*, *>
        assertThat(stored["name"]).isEqualTo("이름 없는 앱")
        assertThat(stored["redirectUris"]).isEqualTo(listOf(callback))
        assertThat(stored.containsKey("approvedAt")).isFalse()
    }

    @Test
    fun `이름을 주면 앞뒤 공백을 지워 저장한다`() {
        val response = register(mapOf("client_name" to "  Claude Code  ", "redirect_uris" to listOf(callback), "token_endpoint_auth_method" to "none"))

        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        assertThat(response.body["client_name"].asString()).isEqualTo("Claude Code")
    }

    @Test
    fun `redirect_uris 가 비었거나 개수나 주소가 규칙을 어기면 invalid_redirect_uri 다`() {
        assertOAuthError(register(mapOf("redirect_uris" to emptyList<String>())), 400, "invalid_redirect_uri")
        assertOAuthError(register(mapOf("client_name" to "앱")), 400, "invalid_redirect_uri")
        assertOAuthError(register(mapOf("redirect_uris" to listOf("http://example.com/cb"))), 400, "invalid_redirect_uri", "example.com")
        assertOAuthError(register(mapOf("redirect_uris" to (1..11).map { "http://localhost:$it/cb" })), 400, "invalid_redirect_uri")
        val long = "https://app.example.com/" + "a".repeat(2001 - "https://app.example.com/".length)
        assertOAuthError(register(mapOf("redirect_uris" to listOf(long))), 400, "invalid_redirect_uri", "aaaaaaaaaa")

        val ten = register(mapOf("redirect_uris" to (1..10).map { "http://localhost:$it/cb" }))
        assertThat(ten.status).describedAs("10개는 받는다: ${ten.body}").isEqualTo(201)
    }

    @Test
    fun `비밀을 쓰는 인증 방식, 긴 이름, 줄바꿈 이름은 invalid_client_metadata 다`() {
        assertOAuthError(
            register(mapOf("redirect_uris" to listOf(callback), "token_endpoint_auth_method" to "client_secret_basic")),
            400, "invalid_client_metadata", "client_secret_basic",
        )
        val longName = "가".repeat(101)
        assertOAuthError(register(mapOf("redirect_uris" to listOf(callback), "client_name" to longName)), 400, "invalid_client_metadata", longName)
        assertOAuthError(register(mapOf("redirect_uris" to listOf(callback), "client_name" to "악성\n앱")), 400, "invalid_client_metadata", "악성")
        assertOAuthError(register(mapOf("redirect_uris" to listOf(callback), "grant_types" to listOf("client_credentials"))), 400, "invalid_client_metadata")
        assertOAuthError(register(mapOf("redirect_uris" to listOf(callback), "response_types" to listOf("token"))), 400, "invalid_client_metadata")

        val hundred = register(mapOf("redirect_uris" to listOf(callback), "client_name" to "가".repeat(100)))
        assertThat(hundred.status).describedAs("100자는 받는다: ${hundred.body}").isEqualTo(201)
    }

    @Test
    fun `등록하면 승인받지 않은 24시간 넘은 클라이언트를 지우고 승인받은 것은 남긴다`() {
        val stale = register(mapOf("redirect_uris" to listOf(callback))).body["client_id"].asString()
        val approved = register(mapOf("redirect_uris" to listOf(callback))).body["client_id"].asString()
        val old = Timestamps.system(Instant.now().minus(Duration.ofHours(25)))
        neo4j.query("MATCH (c:OAuthClient) WHERE c.id IN \$ids SET c.createdAt = \$old")
            .bindAll(params("ids" to listOf(stale, approved), "old" to old)).run()
        neo4j.query("MATCH (c:OAuthClient {id: \$id}) SET c.approvedAt = \$old").bindAll(params("id" to approved, "old" to old)).run()

        assertThat(register(mapOf("redirect_uris" to listOf(callback))).status).isEqualTo(201)

        assertThat(clientCount(stale)).describedAs("승인받지 않은 오래된 클라이언트").isEqualTo(0L)
        assertThat(clientCount(approved)).describedAs("승인받은 클라이언트").isEqualTo(1L)
    }

    @Test
    fun `16KiB 를 넘는 본문은 413 이고 OAuth 형식이다`() {
        val padding = "a".repeat(16 * 1024)
        val response = anonymous().sendRaw("POST", "/oauth/register", """{"redirect_uris":["$callback"],"client_uri":"$padding"}""")

        assertOAuthError(response, 413, "invalid_request")
    }

    @Test
    fun `JSON 이 아닌 본문과 text plain 은 invalid_client_metadata 다`() {
        assertOAuthError(anonymous().sendRaw("POST", "/oauth/register", "not json"), 400, "invalid_client_metadata")
        assertOAuthError(anonymous().sendRaw("POST", "/oauth/register", """["$callback"]"""), 400, "invalid_client_metadata")

        val (status, body) = postRaw("text/plain", """{"redirect_uris":["$callback"]}""")
        assertThat(status).describedAs(body).isEqualTo(400)
        val json = mapper.readTree(body)
        assertThat(json["error"]?.asString()).describedAs(body).isEqualTo("invalid_client_metadata")
        assertThat(json.has("code")).describedAs(body).isFalse()
    }

    @Nested
    @TestPropertySource(properties = ["workbench.oauth.register-rate-limit-per-minute=3"])
    inner class RateLimit : IntegrationTest() {
        @Test
        fun `같은 IP 의 네 번째 등록은 429 와 Retry-After 를 받는다`() {
            val client = anonymous()
            val body = mapOf("redirect_uris" to listOf("http://localhost:53682/callback"))
            repeat(3) {
                val ok = client.send("POST", "/oauth/register", body, withCsrf = false)
                assertThat(ok.status).describedAs("${it + 1}번째: ${ok.body}").isEqualTo(201)
            }

            val denied = client.send("POST", "/oauth/register", body, withCsrf = false)
            assertThat(denied.status).describedAs(denied.body.toString()).isEqualTo(429)
            assertThat(denied.body["error"].asString()).isEqualTo("too_many_requests")
            val retryAfter = denied.header("Retry-After")?.toLongOrNull()
            assertThat(retryAfter).describedAs("Retry-After: ${denied.header("Retry-After")}").isNotNull().isBetween(1L, 60L)
        }
    }
}
