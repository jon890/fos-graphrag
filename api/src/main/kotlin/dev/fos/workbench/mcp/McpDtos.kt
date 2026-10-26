package dev.fos.workbench.mcp

import com.fasterxml.jackson.annotation.JsonInclude
import dev.fos.workbench.agent.v1.V1MeUser

/** `get_connection` 의 결과(docs/api-contract.md 「원격 MCP(`/mcp`)」 의 `McpConnection`). 토큰 원문과 끝 네 자리는 담지 않는다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class McpConnection(
    val user: V1MeUser,
    val connection: McpConnectionInfo,
    val rateLimitPerMinute: Int,
    val writeRateLimitPerMinute: Int,
)

/** [kind] 는 `OAUTH` 나 `INTEGRATION_TOKEN` 이다. [id] 와 [name] 은 OAuth 연결이면 연결 id 와 앱 이름, 연동 토큰이면 토큰 id 와 이름이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class McpConnectionInfo(val kind: String, val id: String, val name: String, val scope: String)
