package dev.fos.workbench.auth

import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class CurrentUser(val id: String, val email: String, val displayName: String, val role: Role)

@RestController
@RequestMapping("/api/auth")
class AuthController(private val users: UserRepository) {

    /** 토큰을 읽어 XSRF-TOKEN 쿠키가 응답에 실리게 한다. 클라이언트는 쿠키 값을 헤더에 담는다. */
    @GetMapping("/csrf")
    fun csrf(token: CsrfToken): Map<String, String> {
        token.token
        return mapOf("headerName" to token.headerName, "cookieName" to "XSRF-TOKEN")
    }

    @GetMapping("/me")
    fun me(@AuthenticationPrincipal principal: WorkbenchPrincipal): CurrentUser {
        val user = users.findById(principal.id) ?: throw IllegalStateException("세션 사용자가 없다")
        return CurrentUser(user.id, user.email, user.displayName, user.role)
    }

    @PostMapping("/logout")
    fun logout(request: HttpServletRequest): ResponseEntity<Void> {
        request.getSession(false)?.invalidate()
        SecurityContextHolder.clearContext()
        return ResponseEntity.noContent().build()
    }
}
