package dev.fos.workbench.agent.v1

import dev.fos.workbench.agent.AgentPrincipal
import dev.fos.workbench.auth.TokenScope
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.trade.SecurityMarkets
import dev.fos.workbench.trade.TradeFilter
import dev.fos.workbench.web.InsufficientScopeException
import dev.fos.workbench.web.ValidationFailedException
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/**
 * `/api/v1` 의 컨트롤러와 `/mcp` 의 도구가 함께 쓰는 입력 검사. 오류 문구는 docs/api-contract.md 「에이전트 API(`/api/v1`)」 와 같다.
 */
object V1Inputs {

    /** 쓰기는 「조회와 기록」 범위만 한다 */
    fun requireWrite(principal: AgentPrincipal) {
        if (principal.scope != TokenScope.READ_WRITE) throw InsufficientScopeException()
    }

    /**
     * 본문은 객체여야 하고 최상위 키는 [key] 하나만 받는다. 값은 객체의 배열이어야 한다. 개수와 항목의 칸은 서비스가 검사한다.
     * 키가 없거나 null 이면 null 을 넘겨 서비스가 개수 오류로 답한다
     */
    fun items(raw: Any?, key: String): List<Map<String, Any?>>? {
        val body = raw as? Map<*, *> ?: throw ValidationFailedException(mapOf("body" to "객체여야 합니다."))
        val errors = linkedMapOf<String, String>()
        body.keys.filterNot { it == key }.forEach { errors[it.toString()] = "알 수 없는 필드입니다." }
        val value = body[key]
        val list = when (value) {
            null -> null
            is List<*> -> value
            else -> null.also { errors[key] = "배열이어야 합니다." }
        }
        list?.forEachIndexed { i, item -> if (item !is Map<*, *>) errors["$key[$i]"] = "객체여야 합니다." }
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        // JSON 객체의 키는 늘 문자열이다
        return list?.map { item -> (item as Map<*, *>).entries.associate { (k, v) -> k.toString() to v } }
    }

    /** 체결 목록의 조건. 틀린 칸을 모두 모아 한 번에 거절한다 */
    fun tradeFilter(ticker: String?, from: String?, to: String?): TradeFilter {
        val errors = linkedMapOf<String, String>()
        val tickerFilter = ticker?.trim()?.takeIf { it.isNotEmpty() }
        if (tickerFilter != null && tickerFilter.length > SecurityMarkets.MAX_TICKER) {
            errors["ticker"] = "${SecurityMarkets.MAX_TICKER}자 이하여야 합니다."
        }
        val fromFilter = instant(from, "from", errors)
        val toFilter = instant(to, "to", errors)
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        return TradeFilter(ticker = tickerFilter, from = fromFilter, to = toFilter)
    }

    /** 오프셋이 붙은 ISO-8601 시각을 저장 형식(UTC 초)으로 바꾼다. 틀리면 [errors] 에 남기고 null 이다 */
    private fun instant(value: String?, field: String, errors: MutableMap<String, String>): String? {
        val text = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return try {
            Timestamps.user(OffsetDateTime.parse(text).toInstant())
        } catch (_: DateTimeParseException) {
            errors[field] = "오프셋이 붙은 ISO-8601 시각이어야 합니다."
            null
        }
    }
}
