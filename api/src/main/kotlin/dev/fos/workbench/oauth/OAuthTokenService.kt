package dev.fos.workbench.oauth

import com.fasterxml.jackson.annotation.JsonProperty
import dev.fos.workbench.agent.TokenScope
import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.oauth.OAuthExceptionHandler.Companion.INVALID_REQUEST
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** `POST /oauth/token` 의 form 값. 원문(코드, 갱신 토큰, `code_verifier`)이 로그에 남지 않게 문자열로 바꿀 때 뺀다 */
class TokenForm(
    val grantType: String?,
    val code: String?,
    val redirectUri: String?,
    val clientId: String?,
    val codeVerifier: String?,
    val refreshToken: String?,
    val resource: String?,
) {
    override fun toString() = "TokenForm(grantType=$grantType, clientId=$clientId)"
}

/** 토큰 응답(RFC 6749 5.1). 원문이 로그에 남지 않게 문자열로 바꿀 때 뺀다 */
class TokenResponse(
    @get:JsonProperty("access_token") val accessToken: String,
    @get:JsonProperty("token_type") val tokenType: String,
    @get:JsonProperty("expires_in") val expiresIn: Long,
    @get:JsonProperty("refresh_token") val refreshToken: String,
    @get:JsonProperty("scope") val scope: String,
) {
    override fun toString() = "TokenResponse(expiresIn=$expiresIn, scope=$scope)"
}

/**
 * 인가 코드와 갱신 토큰을 접근 토큰으로 바꾸고, 토큰을 폐기한다. 규칙은 docs/api-contract.md 「`POST /oauth/token`」, 「`POST /oauth/revoke`」,
 * 잠금과 지우는 규칙은 docs/data-schema.md 「OAuth 연결」 이다. 원문은 해시로만 찾고 오류 본문과 로그에 담지 않는다.
 *
 * 코드나 이전 갱신 토큰이 다시 쓰이면 연결을 끊고 `invalid_grant` 다. 끊는 쓰기는 예외로 롤백되지 않아야 하므로
 * 트랜잭션 안에서는 예외를 던지지 않고 결과로 돌려주고, 트랜잭션이 커밋된 뒤에 `invalid_grant` 를 던진다.
 */
@Service
class OAuthTokenService(
    private val clients: OAuthClientRepository,
    private val codes: OAuthCodeRepository,
    private val grants: OAuthGrantRepository,
    private val properties: WorkbenchProperties,
    transactionManager: PlatformTransactionManager,
) {
    private val write = TransactionTemplate(transactionManager).apply { timeout = Limits.WRITE_TIMEOUT_SECONDS }

    private val readOnly = TransactionTemplate(transactionManager).apply {
        isReadOnly = true
        timeout = Limits.WRITE_TIMEOUT_SECONDS
    }

    fun token(form: TokenForm): TokenResponse = when (form.grantType) {
        null, "" -> throw invalidRequest("grant_type 이 필요합니다.")
        AUTHORIZATION_CODE -> exchangeCode(form)
        REFRESH_TOKEN -> refresh(form)
        else -> throw OAuthException(HttpStatus.BAD_REQUEST, "unsupported_grant_type", "grant_type 은 authorization_code, refresh_token 가운데 하나입니다.")
    }

    fun exchangeCode(form: TokenForm): TokenResponse {
        val clientId = requireClient(form.clientId)
        val code = required(form.code, "code")
        val redirectUri = required(form.redirectUri, "redirect_uri")
        val verifier = required(form.codeVerifier, "code_verifier")
        requireResource(form.resource)

        val hash = OAuthSecrets.hash(code)
        val issued = write.execute {
            val stored = codes.findLocked(hash) ?: throw invalidGrant()
            if (stored.usedAt != null) {
                // 쓴 코드가 다시 왔다(RFC 6749 10.5). 그 코드로 만든 연결을 끊고 커밋한 뒤 거절한다
                stored.grantId?.let { grants.delete(it) }
                return@execute null
            }
            val now = Instant.now()
            val nowText = Timestamps.system(now)
            if (stored.expiresAt < nowText || stored.clientId != clientId || stored.redirectUri != redirectUri ||
                !pkceMatches(verifier, stored.codeChallenge) || !stored.ownerActive
            ) {
                throw invalidGrant()
            }
            val client = clients.find(clientId) ?: throw invalidGrant()
            val access = issue(OAuthSecrets.ACCESS, now, properties.oauth.accessTokenTtl)
            val refresh = issue(OAuthSecrets.REFRESH, now, properties.oauth.refreshTokenTtl)
            val grant = grants.createReplacing(
                stored.userId,
                mapOf(
                    "id" to UUID.randomUUID().toString(),
                    "clientId" to clientId,
                    "clientName" to client.name,
                    "scope" to stored.scope,
                    "resource" to stored.resource,
                    "accessHash" to access.hash,
                    "accessExpiresAt" to access.expiresAt,
                    "refreshHash" to refresh.hash,
                    "refreshExpiresAt" to refresh.expiresAt,
                    "createdAt" to nowText,
                ),
                properties.oauth.maxGrantsPerUser,
            )
            codes.markUsed(hash, nowText, grant.id)
            response(access, refresh, stored.scope)
        }
        return issued ?: throw invalidGrant()
    }

    fun refresh(form: TokenForm): TokenResponse {
        val clientId = requireClient(form.clientId)
        val refreshToken = required(form.refreshToken, "refresh_token")
        requireResource(form.resource)

        val hash = OAuthSecrets.hash(refreshToken)
        val issued = write.execute {
            val grant = grants.findByRefreshLocked(hash)
            if (grant == null) {
                // 바로 앞의 갱신 토큰이 다시 왔으면 도난으로 보고 연결을 끊고 커밋한 뒤 거절한다
                grants.findByPreviousRefresh(hash)?.let { grants.delete(it) }
                return@execute null
            }
            val now = Instant.now()
            val nowText = Timestamps.system(now)
            if (grant.clientId != clientId || grant.refreshExpiresAt < nowText || !grant.ownerActive) throw invalidGrant()
            val access = issue(OAuthSecrets.ACCESS, now, properties.oauth.accessTokenTtl)
            val refresh = issue(OAuthSecrets.REFRESH, now, properties.oauth.refreshTokenTtl)
            grants.rotate(grant.id, access, refresh, grant.refreshHash, nowText)
            response(access, refresh, grant.scope)
        }
        return issued ?: throw invalidGrant()
    }

    /** 접근 토큰이나 갱신 토큰의 연결을 끊는다. 모르는 토큰이어도 그대로 끝난다(RFC 7009 2.2) */
    fun revoke(token: String?) {
        val raw = required(token, "token")
        val hash = OAuthSecrets.hash(raw)
        write.executeWithoutResult { grants.findByAccessOrRefresh(hash)?.let { grants.delete(it) } }
    }

    /** `client_id` 가 없으면 `invalid_request`, 등록되지 않았으면 `401 invalid_client` 다 */
    private fun requireClient(clientId: String?): String {
        val id = required(clientId, "client_id")
        readOnly.execute { clients.find(id) } ?: throw OAuthException(HttpStatus.UNAUTHORIZED, "invalid_client", "등록되지 않은 client_id 입니다.")
        return id
    }

    private fun requireResource(resource: String?) {
        if (!resource.isNullOrEmpty() && resource != OAuthUrls.resource()) {
            throw OAuthException(HttpStatus.BAD_REQUEST, "invalid_target", "resource 가 이 서버의 자원 주소와 다릅니다.")
        }
    }

    private fun required(value: String?, name: String): String =
        value?.takeIf { it.isNotEmpty() } ?: throw invalidRequest("$name 이 필요합니다.")

    /** `code_verifier` 의 S256 을 저장한 `code_challenge` 와 상수 시간으로 비교한다 */
    private fun pkceMatches(verifier: String, challenge: String): Boolean =
        MessageDigest.isEqual(OAuthSecrets.s256(verifier).toByteArray(Charsets.US_ASCII), challenge.toByteArray(Charsets.US_ASCII))

    private fun issue(prefix: String, now: Instant, ttl: Duration): IssuedSecret {
        val raw = OAuthSecrets.generate(prefix)
        return IssuedSecret(raw, OAuthSecrets.hash(raw), Timestamps.system(now.plus(ttl)))
    }

    private fun response(access: IssuedSecret, refresh: IssuedSecret, scope: String) = TokenResponse(
        accessToken = access.raw,
        tokenType = "Bearer",
        expiresIn = properties.oauth.accessTokenTtl.seconds,
        refreshToken = refresh.raw,
        scope = if (scope == TokenScope.READ.name) "read" else "read write",
    )

    private fun invalidRequest(description: String) = OAuthException(HttpStatus.BAD_REQUEST, INVALID_REQUEST, description)

    private fun invalidGrant() = OAuthException(HttpStatus.BAD_REQUEST, "invalid_grant", "인가 코드나 갱신 토큰이 올바르지 않거나 끝났습니다.")

    companion object {
        const val AUTHORIZATION_CODE = "authorization_code"
        const val REFRESH_TOKEN = "refresh_token"
    }
}
