package dev.fos.workbench.oauth

import com.fasterxml.jackson.annotation.JsonProperty
import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.oauth.OAuthExceptionHandler.Companion.INVALID_CLIENT_METADATA
import dev.fos.workbench.oauth.OAuthExceptionHandler.Companion.INVALID_REDIRECT_URI
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant

/** 등록 응답(RFC 7591 3.2.1). 클라이언트 비밀은 발급하지 않는다 */
data class RegisteredClient(
    @get:JsonProperty("client_id") val clientId: String,
    @get:JsonProperty("client_id_issued_at") val clientIdIssuedAt: Long,
    @get:JsonProperty("client_name") val clientName: String,
    @get:JsonProperty("redirect_uris") val redirectUris: List<String>,
    @get:JsonProperty("grant_types") val grantTypes: List<String>,
    @get:JsonProperty("response_types") val responseTypes: List<String>,
    @get:JsonProperty("token_endpoint_auth_method") val tokenEndpointAuthMethod: String,
)

/**
 * 클라이언트 동적 등록. 검사 순서와 기본값은 docs/api-contract.md 「`POST /oauth/register`」 이다.
 * 공개 클라이언트(`token_endpoint_auth_method: none`)만 받는다. 목록에 없는 필드는 읽지 않는다.
 */
@Service
class OAuthClientService(private val clients: OAuthClientRepository, private val properties: WorkbenchProperties) {

    /**
     * 승인받지 않은 오래된 클라이언트를 같은 트랜잭션에서 먼저 지운다. 누구나 등록할 수 있어 쌓이지 않게 한다.
     * 지운 뒤에도 승인받지 않은 클라이언트가 상한만큼 있으면 `503 temporarily_unavailable` 이다. IP 한도를 돌려 피하는 등록이 저장소를 채우지 못하게 한다.
     */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun register(body: Map<String, Any?>): RegisteredClient {
        val redirectUris = redirectUris(body["redirect_uris"])
        val name = clientName(body["client_name"])
        val authMethod = body["token_endpoint_auth_method"] ?: AUTH_METHOD_NONE
        if (authMethod != AUTH_METHOD_NONE) invalidMetadata("token_endpoint_auth_method 는 none 만 받습니다.")
        val grantTypes = stringList(body["grant_types"], DEFAULT_GRANT_TYPES)
        if (grantTypes == null || grantTypes.isEmpty() || !DEFAULT_GRANT_TYPES.containsAll(grantTypes)) {
            invalidMetadata("grant_types 는 authorization_code, refresh_token 가운데에서 고릅니다.")
        }
        val responseTypes = stringList(body["response_types"], RESPONSE_TYPES)
        if (responseTypes != RESPONSE_TYPES) invalidMetadata("response_types 는 code 만 받습니다.")

        clients.deleteStaleUnapproved(Timestamps.system(Instant.now().minus(UNAPPROVED_RETENTION)))
        if (clients.countUnapproved() >= properties.oauth.maxUnapprovedClients) {
            throw OAuthException(HttpStatus.SERVICE_UNAVAILABLE, "temporarily_unavailable", "등록이 몰려 잠시 받지 않습니다. 잠시 뒤 다시 시도하세요.")
        }
        val created = clients.create(name, redirectUris)
        return RegisteredClient(
            clientId = created.id,
            clientIdIssuedAt = Instant.parse(created.createdAt).epochSecond,
            clientName = created.name,
            redirectUris = created.redirectUris,
            grantTypes = grantTypes,
            responseTypes = responseTypes,
            tokenEndpointAuthMethod = AUTH_METHOD_NONE,
        )
    }

    private fun redirectUris(value: Any?): List<String> {
        val list = value as? List<*>
        if (list == null || list.isEmpty() || list.size > MAX_REDIRECT_URIS) {
            invalidRedirect("redirect_uris 는 1개 이상 ${MAX_REDIRECT_URIS}개 이하여야 합니다.")
        }
        return list.map { uri ->
            if (uri !is String || !RedirectUris.validate(uri, properties.oauth.allowedHttpsRedirectHosts)) {
                invalidRedirect(
                    "redirect_uris 의 값은 fragment 가 없는 ${RedirectUris.MAX_LENGTH}자 이하의 절대 주소이고, " +
                        "http://127.0.0.1, http://localhost, http://[::1] 의 loopback 이거나 서버가 허용한 host 의 https 여야 합니다.",
                )
            }
            uri
        }
    }

    private fun clientName(value: Any?): String {
        if (value == null) return DEFAULT_NAME
        if (value !is String) invalidMetadata("client_name 은 문자열이어야 합니다.")
        val name = value.trim()
        if (name.isEmpty()) return DEFAULT_NAME
        if (name.codePointCount(0, name.length) > MAX_NAME || name.any { it.isISOControl() || it in LINE_SEPARATORS }) {
            invalidMetadata("client_name 은 ${MAX_NAME}자 이하이고 줄바꿈 같은 제어 문자가 없어야 합니다.")
        }
        return name
    }

    /** 없으면 기본값, 문자열 목록이 아니면 null, 아니면 중복을 뺀 목록이다 */
    private fun stringList(value: Any?, default: List<String>): List<String>? {
        if (value == null) return default
        val list = value as? List<*> ?: return null
        if (list.any { it !is String }) return null
        return list.map { it as String }.distinct()
    }

    private fun invalidRedirect(description: String): Nothing = throw OAuthException(HttpStatus.BAD_REQUEST, INVALID_REDIRECT_URI, description)

    private fun invalidMetadata(description: String): Nothing = throw OAuthException(HttpStatus.BAD_REQUEST, INVALID_CLIENT_METADATA, description)

    companion object {
        const val DEFAULT_NAME = "이름 없는 앱"
        const val MAX_NAME = 100
        const val MAX_REDIRECT_URIS = 10
        const val AUTH_METHOD_NONE = "none"
        val DEFAULT_GRANT_TYPES = listOf("authorization_code", "refresh_token")
        val RESPONSE_TYPES = listOf("code")
        private val LINE_SEPARATORS = setOf('\u2028', '\u2029')
        private val UNAPPROVED_RETENTION: Duration = Duration.ofHours(24)
    }
}
