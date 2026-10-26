package dev.fos.workbench.oauth

import dev.fos.workbench.agent.TokenScope
import dev.fos.workbench.web.ApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import java.net.URI
import java.net.URLEncoder

/**
 * 인가 요청의 query 값. 서버에 저장하지 않는다. 동의 화면이 들고 있다가 `GET`, `POST` 때마다 보내고 서버는 그때마다 다시 검사한다.
 * 그래서 대기 중인 요청을 저장할 노드와 만료 정리가 없다.
 */
data class AuthorizationRequest(
    val responseType: String?,
    val clientId: String?,
    val redirectUri: String?,
    val codeChallenge: String?,
    val codeChallengeMethod: String?,
    val state: String?,
    val scope: String?,
    val resource: String?,
)

enum class RedirectKind { LOOPBACK, HTTPS }

/** 검사를 통과한 인가 요청. `requestedScope` 는 요청한 범위로 고를 수 있는 가장 넓은 값이다 */
data class ValidatedRequest(
    val client: OAuthClientRecord,
    val redirectUri: String,
    val codeChallenge: String,
    val state: String?,
    val resource: String,
    val requestedScope: TokenScope,
    val redirectKind: RedirectKind,
    val redirectHost: String,
)

/**
 * 인가 요청 검사. 순서와 실패 응답은 docs/api-contract.md 「인가 요청과 동의」 의 표 그대로다.
 * 클라이언트와 redirect URI 에 걸리면 앱으로 돌려보낼 수 없어 `OAUTH_INVALID_CLIENT` 이고,
 * 그 뒤에 걸리면 앱에 알릴 오류 주소를 `details.redirectUrl` 에 담은 `OAUTH_REDIRECT_ERROR` 다.
 */
@Component
class AuthorizationRequestValidator(private val clients: OAuthClientRepository) {

    fun validate(request: AuthorizationRequest): ValidatedRequest {
        val client = request.clientId?.takeIf { it.isNotEmpty() }?.let { clients.find(it) } ?: throw invalidClient()
        val redirectUri = request.redirectUri
        if (redirectUri == null || client.redirectUris.none { RedirectUris.matches(it, redirectUri) }) throw invalidClient()

        fun reject(error: String, message: String): Nothing = throw redirectError(redirectUri, error, request.state, message)

        if (request.responseType != RESPONSE_TYPE) reject("unsupported_response_type", "지원하지 않는 응답 형식입니다. 앱에서 연결을 다시 시작하세요.")
        val challenge = request.codeChallenge
        if (challenge == null || !CODE_CHALLENGE.matches(challenge) || request.codeChallengeMethod != CHALLENGE_METHOD) {
            reject(INVALID_REQUEST, "연결 요청에 PKCE(S256) 값이 없거나 올바르지 않습니다. 앱에서 연결을 다시 시작하세요.")
        }
        val resource = OAuthUrls.resource()
        if (!request.resource.isNullOrEmpty() && request.resource != resource) {
            reject("invalid_target", "연결 요청의 자원 주소가 이 서버와 다릅니다. 앱의 서버 주소를 확인하세요.")
        }
        val scope = requestedScope(request.scope) ?: reject("invalid_scope", "연결 요청의 범위를 알 수 없습니다. 앱에서 연결을 다시 시작하세요.")
        if (request.state != null && request.state.length > MAX_STATE) reject(INVALID_REQUEST, "연결 요청의 state 가 너무 깁니다.")

        val kind = if (RedirectUris.isLoopback(redirectUri)) RedirectKind.LOOPBACK else RedirectKind.HTTPS
        return ValidatedRequest(
            client = client,
            redirectUri = redirectUri,
            codeChallenge = challenge,
            state = request.state,
            resource = resource,
            requestedScope = scope,
            redirectKind = kind,
            redirectHost = URI(redirectUri).host,
        )
    }

    /** 「범위」 표. 비었거나 없으면 `READ_WRITE`, `write` 가 있으면 `READ_WRITE`, `read` 만 있으면 `READ` 다. 모르는 값이 있으면 null 이다 */
    private fun requestedScope(scope: String?): TokenScope? {
        val values = scope.orEmpty().split(' ').filter { it.isNotEmpty() }.toSet()
        if (!SCOPES.containsAll(values)) return null
        return if (values == setOf(READ_SCOPE)) TokenScope.READ else TokenScope.READ_WRITE
    }

    private fun invalidClient() =
        ApiException(HttpStatus.BAD_REQUEST, "OAUTH_INVALID_CLIENT", "연결 요청이 올바르지 않습니다. 앱에서 연결을 다시 시작하세요.")

    private fun redirectError(redirectUri: String, error: String, state: String?, message: String) =
        ApiException(
            HttpStatus.BAD_REQUEST, "OAUTH_REDIRECT_ERROR", message,
            mapOf("redirectUrl" to redirectUrl(redirectUri, linkedMapOf("error" to error, "state" to state))),
        )

    companion object {
        const val RESPONSE_TYPE = "code"
        const val CHALLENGE_METHOD = "S256"
        const val MAX_STATE = 500
        const val READ_SCOPE = "read"
        const val INVALID_REQUEST = "invalid_request"
        private val SCOPES = setOf(READ_SCOPE, "write")

        /** SHA-256 32바이트를 채움 문자 없는 base64url 로 쓰면 43자다 */
        private val CODE_CHALLENGE = Regex("^[A-Za-z0-9_-]{43}$")

        /**
         * 앱으로 돌아갈 주소. [values] 에서 null 은 빼고 끝에 `iss={base}` 를 붙인다(RFC 9207). 값은 URL 인코딩한다.
         * redirect URI 에 이미 query 가 있으면 `&` 로 잇는다.
         */
        fun redirectUrl(redirectUri: String, values: Map<String, String?>): String {
            val query = (values + ("iss" to OAuthUrls.base())).entries.filter { it.value != null }
                .joinToString("&") { "${it.key}=${URLEncoder.encode(it.value, Charsets.UTF_8)}" }
            val separator = when {
                redirectUri.endsWith('?') -> ""
                redirectUri.contains('?') -> "&"
                else -> "?"
            }
            return redirectUri + separator + query
        }
    }
}
