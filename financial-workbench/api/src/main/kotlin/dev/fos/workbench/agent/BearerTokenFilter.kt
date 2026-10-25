package dev.fos.workbench.agent

import dev.fos.workbench.web.ApiError
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.web.filter.OncePerRequestFilter
import tools.jackson.databind.json.JsonMapper

/**
 * `/api/v1` 요청의 `Authorization: Bearer` 연동 토큰으로 인증한다. 빈이 아니고 `SecurityConfig` 가 만들어 건다.
 * 인증에 실패하면 인증을 넣지 않고 넘겨, 뒤의 권한 검사가 401 을 쓴다. 실패 이유는 응답으로 가르지 않는다.
 * 요청 한도는 인증에 성공한 요청만 센다. 헤더 값과 토큰 원문은 로그에 남기지 않는다.
 */
class BearerTokenFilter(
    private val tokens: IntegrationTokenService,
    private val limiter: RateLimiter,
    private val mapper: JsonMapper,
) : OncePerRequestFilter() {

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val header = request.getHeader(HttpHeaders.AUTHORIZATION)
        if (header == null || !header.startsWith(PREFIX)) {
            chain.doFilter(request, response)
            return
        }
        val principal = tokens.authenticate(header.removePrefix(PREFIX).trim())
        if (principal == null) {
            chain.doFilter(request, response)
            return
        }
        val decision = limiter.tryAcquire(principal.tokenId)
        if (!decision.allowed) {
            val seconds = decision.retryAfterSeconds
            response.status = 429
            response.setHeader(HttpHeaders.RETRY_AFTER, seconds.toString())
            response.contentType = MediaType.APPLICATION_JSON_VALUE
            response.characterEncoding = "UTF-8"
            response.writer.write(
                mapper.writeValueAsString(
                    ApiError("RATE_LIMITED", "요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.", mapOf("retryAfterSeconds" to seconds)),
                ),
            )
            return
        }
        val context = SecurityContextHolder.createEmptyContext()
        context.authentication = UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.role.authorities())
        SecurityContextHolder.setContext(context)
        chain.doFilter(request, response)
    }

    companion object {
        private const val PREFIX = "Bearer "
    }
}
