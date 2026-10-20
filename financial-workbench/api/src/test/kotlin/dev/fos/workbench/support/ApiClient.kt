package dev.fos.workbench.support

import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

/** 브라우저처럼 쿠키를 들고 다니며 XSRF-TOKEN 쿠키 값을 헤더에 담는 테스트용 HTTP 클라이언트. */
class ApiClient(private val baseUrl: String, private val mapper: JsonMapper) {

    data class Response(val status: Int, val body: JsonNode) {
        val code: String? get() = body.get("code")?.asString()
    }

    private val cookies = CookieManager(null, CookiePolicy.ACCEPT_ALL)
    private val http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).cookieHandler(cookies)
        .connectTimeout(java.time.Duration.ofSeconds(5)).build()

    fun get(path: String): Response = send("GET", path, null)

    fun post(path: String, body: Any? = null): Response = send("POST", path, body)

    fun patch(path: String, body: Any): Response = send("PATCH", path, body)

    fun send(method: String, path: String, body: Any?, withCsrf: Boolean = true): Response {
        val builder = HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(java.time.Duration.ofSeconds(30))
            .header("Accept", "application/json")
        if (body != null) builder.header("Content-Type", "application/json")
        val token = xsrfToken()
        if (withCsrf && method != "GET" && token != null) builder.header("X-XSRF-TOKEN", token)
        val publisher = if (body == null) HttpRequest.BodyPublishers.noBody()
        else HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))
        val response = http.send(builder.method(method, publisher).build(), HttpResponse.BodyHandlers.ofString())
        val text = response.body()
        val json = if (text.isNullOrBlank()) mapper.createObjectNode() else mapper.readTree(text)
        return Response(response.statusCode(), json)
    }

    fun login(username: String, password: String): Response {
        get("/api/auth/csrf")
        val response = post("/api/auth/login", mapOf("username" to username, "password" to password))
        get("/api/auth/csrf")
        return response
    }

    fun xsrfToken(): String? = cookies.cookieStore.cookies.firstOrNull { it.name == "XSRF-TOKEN" }?.value
}
