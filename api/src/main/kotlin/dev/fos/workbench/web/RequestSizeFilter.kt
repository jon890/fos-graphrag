package dev.fos.workbench.web

import dev.fos.workbench.config.Limits
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import tools.jackson.databind.json.JsonMapper

/**
 * `/api` 의 본문 있는 요청과 `/oauth/`, `/mcp` 의 `POST` 는 Content-Length 가 있어야 하고 상한을 넘으면 읽기 전에 거절한다.
 * 브라우저의 fetch 는 문자열 본문에 Content-Length 를 붙이므로 정상 요청은 영향을 받지 않는다.
 * `/oauth/` 의 거절 본문은 OAuth 형식(`{"error":"invalid_request","error_description":…}`)이고 나머지는 [ApiError] 다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestSizeFilter(private val mapper: JsonMapper) : OncePerRequestFilter() {

    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val uri = request.requestURI
        if (uri.startsWith("/api/")) return request.method in setOf("GET", "HEAD", "OPTIONS")
        return request.method != "POST" || !(isOAuth(uri) || uri == "/mcp" || uri.startsWith("/mcp/"))
    }

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val uri = request.requestURI
        val length = request.contentLengthLong
        val chunked = request.getHeader("Transfer-Encoding")?.contains("chunked", ignoreCase = true) == true
        val max = when {
            isOAuth(uri) -> Limits.MAX_OAUTH_BODY_BYTES
            request.method == "POST" && uri.startsWith("/api/ontology/") -> Limits.MAX_ONTOLOGY_BODY_BYTES
            else -> Limits.MAX_BODY_BYTES
        }
        val tooLarge = "요청 본문이 ${max / 1024}KiB 를 넘습니다."
        val lengthRequired = "요청 본문에 Content-Length 가 필요합니다."
        when {
            length > max -> reject(response, 413, if (isOAuth(uri)) oauthError(tooLarge) else ApiError("PAYLOAD_TOO_LARGE", tooLarge))
            length < 0 && chunked -> reject(response, 411, if (isOAuth(uri)) oauthError(lengthRequired) else ApiError("LENGTH_REQUIRED", lengthRequired))
            else -> chain.doFilter(request, response)
        }
    }

    private fun isOAuth(uri: String) = uri.startsWith("/oauth/")

    /** OAuth 경로의 오류 본문(docs/api-contract.md 「OAuth 인가 서버」). web 이 oauth 패키지를 부르지 않도록 모양만 같게 만든다 */
    private fun oauthError(description: String) = mapOf("error" to "invalid_request", "error_description" to description)

    private fun reject(response: HttpServletResponse, status: Int, error: Any) {
        response.status = status
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = "UTF-8"
        response.writer.write(mapper.writeValueAsString(error))
    }
}
