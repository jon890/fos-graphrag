package dev.fos.workbench.support

import org.assertj.core.api.Assertions.assertThat
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * 테스트가 OAuth 흐름(등록, 동의, 코드 교환)을 한 줄로 타게 하는 도우미.
 * [client] 는 등록과 토큰 요청을 보낼 쿠키 없는 쪽이고, 동의는 로그인한 세션으로 보낸다.
 */
class OAuthFlow(private val client: ApiClient) {

    data class Tokens(val access: String, val refresh: String, val clientId: String)

    /** 동적 등록하고 client_id 를 돌려준다 */
    fun register(redirectUri: String = REDIRECT_URI, name: String = "테스트 앱"): String {
        val response = client.send("POST", "/oauth/register", mapOf("client_name" to name, "redirect_uris" to listOf(redirectUri)), withCsrf = false)
        assertThat(response.status).describedAs("등록: ${response.body}").isEqualTo(201)
        return response.body["client_id"].asString()
    }

    /** PKCE `code_verifier`. 무작위 32바이트를 base64url 43자로 쓴다 */
    fun newVerifier(): String = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also { random.nextBytes(it) })

    /** 인가 요청 query 값. 동의 화면이 `GET` 의 query 와 `POST` 의 본문에 그대로 싣는다 */
    fun request(clientId: String, verifier: String, scope: String? = null, redirectUri: String = REDIRECT_URI, state: String? = STATE): Map<String, String?> =
        linkedMapOf(
            "response_type" to "code",
            "client_id" to clientId,
            "redirect_uri" to redirectUri,
            "code_challenge" to challenge(verifier),
            "code_challenge_method" to "S256",
            "state" to state,
            "scope" to scope,
        )

    /** 세션으로 「연결 허용」 을 보내고, 돌아온 `redirectUrl` 에서 코드를 읽는다 */
    fun approve(
        session: ApiClient,
        clientId: String,
        verifier: String,
        scope: String? = null,
        grantedScope: String = "READ_WRITE",
        redirectUri: String = REDIRECT_URI,
    ): String {
        val response = session.post(
            "/api/oauth/authorize",
            request(clientId, verifier, scope, redirectUri) + mapOf("decision" to "ALLOW", "grantedScope" to grantedScope),
        )
        assertThat(response.status).describedAs("허용: ${response.body}").isEqualTo(200)
        return query(response.body["redirectUrl"].asString())["code"] ?: error("redirectUrl 에 code 가 없다: ${response.body}")
    }

    fun exchange(clientId: String, code: String, verifier: String?, redirectUri: String = REDIRECT_URI, resource: String? = null): ApiClient.Response =
        client.form(
            "/oauth/token",
            mapOf(
                "grant_type" to "authorization_code", "code" to code, "redirect_uri" to redirectUri, "client_id" to clientId,
                "code_verifier" to verifier, "resource" to resource,
            ),
        )

    fun refresh(clientId: String, refreshToken: String): ApiClient.Response =
        client.form("/oauth/token", mapOf("grant_type" to "refresh_token", "refresh_token" to refreshToken, "client_id" to clientId))

    /** 등록부터 코드 교환까지 한 번에 타고 토큰을 돌려준다 */
    fun connect(session: ApiClient, grantedScope: String = "READ_WRITE"): Tokens {
        val clientId = register()
        val verifier = newVerifier()
        val code = approve(session, clientId, verifier, grantedScope = grantedScope)
        val response = exchange(clientId, code, verifier)
        assertThat(response.status).describedAs("교환: ${response.body}").isEqualTo(200)
        return Tokens(response.body["access_token"].asString(), response.body["refresh_token"].asString(), clientId)
    }

    companion object {
        const val REDIRECT_URI = "http://127.0.0.1:43210/callback"
        const val STATE = "st-테스트 &값"
        private val random = SecureRandom()

        /** S256(RFC 7636 4.2). 서버 구현을 쓰지 않고 따로 계산한다 */
        fun challenge(verifier: String): String =
            Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)))

        /** 주소의 query 를 디코딩해 읽는다 */
        fun query(url: String): Map<String, String> =
            URI(url).rawQuery.orEmpty().split('&').filter { it.isNotEmpty() }.associate {
                val (k, v) = it.split('=', limit = 2).let { parts -> parts[0] to parts.getOrElse(1) { "" } }
                URLDecoder.decode(k, Charsets.UTF_8) to URLDecoder.decode(v, Charsets.UTF_8)
            }
    }
}
