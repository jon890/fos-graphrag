package dev.fos.workbench.oauth

import dev.fos.workbench.auth.Role
import dev.fos.workbench.config.params
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.OAuthFlow
import dev.fos.workbench.support.OAuthFlow.Companion.REDIRECT_URI
import dev.fos.workbench.support.OAuthFlow.Companion.STATE
import dev.fos.workbench.support.raceAll
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.springframework.boot.test.system.CapturedOutput
import org.springframework.boot.test.system.OutputCaptureExtension
import org.springframework.test.context.TestPropertySource
import java.net.URLEncoder
import java.time.Duration
import java.time.Instant

@ExtendWith(OutputCaptureExtension::class)
class OAuthAuthorizationIntegrationTest : IntegrationTest() {

    private fun base() = "http://localhost:${environment.getProperty("local.server.port")}"

    private fun flow() = OAuthFlow(anonymous())

    private fun qs(values: Map<String, String?>) =
        values.entries.filter { it.value != null }.joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, Charsets.UTF_8)}" }

    private fun preview(session: ApiClient, values: Map<String, String?>) = session.get("/api/oauth/authorize?${qs(values)}")

    private fun decide(session: ApiClient, values: Map<String, String?>, decision: String = "ALLOW", grantedScope: String? = "READ_WRITE") =
        session.post("/api/oauth/authorize", values + mapOf("decision" to decision, "grantedScope" to grantedScope))

    private fun connections(session: ApiClient) = session.get("/api/me/connections").also {
        assertThat(it.status).describedAs(it.body.toString()).isEqualTo(200)
    }.body.toList()

    private fun assertOAuthError(response: ApiClient.Response, status: Int, error: String) {
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(status)
        assertThat(response.body["error"]?.asString()).describedAs(response.body.toString()).isEqualTo(error)
        assertThat(response.body.has("code")).describedAs("ApiError 형식이 아니어야 한다: ${response.body}").isFalse()
    }

    /** 앱으로 돌려보낼 오류. GET 과 POST 가 같은 검사를 하므로 둘 다 본다 */
    private fun assertRedirectError(session: ApiClient, values: Map<String, String?>, error: String) {
        for (response in listOf(preview(session, values), decide(session, values))) {
            assertThat(response.status).describedAs(response.body.toString()).isEqualTo(400)
            assertThat(response.code).describedAs(response.body.toString()).isEqualTo("OAUTH_REDIRECT_ERROR")
            val redirectUrl = response.body["details"]["redirectUrl"].asString()
            assertThat(redirectUrl).startsWith("${values["redirect_uri"]}?")
            val query = OAuthFlow.query(redirectUrl)
            assertThat(query["error"]).describedAs(redirectUrl).isEqualTo(error)
            assertThat(query["state"]).describedAs(redirectUrl).isEqualTo(values["state"])
            assertThat(query["iss"]).describedAs(redirectUrl).isEqualTo(base())
        }
    }

    private fun assertInvalidClient(session: ApiClient, values: Map<String, String?>) {
        for (response in listOf(preview(session, values), decide(session, values))) {
            assertThat(response.status).describedAs(response.body.toString()).isEqualTo(400)
            assertThat(response.code).describedAs(response.body.toString()).isEqualTo("OAUTH_INVALID_CLIENT")
            assertThat(response.body["message"].asString()).isEqualTo("연결 요청이 올바르지 않습니다. 앱에서 연결을 다시 시작하세요.")
        }
    }

    private fun codeCount(email: String): Long =
        neo4j.query("MATCH (:User {email: \$email})-[:OWNS]->(c:OAuthCode) RETURN count(c) AS n").bind(email).to("email")
            .fetch().one().map { (it["n"] as Number).toLong() }.orElseThrow()

    @Test
    fun `GET oauth authorize 는 받은 query 를 그대로 붙여 connect 로 302 이동한다`() {
        val withQuery = anonymous().get("/oauth/authorize?x=1")
        assertThat(withQuery.status).isEqualTo(302)
        assertThat(withQuery.header("Location")).endsWith("/connect?x=1")

        val bare = anonymous().get("/oauth/authorize")
        assertThat(bare.status).isEqualTo(302)
        assertThat(bare.header("Location")).endsWith("/connect")
    }

    @Test
    fun `로그인하지 않고 동의 화면 API 를 부르면 401 이다`() {
        val flow = flow()
        val response = preview(anonymous(), flow.request(flow.register(), flow.newVerifier()))

        assertThat(response.status).isEqualTo(401)
        assertThat(response.code).isEqualTo("UNAUTHENTICATED")
    }

    @Test
    fun `열람자가 동의 화면을 보고 허용한 코드를 토큰으로 바꾸면 연결이 하나 생긴다`() {
        val email = newUser(Role.VIEWER, name = "연결하는 열람자")
        val session = loggedIn(email)
        val flow = flow()
        val clientId = flow.register(name = "Claude Code")
        val verifier = flow.newVerifier()
        val values = flow.request(clientId, verifier)

        val shown = preview(session, values)
        assertThat(shown.status).describedAs(shown.body.toString()).isEqualTo(200)
        assertThat(shown.body["clientName"].asString()).isEqualTo("Claude Code")
        assertThat(shown.body["redirectKind"].asString()).isEqualTo("LOOPBACK")
        assertThat(shown.body["redirectHost"].asString()).isEqualTo("127.0.0.1")
        assertThat(shown.body["requestedScope"].asString()).isEqualTo("READ_WRITE")
        assertThat(shown.body["user"]["displayName"].asString()).isEqualTo("연결하는 열람자")

        val allowed = decide(session, values)
        assertThat(allowed.status).describedAs(allowed.body.toString()).isEqualTo(200)
        val redirectUrl = allowed.body["redirectUrl"].asString()
        assertThat(redirectUrl).startsWith("$REDIRECT_URI?code=fwc_")
        val query = OAuthFlow.query(redirectUrl)
        assertThat(query["state"]).isEqualTo(STATE)
        assertThat(query["iss"]).isEqualTo(base())
        assertThat(query["code"]).hasSize(47)

        val token = flow.exchange(clientId, query.getValue("code"), verifier)
        assertThat(token.status).describedAs(token.body.toString()).isEqualTo(200)
        assertThat(token.body["access_token"].asString()).startsWith("fwa_").hasSize(47)
        assertThat(token.body["refresh_token"].asString()).startsWith("fwr_").hasSize(47)
        assertThat(token.body["token_type"].asString()).isEqualTo("Bearer")
        assertThat(token.body["expires_in"].asLong()).isEqualTo(3600L)
        assertThat(token.body["scope"].asString()).isEqualTo("read write")
        assertThat(token.header("Cache-Control")).isEqualTo("no-store")
        assertThat(token.header("Pragma")).isEqualTo("no-cache")

        val rows = connections(session)
        assertThat(rows).hasSize(1)
        assertThat(rows[0]["clientName"].asString()).isEqualTo("Claude Code")
        assertThat(rows[0]["scope"].asString()).isEqualTo("READ_WRITE")
        assertThat(rows[0]["lastUsedAt"].isNull).isTrue()
    }

    @Test
    fun `조회만 요청하면 READ 로만 허용하고 토큰 범위는 read 다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val clientId = flow.register()
        val verifier = flow.newVerifier()
        val values = flow.request(clientId, verifier, scope = "read")

        assertThat(preview(session, values).body["requestedScope"].asString()).isEqualTo("READ")
        val wider = decide(session, values, grantedScope = "READ_WRITE")
        assertThat(wider.status).describedAs(wider.body.toString()).isEqualTo(400)
        assertThat(wider.code).isEqualTo("VALIDATION_FAILED")
        assertThat(wider.body["details"]["fieldErrors"].has("grantedScope")).isTrue()
        val missing = decide(session, values, grantedScope = null)
        assertThat(missing.code).describedAs(missing.body.toString()).isEqualTo("VALIDATION_FAILED")

        val code = flow.approve(session, clientId, verifier, scope = "read", grantedScope = "READ")
        val token = flow.exchange(clientId, code, verifier)
        assertThat(token.body["scope"].asString()).describedAs(token.body.toString()).isEqualTo("read")
        assertThat(connections(session).single()["scope"].asString()).isEqualTo("READ")
    }

    @Test
    fun `PKCE 가 없거나 plain 이거나 43자 base64url 이 아니면 앱으로 invalid_request 를 돌려보낸다`() {
        val session = loggedIn(VIEWER)
        val flow = flow()
        val values = flow.request(flow.register(), flow.newVerifier())

        assertRedirectError(session, values - "code_challenge", "invalid_request")
        assertRedirectError(session, values + ("code_challenge_method" to "plain"), "invalid_request")
        assertRedirectError(session, values - "code_challenge_method", "invalid_request")
        assertRedirectError(session, values + ("code_challenge" to ""), "invalid_request")
        assertRedirectError(session, values + ("code_challenge" to "a".repeat(42)), "invalid_request")
        assertRedirectError(session, values + ("code_challenge" to "a".repeat(42) + "="), "invalid_request")
    }

    @Test
    fun `등록하지 않은 클라이언트나 redirect URI 는 앱으로 돌려보내지 않고 OAUTH_INVALID_CLIENT 다`() {
        val session = loggedIn(VIEWER)
        val flow = flow()
        val values = flow.request(flow.register(), flow.newVerifier())

        assertInvalidClient(session, values + ("redirect_uri" to "http://127.0.0.1:43210/other"))
        assertInvalidClient(session, values + ("redirect_uri" to "http://127.0.0.1:43211/callback"))
        assertInvalidClient(session, values + ("redirect_uri" to "http://127.0.0.1:43210/callback/x"))
        assertInvalidClient(session, values - "redirect_uri")
        assertInvalidClient(session, values + ("client_id" to "00000000-0000-0000-0000-000000000000"))
        assertInvalidClient(session, values - "client_id")
    }

    @Test
    fun `response_type, resource, scope, state 가 틀리면 각자의 오류로 앱에 돌려보낸다`() {
        val session = loggedIn(VIEWER)
        val flow = flow()
        val values = flow.request(flow.register(), flow.newVerifier())

        assertRedirectError(session, values + ("response_type" to "token"), "unsupported_response_type")
        assertRedirectError(session, values + ("resource" to "http://evil.example/mcp"), "invalid_target")
        assertRedirectError(session, values + ("scope" to "admin"), "invalid_scope")
        assertRedirectError(session, values + ("scope" to "read admin"), "invalid_scope")
        assertRedirectError(session, values + ("state" to "s".repeat(501)), "invalid_request")

        assertThat(preview(session, values + ("state" to "s".repeat(500))).status).describedAs("state 500자는 받는다").isEqualTo(200)
        assertThat(preview(session, values + ("resource" to "${base()}/mcp")).status).describedAs("자기 자원 주소는 받는다").isEqualTo(200)
        assertThat(preview(session, values + ("scope" to "write")).body["requestedScope"].asString()).isEqualTo("READ_WRITE")
    }

    @Test
    fun `state 가 없으면 오류 주소에 state 를 붙이지 않는다`() {
        val session = loggedIn(VIEWER)
        val flow = flow()
        val values = flow.request(flow.register(), flow.newVerifier(), state = null) + ("response_type" to "token")

        val response = preview(session, values)
        assertThat(response.code).describedAs(response.body.toString()).isEqualTo("OAUTH_REDIRECT_ERROR")
        assertThat(OAuthFlow.query(response.body["details"]["redirectUrl"].asString())).doesNotContainKey("state").containsKey("iss")
    }

    @Test
    fun `거절하면 앱으로 access_denied 를 돌려보내고 코드를 만들지 않는다`() {
        val email = newUser(Role.VIEWER)
        val session = loggedIn(email)
        val flow = flow()
        val values = flow.request(flow.register(), flow.newVerifier())

        val denied = decide(session, values, decision = "DENY", grantedScope = null)
        assertThat(denied.status).describedAs(denied.body.toString()).isEqualTo(200)
        val query = OAuthFlow.query(denied.body["redirectUrl"].asString())
        assertThat(query["error"]).isEqualTo("access_denied")
        assertThat(query["state"]).isEqualTo(STATE)
        assertThat(query).doesNotContainKey("code")
        assertThat(codeCount(email)).isEqualTo(0L)
    }

    @Test
    fun `CSRF 토큰 없는 허용은 403 이고 코드는 결정한 세션의 사용자에 묶인다`() {
        val aliceEmail = newUser(Role.VIEWER)
        val bobEmail = newUser(Role.VIEWER)
        val alice = loggedIn(aliceEmail)
        val bob = loggedIn(bobEmail)
        val flow = flow()
        val clientId = flow.register()
        val verifier = flow.newVerifier()

        val forged = alice.send(
            "POST", "/api/oauth/authorize",
            flow.request(clientId, verifier) + mapOf("decision" to "ALLOW", "grantedScope" to "READ_WRITE"), withCsrf = false,
        )
        assertThat(forged.status).describedAs(forged.body.toString()).isEqualTo(403)
        assertThat(forged.code).isEqualTo("CSRF_REJECTED")
        assertThat(codeCount(aliceEmail)).isEqualTo(0L)

        val code = flow.approve(bob, clientId, verifier)
        assertThat(flow.exchange(clientId, code, verifier).status).isEqualTo(200)
        assertThat(connections(bob)).hasSize(1)
        assertThat(connections(alice)).isEmpty()
    }

    @Test
    fun `코드는 60초 동안만 쓰고 끝난 코드는 invalid_grant 다`() {
        val email = newUser(Role.VIEWER)
        val session = loggedIn(email)
        val flow = flow()
        val clientId = flow.register()
        val verifier = flow.newVerifier()
        val code = flow.approve(session, clientId, verifier)

        val stored = neo4j.query("MATCH (:User {email: \$email})-[:OWNS]->(c:OAuthCode) RETURN c.createdAt AS createdAt, c.expiresAt AS expiresAt")
            .bind(email).to("email").fetch().one().orElseThrow()
        val ttl = Duration.between(Instant.parse(stored["createdAt"] as String), Instant.parse(stored["expiresAt"] as String))
        assertThat(ttl).isEqualTo(Duration.ofSeconds(60))

        neo4j.query("MATCH (:User {email: \$email})-[:OWNS]->(c:OAuthCode) SET c.expiresAt = \$past")
            .bindAll(params("email" to email, "past" to "2000-01-01T00:00:00.000000Z")).run()
        assertOAuthError(flow.exchange(clientId, code, verifier), 400, "invalid_grant")
        assertThat(connections(session)).isEmpty()
    }

    @Test
    fun `필수 값이 없으면 invalid_request, 모르는 grant_type 은 unsupported_grant_type, 모르는 client_id 는 401 이다`() {
        val session = loggedIn(VIEWER)
        val flow = flow()
        val clientId = flow.register()
        val verifier = flow.newVerifier()
        val code = flow.approve(session, clientId, verifier)
        val client = anonymous()

        assertOAuthError(flow.exchange(clientId, code, verifier = null), 400, "invalid_request")
        assertOAuthError(client.form("/oauth/token", mapOf("code" to code, "client_id" to clientId)), 400, "invalid_request")
        assertOAuthError(client.form("/oauth/token", mapOf("grant_type" to "password", "client_id" to clientId)), 400, "unsupported_grant_type")
        assertOAuthError(flow.exchange("00000000-0000-0000-0000-000000000000", code, verifier), 401, "invalid_client")
        assertOAuthError(client.form("/oauth/revoke", emptyMap()), 400, "invalid_request")

        assertThat(flow.exchange(clientId, code, verifier).status).describedAs("실패한 요청은 코드를 쓰지 않는다").isEqualTo(200)
    }

    @Test
    fun `코드를 만든 요청과 client_id, redirect_uri, code_verifier, resource 가 다르면 거절한다`() {
        val session = loggedIn(VIEWER)
        val flow = flow()
        val clientId = flow.register()
        val other = flow.register()
        val verifier = flow.newVerifier()
        val code = flow.approve(session, clientId, verifier)

        assertOAuthError(flow.exchange(clientId, code, verifier, resource = "http://evil.example/mcp"), 400, "invalid_target")
        assertOAuthError(flow.exchange(other, code, verifier), 400, "invalid_grant")
        assertOAuthError(flow.exchange(clientId, code, verifier, redirectUri = "http://127.0.0.1:43210/other"), 400, "invalid_grant")
        assertOAuthError(flow.exchange(clientId, code, flow.newVerifier()), 400, "invalid_grant")

        assertThat(flow.exchange(clientId, code, verifier, resource = "${base()}/mcp").status).isEqualTo(200)
    }

    @Test
    fun `같은 코드를 두 번 바꾸면 거절하고 첫 번째 연결을 끊는다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val clientId = flow.register()
        val verifier = flow.newVerifier()
        val code = flow.approve(session, clientId, verifier)

        val first = flow.exchange(clientId, code, verifier)
        assertThat(first.status).isEqualTo(200)
        assertThat(connections(session)).hasSize(1)

        assertOAuthError(flow.exchange(clientId, code, verifier), 400, "invalid_grant")
        assertThat(connections(session)).describedAs("재사용으로 끊은 연결").isEmpty()
        assertOAuthError(flow.refresh(clientId, first.body["refresh_token"].asString()), 400, "invalid_grant")
    }

    @Test
    fun `갱신하면 두 토큰이 모두 바뀌고 이전 갱신 토큰을 다시 쓰면 연결이 끊긴다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val tokens = flow.connect(session)

        val refreshed = flow.refresh(tokens.clientId, tokens.refresh)
        assertThat(refreshed.status).describedAs(refreshed.body.toString()).isEqualTo(200)
        val newAccess = refreshed.body["access_token"].asString()
        val newRefresh = refreshed.body["refresh_token"].asString()
        assertThat(newAccess).startsWith("fwa_").isNotEqualTo(tokens.access)
        assertThat(newRefresh).startsWith("fwr_").isNotEqualTo(tokens.refresh)
        assertThat(refreshed.body["scope"].asString()).isEqualTo("read write")
        assertThat(refreshed.header("Cache-Control")).isEqualTo("no-store")
        assertThat(connections(session).single()["lastUsedAt"].isNull).describedAs("갱신도 쓴 것이다").isFalse()

        assertOAuthError(flow.refresh(tokens.clientId, tokens.refresh), 400, "invalid_grant")
        assertOAuthError(flow.refresh(tokens.clientId, newRefresh), 400, "invalid_grant")
        assertThat(connections(session)).isEmpty()
    }

    @Test
    fun `같은 코드를 동시에 두 번 바꾸면 토큰은 많아야 한 번 나간다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val clientId = flow.register()
        val verifier = flow.newVerifier()
        val code = flow.approve(session, clientId, verifier)

        val results = raceAll({ flow().exchange(clientId, code, verifier) }, { flow().exchange(clientId, code, verifier) })

        val statuses = results.map { it.status }
        assertThat(statuses.count { it == 200 }).describedAs("응답 상태: $statuses").isLessThanOrEqualTo(1)
        results.filter { it.status != 200 }.forEach { assertOAuthError(it, 400, "invalid_grant") }
    }

    @Test
    fun `같은 갱신 토큰을 동시에 두 번 보내면 새 토큰은 많아야 한 번 나가고 늦은 요청은 재사용으로 연결을 끊는다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val tokens = flow().connect(session)

        val results = raceAll({ flow().refresh(tokens.clientId, tokens.refresh) }, { flow().refresh(tokens.clientId, tokens.refresh) })

        val statuses = results.map { it.status }
        assertThat(statuses.count { it == 200 }).describedAs("응답 상태: $statuses").isLessThanOrEqualTo(1)
        results.filter { it.status != 200 }.forEach { assertOAuthError(it, 400, "invalid_grant") }
        if (statuses.contains(200)) {
            // 잠금 뒤에 진 쪽은 이미 바뀐 토큰을 보낸 것이라 이전 갱신 토큰의 재사용으로 다룬다
            assertThat(connections(session)).describedAs("재사용으로 끊은 연결").isEmpty()
        }
    }

    @Test
    fun `갱신 요청의 client_id 가 연결의 클라이언트와 다르면 invalid_grant 다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val tokens = flow.connect(session)

        assertOAuthError(flow.refresh(flow.register(), tokens.refresh), 400, "invalid_grant")
        assertThat(flow.refresh(tokens.clientId, tokens.refresh).status).describedAs("연결은 그대로다").isEqualTo(200)
    }

    @Test
    fun `같은 앱으로 다시 연결하면 연결이 한 줄만 남는다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val clientId = flow.register()
        repeat(2) {
            val verifier = flow.newVerifier()
            assertThat(flow.exchange(clientId, flow.approve(session, clientId, verifier), verifier).status).isEqualTo(200)
        }

        assertThat(connections(session)).hasSize(1)
    }

    @Test
    fun `연결을 끊으면 갱신 토큰이 막히고 남의 연결은 끊을 수 없다`() {
        val owner = loggedIn(newUser(Role.VIEWER))
        val stranger = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val tokens = flow.connect(owner)
        val id = connections(owner).single()["id"].asString()

        val foreign = stranger.send("DELETE", "/api/me/connections/$id", null)
        assertThat(foreign.status).isEqualTo(404)
        assertThat(foreign.code).isEqualTo("NOT_FOUND")
        assertThat(connections(owner)).hasSize(1)

        assertThat(owner.send("DELETE", "/api/me/connections/$id", null).status).isEqualTo(204)
        assertThat(connections(owner)).isEmpty()
        assertOAuthError(flow.refresh(tokens.clientId, tokens.refresh), 400, "invalid_grant")
    }

    @Test
    fun `폐기는 갱신 토큰이든 접근 토큰이든 연결을 끊고 모르는 값도 200 이다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val client = anonymous()

        val byRefresh = flow.connect(session)
        val revoked = client.form("/oauth/revoke", mapOf("token" to byRefresh.refresh, "token_type_hint" to "refresh_token"))
        assertThat(revoked.status).isEqualTo(200)
        assertThat(revoked.header("Cache-Control")).isEqualTo("no-store")
        assertThat(connections(session)).isEmpty()
        assertOAuthError(flow.refresh(byRefresh.clientId, byRefresh.refresh), 400, "invalid_grant")

        val byAccess = flow.connect(session)
        assertThat(client.form("/oauth/revoke", mapOf("token" to byAccess.access)).status).isEqualTo(200)
        assertThat(connections(session)).isEmpty()

        assertThat(client.form("/oauth/revoke", mapOf("token" to "fwr_unknown")).status).isEqualTo(200)
    }

    @Test
    fun `주인을 비활성화하면 갱신이 invalid_grant 다`() {
        val email = newUser(Role.VIEWER)
        val session = loggedIn(email)
        val flow = flow()
        val tokens = flow.connect(session)
        val user = users.findByEmail(email)!!

        val disabled = loggedIn(ADMIN).patch("/api/users/${user.id}", mapOf("expectedRevision" to user.revision, "enabled" to false))
        assertThat(disabled.status).describedAs(disabled.body.toString()).isEqualTo(200)

        assertOAuthError(flow.refresh(tokens.clientId, tokens.refresh), 400, "invalid_grant")
    }

    @Test
    fun `토큰 원문은 실패 응답 본문과 로그에 남지 않는다`(output: CapturedOutput) {
        val session = loggedIn(newUser(Role.VIEWER))
        val flow = flow()
        val clientId = flow.register()
        val verifier = flow.newVerifier()
        val code = flow.approve(session, clientId, verifier)

        val wrongVerifier = flow.newVerifier()
        val failedExchange = flow.exchange(clientId, code, wrongVerifier)
        assertOAuthError(failedExchange, 400, "invalid_grant")
        assertThat(failedExchange.body.toString()).doesNotContain(code).doesNotContain(wrongVerifier)

        val token = flow.exchange(clientId, code, verifier)
        val access = token.body["access_token"].asString()
        val refresh = token.body["refresh_token"].asString()
        val reused = flow.exchange(clientId, code, verifier)
        assertThat(reused.body.toString()).doesNotContain(code).doesNotContain(verifier)
        val failedRefresh = flow.refresh(clientId, refresh)
        assertOAuthError(failedRefresh, 400, "invalid_grant")
        assertThat(failedRefresh.body.toString()).doesNotContain(refresh)

        for (secret in listOf(code, verifier, wrongVerifier, access, refresh)) {
            assertThat(output.all).describedAs("로그에 원문이 남으면 안 된다").doesNotContain(secret)
        }
    }

    @Nested
    @TestPropertySource(properties = ["workbench.oauth.token-rate-limit-per-minute=3"])
    inner class RateLimit : IntegrationTest() {
        @Test
        fun `토큰 요청과 폐기 요청은 같은 IP 한도를 함께 써서 넘으면 429 다`() {
            val client = anonymous()
            val calls = listOf(
                { client.form("/oauth/token", mapOf("grant_type" to "password")) },
                { client.form("/oauth/revoke", mapOf("token" to "fwr_unknown")) },
                { client.form("/oauth/token", mapOf("grant_type" to "password")) },
            )
            calls.forEachIndexed { i, call ->
                val ok = call()
                assertThat(ok.status).describedAs("${i + 1}번째: ${ok.body}").isNotEqualTo(429)
            }

            val denied = client.form("/oauth/revoke", mapOf("token" to "fwr_unknown"))
            assertThat(denied.status).describedAs(denied.body.toString()).isEqualTo(429)
            assertThat(denied.body["error"].asString()).isEqualTo("too_many_requests")
            val retryAfter = denied.header("Retry-After")?.toLongOrNull()
            assertThat(retryAfter).describedAs("Retry-After: ${denied.header("Retry-After")}").isNotNull().isBetween(1L, 60L)
        }
    }
}
