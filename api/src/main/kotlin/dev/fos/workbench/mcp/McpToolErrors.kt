package dev.fos.workbench.mcp

import dev.fos.workbench.web.ApiError
import dev.fos.workbench.web.ApiException
import dev.fos.workbench.web.GlobalExceptionHandler
import io.modelcontextprotocol.spec.McpSchema.CallToolResult
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper

/**
 * 도구 처리기의 예외를 `isError: true` 결과로 바꾼다(docs/api-contract.md 「원격 MCP(`/mcp`)」 의 「도구 오류」).
 * 코드, 문장, `details` 는 [GlobalExceptionHandler] 가 `/api/v1` 에 쓰는 것과 같다. 「조회만」 거절의 문장만 연결을 다시 맺는 방법으로 바꾼다.
 */
@Component
class McpToolErrors(private val handler: GlobalExceptionHandler, private val mapper: JsonMapper) {

    fun result(e: Exception): CallToolResult {
        val error = when (e) {
            is ApiException -> handler.api(e).body
            else -> handler.unexpected(e).body
        } ?: ApiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.")
        val shown = if (error.code == INSUFFICIENT_SCOPE) error.copy(message = INSUFFICIENT_SCOPE_MESSAGE) else error
        return CallToolResult.builder().addTextContent(mapper.writeValueAsString(shown)).isError(true).build()
    }

    companion object {
        private const val INSUFFICIENT_SCOPE = "INSUFFICIENT_SCOPE"
        const val INSUFFICIENT_SCOPE_MESSAGE =
            "조회만 허락된 연결입니다. 기록하려면 더보기 → 연동에서 이 연결을 끊고 앱에서 다시 로그인해 「조회와 기록」 을 고르세요."
    }
}
