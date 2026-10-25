package dev.fos.workbench.agent.v1

import dev.fos.workbench.agent.AgentPrincipal
import dev.fos.workbench.agent.TokenScope
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.proposal.ProposalService
import dev.fos.workbench.trade.SecurityMarkets
import dev.fos.workbench.trade.TradeFilter
import dev.fos.workbench.trade.TradeService
import dev.fos.workbench.web.InsufficientScopeException
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/**
 * 에이전트 API. 연동 토큰으로만 부른다(docs/api-contract.md 「에이전트 API(`/api/v1`)」).
 * 쓰기는 체결과 제안의 두 `POST` 뿐이고, 범위 확인은 메서드 처음에 한다. 경로 규칙으로 막으면 오류 코드가 `FORBIDDEN` 이 된다
 */
@RestController
@RequestMapping("/api/v1")
class AgentV1Controller(
    private val mapper: V1Mapper,
    private val queries: AgentQueryService,
    private val lookups: SecurityLookupService,
    private val properties: WorkbenchProperties,
    private val trades: TradeService,
    private val proposals: ProposalService,
) {

    /** 토큰을 넣은 뒤 연결이 되는지 확인할 때 부른다 */
    @GetMapping("/me")
    fun me(@AuthenticationPrincipal principal: AgentPrincipal): V1Me = V1Me(
        user = V1MeUser(principal.userId, principal.displayName, principal.role.name),
        token = V1MeToken(principal.tokenId, principal.tokenName, principal.last4, principal.scope.name),
        rateLimitPerMinute = properties.agent.rateLimitPerMinute,
        writeRateLimitPerMinute = properties.agent.writeRateLimitPerMinute,
    )

    @GetMapping("/ontology")
    fun ontology(): V1Ontology = mapper.ontology()

    @GetMapping("/nodes")
    fun search(
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) types: List<String>?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
    ): Page<V1NodeSummary> = queries.search(q, types, page, size)

    @GetMapping("/nodes/{id}")
    fun detail(@PathVariable id: String): V1NodeDetail = queries.detail(id)

    @GetMapping("/graph/neighborhood")
    fun neighborhood(
        @RequestParam id: String,
        @RequestParam(required = false, defaultValue = "1") hops: Int,
    ): V1Graph = queries.neighborhood(id, hops)

    @GetMapping("/nodes/{id}/trace")
    fun trace(@PathVariable id: String, @AuthenticationPrincipal principal: AgentPrincipal): V1Trace =
        queries.trace(id, principal.userId)

    /** `ticker` 가 없을 때도 계약의 오류 문구로 답하도록 서비스가 검사한다 */
    @GetMapping("/securities/lookup")
    fun lookup(
        @RequestParam(required = false) market: String?,
        @RequestParam(required = false) ticker: String?,
    ): V1SecurityLookup = lookups.lookup(market, ticker)

    @GetMapping("/me/knowledge")
    fun knowledge(
        @RequestParam(required = false) level: List<String>?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
        @AuthenticationPrincipal principal: AgentPrincipal,
    ): Page<V1StudyItem> = queries.knowledge(principal.userId, level, page, size)

    @PostMapping("/trades")
    fun saveTrades(
        @RequestBody body: Map<String, Any?>,
        @AuthenticationPrincipal principal: AgentPrincipal,
    ): V1Results<V1TradeResult> {
        requireWrite(principal)
        val items = items(body, "trades")
        val saved = trades.save(principal.userId, items, principal.tokenId)
        return V1Results(saved.map { V1TradeResult(it.index, it.status, mapper.trade(it.trade)) })
    }

    @GetMapping("/trades")
    fun trades(
        @RequestParam(required = false) ticker: String?,
        @RequestParam(required = false) from: String?,
        @RequestParam(required = false) to: String?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
        @AuthenticationPrincipal principal: AgentPrincipal,
    ): Page<V1Trade> {
        val errors = linkedMapOf<String, String>()
        val tickerFilter = ticker?.trim()?.takeIf { it.isNotEmpty() }
        if (tickerFilter != null && tickerFilter.length > SecurityMarkets.MAX_TICKER) {
            errors["ticker"] = "${SecurityMarkets.MAX_TICKER}자 이하여야 합니다."
        }
        val fromFilter = instant(from, "from", errors)
        val toFilter = instant(to, "to", errors)
        val query = mapper.page(page, size)
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        val result = trades.list(principal.userId, TradeFilter(ticker = tickerFilter, from = fromFilter, to = toFilter), query)
        return Page(result.items.map(mapper::trade), result.page, result.size, result.totalItems, result.totalPages)
    }

    @PostMapping("/proposals")
    fun submitProposals(
        @RequestBody body: Map<String, Any?>,
        @AuthenticationPrincipal principal: AgentPrincipal,
    ): V1Results<V1ProposalResult> {
        requireWrite(principal)
        val items = items(body, "proposals")
        val saved = proposals.submit(principal.userId, principal.tokenId, principal.tokenName, items)
        return V1Results(saved.map { V1ProposalResult(it.index, it.status, mapper.proposal(it.proposal)) })
    }

    @GetMapping("/proposals")
    fun proposals(
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
        @AuthenticationPrincipal principal: AgentPrincipal,
    ): Page<V1Proposal> {
        val result = proposals.list(principal.userId, status, mapper.page(page, size))
        return Page(result.items.map(mapper::proposal), result.page, result.size, result.totalItems, result.totalPages)
    }

    private fun requireWrite(principal: AgentPrincipal) {
        if (principal.scope != TokenScope.READ_WRITE) throw InsufficientScopeException()
    }

    /**
     * 본문의 최상위 키는 [key] 하나만 받는다. 값은 객체의 배열이어야 한다. 개수와 항목의 칸은 서비스가 검사한다.
     * 키가 없거나 null 이면 null 을 넘겨 서비스가 개수 오류로 답한다
     */
    private fun items(body: Map<String, Any?>, key: String): List<Map<String, Any?>>? {
        val errors = linkedMapOf<String, String>()
        body.keys.filterNot { it == key }.forEach { errors[it] = "알 수 없는 필드입니다." }
        val raw = body[key]
        val list = when (raw) {
            null -> null
            is List<*> -> raw
            else -> null.also { errors[key] = "배열이어야 합니다." }
        }
        list?.forEachIndexed { i, item -> if (item !is Map<*, *>) errors["$key[$i]"] = "객체여야 합니다." }
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        // JSON 객체의 키는 늘 문자열이다
        return list?.map { item -> (item as Map<*, *>).entries.associate { (k, v) -> k.toString() to v } }
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
