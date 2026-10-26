package dev.fos.workbench.oauth

import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

/**
 * 보호 자원 메타데이터(RFC 9728)와 인가 서버 메타데이터(RFC 8414). 본문은 docs/api-contract.md 「메타데이터」 그대로다.
 * 주소는 요청의 `{base}` 로 만든다.
 */
@RestController
class OAuthMetadataController {

    @GetMapping("/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp")
    fun protectedResource(): ResponseEntity<Map<String, Any>> = cached(
        linkedMapOf(
            "resource" to OAuthUrls.resource(),
            "authorization_servers" to listOf(OAuthUrls.base()),
            "scopes_supported" to SCOPES,
            "bearer_methods_supported" to listOf("header"),
            "resource_name" to RESOURCE_NAME,
        ),
    )

    @GetMapping("/.well-known/oauth-authorization-server")
    fun authorizationServer(): ResponseEntity<Map<String, Any>> {
        val base = OAuthUrls.base()
        return cached(
            linkedMapOf(
                "issuer" to base,
                "authorization_endpoint" to "$base/oauth/authorize",
                "token_endpoint" to "$base/oauth/token",
                "registration_endpoint" to "$base${OAuthRegisterController.PATH}",
                "revocation_endpoint" to "$base/oauth/revoke",
                "response_types_supported" to OAuthClientService.RESPONSE_TYPES,
                "grant_types_supported" to OAuthClientService.DEFAULT_GRANT_TYPES,
                "code_challenge_methods_supported" to listOf("S256"),
                "token_endpoint_auth_methods_supported" to listOf(OAuthClientService.AUTH_METHOD_NONE),
                "revocation_endpoint_auth_methods_supported" to listOf(OAuthClientService.AUTH_METHOD_NONE),
                "scopes_supported" to SCOPES,
                "authorization_response_iss_parameter_supported" to true,
            ),
        )
    }

    private fun cached(body: Map<String, Any>): ResponseEntity<Map<String, Any>> =
        ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofSeconds(300))).body(body)

    companion object {
        private const val RESOURCE_NAME = "가치투자 온톨로지"
        private val SCOPES = listOf("read", "write")
    }
}
