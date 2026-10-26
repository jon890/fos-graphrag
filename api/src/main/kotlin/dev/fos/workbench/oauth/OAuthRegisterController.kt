package dev.fos.workbench.oauth

import dev.fos.workbench.config.RateLimiter
import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

/**
 * 클라이언트 동적 등록(RFC 7591). 인증 없이 누구나 부르므로 같은 IP 의 요청 수를 센다.
 * IP 는 `remoteAddr` 이고 IPv6 는 /64 로 묶는다([ClientIpKey]). 믿는 프록시 뒤에서는 Tomcat 이 클라이언트 주소로 바꿔 둔다.
 */
@RestController
class OAuthRegisterController(
    private val clients: OAuthClientService,
    @param:Qualifier("oauthRegisterRateLimiter") private val limiter: RateLimiter,
) {

    @PostMapping(PATH)
    fun register(@RequestBody body: Map<String, Any?>, request: HttpServletRequest): ResponseEntity<Any> {
        val decision = limiter.tryAcquire(ClientIpKey.of(request.remoteAddr))
        if (!decision.allowed) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, decision.retryAfterSeconds.toString())
                .body(OAuthErrorBody(OAuthExceptionHandler.TOO_MANY_REQUESTS))
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(clients.register(body))
    }

    companion object {
        const val PATH = "/oauth/register"
    }
}
