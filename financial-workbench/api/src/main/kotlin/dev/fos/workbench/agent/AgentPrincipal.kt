package dev.fos.workbench.agent

import dev.fos.workbench.auth.Role

/** 연동 토큰으로 인증한 요청의 주인. 역할은 요청마다 Neo4j 에서 다시 읽은 값이다 */
data class AgentPrincipal(
    val userId: String,
    val displayName: String,
    val role: Role,
    val tokenId: String,
    val tokenName: String,
    val last4: String,
)
