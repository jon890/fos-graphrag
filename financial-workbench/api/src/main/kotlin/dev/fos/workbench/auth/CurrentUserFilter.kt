package dev.fos.workbench.auth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken
import org.springframework.web.filter.OncePerRequestFilter

/**
 * 요청마다 세션 사용자의 상태와 역할을 Neo4j 에서 다시 읽는다.
 * 비활성화되거나 지워진 사용자의 세션은 이 요청에서 끊긴다. 역할 변경은 다음 요청부터 반영된다.
 */
class CurrentUserFilter(private val users: UserRepository) : OncePerRequestFilter() {

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        val authentication = SecurityContextHolder.getContext().authentication as? OAuth2AuthenticationToken
        val principal = authentication?.principal as? WorkbenchPrincipal
        if (authentication != null && principal != null) {
            val user = users.findById(principal.id)
            if (user == null || !user.enabled) {
                SecurityContextHolder.clearContext()
                request.getSession(false)?.invalidate()
            } else {
                val refreshed = WorkbenchPrincipal(user.id, user.role.authorities(), principal.idToken, principal.userInfo)
                val context = SecurityContextHolder.createEmptyContext()
                context.authentication = OAuth2AuthenticationToken(refreshed, refreshed.authorities, authentication.authorizedClientRegistrationId)
                SecurityContextHolder.setContext(context)
            }
        }
        chain.doFilter(request, response)
    }
}
