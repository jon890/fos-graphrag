package dev.fos.workbench.support

import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

/**
 * 브라우저처럼 쿠키를 들고 다니며 XSRF-TOKEN 쿠키 값을 헤더에 담는 테스트용 HTTP 클라이언트.
 * HTTP/2 업그레이드 시도가 Tomcat 과 맞물려 멈추는 일이 있어 HTTP/1.1 로 고정한다.
 */
class ApiClient(private val baseUrl: String, private val mapper: JsonMapper) {

    data class Response(val status: Int, val body: JsonNode, val headers: Map<String, List<String>> = emptyMap()) {
        val code: String? get() = body.get("code")?.asString()
        fun header(name: String): String? = headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value?.firstOrNull()
    }

    private val cookies = CookieManager(null, CookiePolicy.ACCEPT_ALL)
    private val http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).cookieHandler(cookies)
        .followRedirects(HttpClient.Redirect.NEVER).connectTimeout(Duration.ofSeconds(5)).build()

    fun get(path: String): Response = send("GET", path, null)

    fun post(path: String, body: Any? = null): Response = send("POST", path, body)

    fun patch(path: String, body: Any): Response = send("PATCH", path, body)

    fun send(method: String, path: String, body: Any?, withCsrf: Boolean = true): Response {
        val builder = HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(Duration.ofSeconds(30))
            .header("Accept", "application/json")
        if (body != null) builder.header("Content-Type", "application/json")
        val token = xsrfToken()
        if (withCsrf && method != "GET" && token != null) builder.header("X-XSRF-TOKEN", token)
        val publisher = if (body == null) HttpRequest.BodyPublishers.noBody()
        else HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))
        val response = http.send(builder.method(method, publisher).build(), HttpResponse.BodyHandlers.ofString())
        val text = response.body()
        val json = runCatching { if (text.isNullOrBlank()) null else mapper.readTree(text) }.getOrNull() ?: mapper.createObjectNode()
        return Response(response.statusCode(), json, response.headers().map())
    }

    /**
     * 실제 OAuth 리다이렉트 흐름을 탄다. 앱 → 가짜 공급자 로그인 폼 → 앱 콜백.
     * 반환값은 콜백 뒤 앱이 보낸 Location 이다. 성공이면 `/`, 거절이면 `/?login=denied` 다.
     */
    fun oidcLogin(sub: String, email: String, emailVerified: Boolean = true, name: String = email.substringBefore('@')): String {
        val start = raw("GET", URI.create("$baseUrl/oauth2/authorization/google"), null)
        val authorize = URI.create(start.headers().firstValue("Location").orElseThrow())
        val claims = mapper.writeValueAsString(mapOf("email" to email, "email_verified" to emailVerified, "name" to name))
        val form = "username=${enc(sub)}&claims=${enc(claims)}"
        val issued = raw("POST", authorize, form)
        val callback = URI.create(issued.headers().firstValue("Location").orElseThrow())
        val done = raw("GET", callback, null)
        get("/api/auth/csrf")
        return done.headers().firstValue("Location").orElse("")
    }

    fun xsrfToken(): String? = cookies.cookieStore.cookies.firstOrNull { it.name == "XSRF-TOKEN" }?.value

    private fun raw(method: String, uri: URI, form: String?): HttpResponse<String> {
        val builder = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30))
        if (form != null) builder.header("Content-Type", "application/x-www-form-urlencoded")
        val publisher = if (form == null) HttpRequest.BodyPublishers.noBody() else HttpRequest.BodyPublishers.ofString(form)
        return http.send(builder.method(method, publisher).build(), HttpResponse.BodyHandlers.ofString())
    }

    private fun enc(s: String) = URLEncoder.encode(s, Charsets.UTF_8)
}
