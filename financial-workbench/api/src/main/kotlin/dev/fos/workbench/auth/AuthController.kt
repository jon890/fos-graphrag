package dev.fos.workbench.auth

import dev.fos.workbench.web.ApiException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.AuthenticationException
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.context.SecurityContextRepository
import org.springframework.security.web.csrf.CsrfToken
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class LoginRequest(@field:NotBlank val username: String, @field:NotBlank val password: String)

class InvalidCredentialsException :
    ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "사용자 이름이나 비밀번호가 올바르지 않습니다.")

@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val authenticationManager: AuthenticationManager,
    private val securityContextRepository: SecurityContextRepository,
) {

    /** 토큰을 읽어 XSRF-TOKEN 쿠키가 응답에 실리게 한다. 클라이언트는 쿠키 값을 헤더에 담는다. */
    @GetMapping("/csrf")
    fun csrf(token: CsrfToken): Map<String, String> {
        token.token
        return mapOf("headerName" to token.headerName, "cookieName" to "XSRF-TOKEN")
    }

    @PostMapping("/login")
    fun login(@Valid @RequestBody body: LoginRequest, request: HttpServletRequest, response: HttpServletResponse): UserRef {
        val authentication = try {
            authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(body.username, body.password))
        } catch (_: AuthenticationException) {
            throw InvalidCredentialsException()
        }
        // 세션 고정 공격을 막기 위해 로그인 때 세션 ID 를 바꾼다
        request.getSession(true)
        request.changeSessionId()
        val context = SecurityContextHolder.createEmptyContext().apply { this.authentication = authentication }
        SecurityContextHolder.setContext(context)
        securityContextRepository.saveContext(context, request, response)
        return (authentication.principal as WorkbenchUser).toRef()
    }

    @PostMapping("/logout")
    fun logout(request: HttpServletRequest): ResponseEntity<Void> {
        request.getSession(false)?.invalidate()
        SecurityContextHolder.clearContext()
        return ResponseEntity.noContent().build()
    }

    @GetMapping("/me")
    fun me(@AuthenticationPrincipal user: WorkbenchUser): UserRef = user.toRef()
}
