package dev.fos.workbench.agent

import dev.fos.workbench.auth.Role

/**
 * 연동 토큰이나 OAuth 연결로 인증한 요청의 주인. 역할은 요청마다 Neo4j 에서 다시 읽은 값이다.
 * OAuth 연결이면 [tokenId] 는 연결 `id`, [tokenName] 은 `clientName`, [last4] 는 빈 문자열이다.
 */
data class AgentPrincipal(
    val userId: String,
    val displayName: String,
    val role: Role,
    val tokenId: String,
    val tokenName: String,
    val last4: String,
    val scope: TokenScope,
    val kind: ConnectionKind,
)

/** 요청을 인증한 수단. `/mcp` 의 `get_connection` 이 그대로 알린다 */
enum class ConnectionKind {
    INTEGRATION_TOKEN,
    OAUTH,
}
