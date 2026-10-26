package dev.fos.workbench.mcp

import dev.fos.workbench.agent.AgentPrincipal
import dev.fos.workbench.agent.ConnectionKind
import dev.fos.workbench.agent.IntegrationTokenService
import dev.fos.workbench.agent.IntegrationTokens
import dev.fos.workbench.agent.TokenScope
import dev.fos.workbench.oauth.OAuthAccessTokenService
import dev.fos.workbench.oauth.OAuthSecrets
import dev.fos.workbench.oauth.OAuthUrls
import org.springframework.stereotype.Component

/**
 * `/mcp` 의 Bearer 토큰을 접두로 갈라 확인한다. 연동 토큰(`fwb_`)과 OAuth 접근 토큰(`fwa_`)을 받고 그 밖은 null 이다.
 * 요청 스레드에서만 부른다. 접근 토큰의 자원 주소를 요청의 scheme 과 host 로 만든다.
 */
@Component
class McpAuthenticator(
    private val tokens: IntegrationTokenService,
    private val accessTokens: OAuthAccessTokenService,
) {

    fun authenticate(raw: String): AgentPrincipal? = when {
        raw.startsWith(IntegrationTokens.PREFIX) -> tokens.authenticate(raw)
        raw.startsWith(OAuthSecrets.ACCESS) -> accessTokens.authenticate(raw, OAuthUrls.resource())?.let { grant ->
            AgentPrincipal(
                userId = grant.userId,
                displayName = grant.displayName,
                role = grant.role,
                tokenId = grant.grantId,
                tokenName = grant.clientName,
                last4 = "",
                // 모르는 값은 조회만 하는 쪽으로 읽는다
                scope = TokenScope.parse(grant.scope) ?: TokenScope.READ,
                kind = ConnectionKind.OAUTH,
            )
        }
        else -> null
    }
}
