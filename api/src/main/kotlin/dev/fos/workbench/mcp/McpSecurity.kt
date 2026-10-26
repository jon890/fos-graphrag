package dev.fos.workbench.mcp

import dev.fos.workbench.oauth.OAuthUrls
import dev.fos.workbench.web.ApiError
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.web.filter.OncePerRequestFilter
import tools.jackson.databind.json.JsonMapper

/**
 * `/mcp` 의 인증 실패 응답과 `Origin` 검사(docs/api-contract.md 「원격 MCP(`/mcp`)」 의 「연결과 인증」).
 * 둘 다 요청 스레드에서 돌고, 주소는 [OAuthUrls] 를 따른다.
 */
object McpSecurity {

    /**
     * `401 UNAUTHENTICATED` 와 MCP 인증 규격의 `WWW-Authenticate`. 클라이언트는 `resource_metadata` 를 따라 OAuth 로그인을 시작한다.
     * Bearer 토큰을 보냈으면 `error="invalid_token"` 을 더한다. 토큰이 틀렸는지, 끝났는지, 끊겼는지는 가르지 않는다.
     */
    fun entryPoint(mapper: JsonMapper, urls: OAuthUrls) = AuthenticationEntryPoint { request, response, _ ->
        val sent = request.getHeader(HttpHeaders.AUTHORIZATION)?.startsWith("Bearer ") == true
        val challenge = buildString {
            append("Bearer resource_metadata=\"${urls.base()}/.well-known/oauth-protected-resource/mcp\", scope=\"read write\"")
            if (sent) append(", error=\"invalid_token\"")
        }
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, challenge)
        write(mapper, response, 401, ApiError("UNAUTHENTICATED", "연결이 필요합니다. 앱에서 다시 로그인하세요."))
    }

    /**
     * `Origin` 이 있고 이 서버의 `{base}` 와 다르면 인증보다 먼저 `403` 이다. 다른 사이트의 브라우저 페이지가 이 서버를 부르는 것을 막는다(MCP Streamable HTTP 의 보안 권고).
     * 명령줄 클라이언트는 `Origin` 을 보내지 않는다.
     */
    class OriginFilter(private val mapper: JsonMapper, private val urls: OAuthUrls) : OncePerRequestFilter() {
        override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
            val origin = request.getHeader(HttpHeaders.ORIGIN)
            if (origin != null && !origin.equals(urls.base(), ignoreCase = true)) {
                write(mapper, response, 403, ApiError("FORBIDDEN", "이 출처에서 온 요청은 받지 않습니다."))
                return
            }
            chain.doFilter(request, response)
        }
    }

    private fun write(mapper: JsonMapper, response: HttpServletResponse, status: Int, error: ApiError) {
        response.status = status
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = "UTF-8"
        response.writer.write(mapper.writeValueAsString(error))
    }
}
