package dev.fos.workbench.oauth

import dev.fos.workbench.config.RateLimiter
import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * 토큰 발급과 폐기(RFC 6749, RFC 7009). 본문은 `application/x-www-form-urlencoded` 다.
 * 매핑에 `consumes` 를 두지 않는다. 두면 다른 Content-Type 이 핸들러를 정하기 전에 거절돼 [OAuthExceptionHandler] 가 받지 못한다.
 * 두 경로는 같은 IP 의 요청 수를 함께 센다. 요청 본문과 원문은 로그에 남기지 않는다.
 */
@RestController
class OAuthTokenController(
    private val tokens: OAuthTokenService,
    @param:Qualifier("oauthTokenRateLimiter") private val limiter: RateLimiter,
) {

    @PostMapping(TOKEN_PATH)
    fun token(
        @RequestParam("grant_type", required = false) grantType: String?,
        @RequestParam("code", required = false) code: String?,
        @RequestParam("redirect_uri", required = false) redirectUri: String?,
        @RequestParam("client_id", required = false) clientId: String?,
        @RequestParam("code_verifier", required = false) codeVerifier: String?,
        @RequestParam("refresh_token", required = false) refreshToken: String?,
        @RequestParam("resource", required = false) resource: String?,
        request: HttpServletRequest,
    ): ResponseEntity<Any> {
        limited(request)?.let { return it }
        val response = tokens.token(TokenForm(grantType, code, redirectUri, clientId, codeVerifier, refreshToken, resource))
        return noStore(ResponseEntity.ok()).body(response)
    }

    /** `token_type_hint` 는 읽지 않는다. 접근 토큰과 갱신 토큰을 모두 찾는다 */
    @PostMapping(REVOKE_PATH)
    fun revoke(@RequestParam("token", required = false) token: String?, request: HttpServletRequest): ResponseEntity<Any> {
        limited(request)?.let { return it }
        tokens.revoke(token)
        return noStore(ResponseEntity.ok()).build()
    }

    /** IP 는 `remoteAddr` 이고 IPv6 는 /64 로 묶는다([ClientIpKey]). 믿는 프록시 뒤에서는 Tomcat 이 클라이언트 주소로 바꿔 둔다 */
    private fun limited(request: HttpServletRequest): ResponseEntity<Any>? {
        val decision = limiter.tryAcquire(ClientIpKey.of(request.remoteAddr))
        if (decision.allowed) return null
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header(HttpHeaders.RETRY_AFTER, decision.retryAfterSeconds.toString())
            .body(OAuthErrorBody(OAuthExceptionHandler.TOO_MANY_REQUESTS))
    }

    private fun noStore(builder: ResponseEntity.BodyBuilder) = builder.cacheControl(CacheControl.noStore()).header(HttpHeaders.PRAGMA, "no-cache")

    companion object {
        const val TOKEN_PATH = "/oauth/token"
        const val REVOKE_PATH = "/oauth/revoke"
    }
}
