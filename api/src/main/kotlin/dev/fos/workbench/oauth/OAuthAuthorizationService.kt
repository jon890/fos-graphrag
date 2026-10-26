package dev.fos.workbench.oauth

import com.fasterxml.jackson.annotation.JsonProperty
import dev.fos.workbench.auth.TokenScope
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

/** 동의 화면에 보일 내용(docs/api-contract.md 「인가 요청과 동의」) */
data class AuthorizationPreview(
    val clientName: String,
    val redirectKind: RedirectKind,
    val redirectHost: String,
    val requestedScope: TokenScope,
    val user: PreviewUser,
) {
    data class PreviewUser(val displayName: String)
}

/** 「연결 허용」 과 「거절」 의 본문. 인가 요청의 query 값과 결정이다 */
data class ConsentDecisionRequest(
    @JsonProperty("response_type") val responseType: String? = null,
    @JsonProperty("client_id") val clientId: String? = null,
    @JsonProperty("redirect_uri") val redirectUri: String? = null,
    @JsonProperty("code_challenge") val codeChallenge: String? = null,
    @JsonProperty("code_challenge_method") val codeChallengeMethod: String? = null,
    @JsonProperty("state") val state: String? = null,
    @JsonProperty("scope") val scope: String? = null,
    @JsonProperty("resource") val resource: String? = null,
    val decision: String? = null,
    val grantedScope: String? = null,
) {
    fun toRequest() = AuthorizationRequest(responseType, clientId, redirectUri, codeChallenge, codeChallengeMethod, state, scope, resource)
}

data class ConsentRedirect(val redirectUrl: String)

/**
 * 동의 화면이 부르는 인가 요청 검사와 결정. 코드는 결정한 세션의 사용자에 묶인다.
 * 이 결정은 변경 이력에 남지 않는다(docs/data-schema.md 「OAuth 연결」).
 */
@Service
class OAuthAuthorizationService(
    private val validator: AuthorizationRequestValidator,
    private val clients: OAuthClientRepository,
    private val codes: OAuthCodeRepository,
    private val users: UserRepository,
    private val properties: WorkbenchProperties,
) {

    @Transactional(readOnly = true)
    fun preview(userId: String, request: AuthorizationRequest): AuthorizationPreview {
        val validated = validator.validate(request)
        // 세션 필터가 지운 사용자를 먼저 막으므로 정상 흐름에서는 null 이 나오지 않는다
        val user = users.findById(userId) ?: throw IllegalStateException("사용자를 찾을 수 없다: $userId")
        return AuthorizationPreview(
            clientName = validated.client.name,
            redirectKind = validated.redirectKind,
            redirectHost = validated.redirectHost,
            requestedScope = validated.requestedScope,
            user = AuthorizationPreview.PreviewUser(user.displayName),
        )
    }

    /** 같은 검사를 다시 한 뒤 앱으로 돌아갈 주소를 돌려준다. `ALLOW` 면 클라이언트에 승인 시각을 남기고 코드를 만든다 */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun decide(userId: String, request: AuthorizationRequest, decision: String?, grantedScope: String?): String {
        val validated = validator.validate(request)
        when (decision) {
            DENY -> return validator.redirectUrl(
                validated.redirectUri, linkedMapOf("error" to "access_denied", "state" to validated.state),
            )
            ALLOW -> Unit
            else -> throw ValidationFailedException(mapOf("decision" to "ALLOW, DENY 가운데 하나여야 합니다."))
        }
        val scope = TokenScope.parse(grantedScope)
        if (scope == null || (validated.requestedScope == TokenScope.READ && scope == TokenScope.READ_WRITE)) {
            throw ValidationFailedException(mapOf("grantedScope" to "요청한 범위 안에서 READ, READ_WRITE 가운데 하나여야 합니다."))
        }

        val now = Instant.now()
        val nowText = Timestamps.system(now)
        clients.markApproved(validated.client.id, nowText)
        val raw = OAuthSecrets.generate(OAuthSecrets.CODE)
        codes.create(
            userId,
            mapOf(
                "hash" to OAuthSecrets.hash(raw),
                "clientId" to validated.client.id,
                "redirectUri" to validated.redirectUri,
                "scope" to scope.name,
                "codeChallenge" to validated.codeChallenge,
                "resource" to validated.resource,
                "createdAt" to nowText,
                "expiresAt" to Timestamps.system(now.plus(properties.oauth.codeTtl)),
            ),
            nowText,
        )
        return validator.redirectUrl(validated.redirectUri, linkedMapOf("code" to raw, "state" to validated.state))
    }

    companion object {
        const val ALLOW = "ALLOW"
        const val DENY = "DENY"
    }
}
