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
 * `/api` 의 본문 있는 요청은 Content-Length 가 있어야 하고 상한을 넘으면 읽기 전에 거절한다.
 * 브라우저의 fetch 는 문자열 본문에 Content-Length 를 붙이므로 정상 요청은 영향을 받지 않는다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestSizeFilter(private val mapper: JsonMapper) : OncePerRequestFilter() {

    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        !request.requestURI.startsWith("/api/") || request.method in setOf("GET", "HEAD", "OPTIONS")

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val length = request.contentLengthLong
        val chunked = request.getHeader("Transfer-Encoding")?.contains("chunked", ignoreCase = true) == true
        when {
            length > Limits.MAX_BODY_BYTES -> reject(response, 413, ApiError("PAYLOAD_TOO_LARGE", "요청 본문이 ${Limits.MAX_BODY_BYTES / 1024}KiB 를 넘습니다."))
            length < 0 && chunked -> reject(response, 411, ApiError("LENGTH_REQUIRED", "요청 본문에 Content-Length 가 필요합니다."))
            else -> chain.doFilter(request, response)
        }
    }

    private fun reject(response: HttpServletResponse, status: Int, error: ApiError) {
        response.status = status
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = "UTF-8"
        response.writer.write(mapper.writeValueAsString(error))
    }
}
