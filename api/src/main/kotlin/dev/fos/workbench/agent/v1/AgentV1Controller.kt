package dev.fos.workbench.agent.v1

import dev.fos.workbench.agent.AgentPrincipal
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.proposal.ProposalService
import dev.fos.workbench.trade.TradeService
import dev.fos.workbench.web.Page
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * 에이전트 API. 연동 토큰으로만 부른다(docs/api-contract.md 「에이전트 API(`/api/v1`)」).
 * 쓰기는 체결과 제안의 두 `POST` 뿐이고, 범위 확인은 메서드 처음에 한다. 경로 규칙으로 막으면 오류 코드가 `FORBIDDEN` 이 된다.
 * 본문은 아무 JSON 값으로 받는다. 객체로 받으면 배열 본문이 범위 확인 전에 `400` 으로 막힌다
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

    @GetMapping("/ontology/yaml")
    fun ontologyYaml(): V1OntologyYaml = queries.ontologyYaml()

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
        @RequestBody(required = false) body: Any?,
        @AuthenticationPrincipal principal: AgentPrincipal,
    ): V1Results<V1TradeResult> {
        V1Inputs.requireWrite(principal)
        val items = V1Inputs.items(body, "trades")
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
        // 쪽 크기 오류가 조건 오류보다 먼저다
        val query = mapper.page(page, size)
        val result = trades.list(principal.userId, V1Inputs.tradeFilter(ticker, from, to), query)
        return Page(result.items.map(mapper::trade), result.page, result.size, result.totalItems, result.totalPages)
    }

    @PostMapping("/proposals")
    fun submitProposals(
        @RequestBody(required = false) body: Any?,
        @AuthenticationPrincipal principal: AgentPrincipal,
    ): V1Results<V1ProposalResult> {
        V1Inputs.requireWrite(principal)
        val items = V1Inputs.items(body, "proposals")
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
}
