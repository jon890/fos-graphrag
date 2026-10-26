package dev.fos.workbench.oauth

import dev.fos.workbench.auth.WorkbenchPrincipal
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * 동의 화면이 부르는 세션 API(docs/api-contract.md 「인가 요청과 동의」). 오류는 `{code, message, details}` 형식이다.
 * 결정(`POST`)은 다른 쓰기와 같이 CSRF 토큰이 필요하다. 다른 사이트가 사용자 몰래 「연결 허용」 을 보내지 못한다.
 */
@RestController
@RequestMapping("/api/oauth/authorize")
class OAuthConsentController(private val authorization: OAuthAuthorizationService) {

    @GetMapping
    fun preview(
        @RequestParam("response_type", required = false) responseType: String?,
        @RequestParam("client_id", required = false) clientId: String?,
        @RequestParam("redirect_uri", required = false) redirectUri: String?,
        @RequestParam("code_challenge", required = false) codeChallenge: String?,
        @RequestParam("code_challenge_method", required = false) codeChallengeMethod: String?,
        @RequestParam("state", required = false) state: String?,
        @RequestParam("scope", required = false) scope: String?,
        @RequestParam("resource", required = false) resource: String?,
        @AuthenticationPrincipal user: WorkbenchPrincipal,
    ): AuthorizationPreview = authorization.preview(
        user.id,
        AuthorizationRequest(responseType, clientId, redirectUri, codeChallenge, codeChallengeMethod, state, scope, resource),
    )

    @PostMapping
    fun decide(@RequestBody body: ConsentDecisionRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): ConsentRedirect =
        ConsentRedirect(authorization.decide(user.id, body.toRequest(), body.decision, body.grantedScope))
}
