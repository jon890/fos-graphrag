package dev.fos.workbench.agent.v1

import dev.fos.workbench.agent.AgentPrincipal
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.web.Page
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/** 에이전트 API. 조회만 있고 연동 토큰으로만 부른다(docs/api-contract.md 「에이전트 API(`/api/v1`)」) */
@RestController
@RequestMapping("/api/v1")
class AgentV1Controller(
    private val mapper: V1Mapper,
    private val queries: AgentQueryService,
    private val lookups: SecurityLookupService,
    private val properties: WorkbenchProperties,
) {

    /** 토큰을 넣은 뒤 연결이 되는지 확인할 때 부른다 */
    @GetMapping("/me")
    fun me(@AuthenticationPrincipal principal: AgentPrincipal): V1Me = V1Me(
        user = V1MeUser(principal.userId, principal.displayName, principal.role.name),
        token = V1MeToken(principal.tokenId, principal.tokenName, principal.last4),
        rateLimitPerMinute = properties.agent.rateLimitPerMinute,
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
}
