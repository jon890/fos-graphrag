package dev.fos.workbench.proposal

import com.fasterxml.jackson.annotation.JsonInclude
import dev.fos.workbench.auth.Role
import dev.fos.workbench.auth.WorkbenchPrincipal
import dev.fos.workbench.knowledge.NodeRef
import dev.fos.workbench.knowledge.RelationshipView
import dev.fos.workbench.ontology.OntologyVersionHeaderFilter
import dev.fos.workbench.trade.TradeView
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/** 화면의 제안 표현. 모양은 docs/api-contract.md 「제안」 의 `ProposalView` 다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class ProposalView(
    val id: String,
    val kind: String,
    val status: String,
    val payload: Map<String, Any?>,
    val rationale: String,
    val evidence: Map<String, Any?>,
    val createdAt: String,
    val createdVia: String,
    val token: ProposalToken?,
    val decidedAt: String?,
    val decisionNote: String?,
    val result: Map<String, Any?>?,
    val lastError: ProposalError?,
    val requiresEditor: Boolean,
    val requiredRole: String,
    val refs: ProposalRefs,
)

/** 올린 연동 토큰과 그때의 이름. 토큰을 폐기해도 남는다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class ProposalToken(val id: String?, val name: String?)

/** payload, evidence, result 가 가리키는 노드, 관계, 내 체결의 지금 값. 찾지 못한 id 는 빠진다 */
data class ProposalRefs(val nodes: Map<String, NodeRef>, val relationships: Map<String, RelationshipView>, val trades: Map<String, TradeView>)

/** `confirm` 은 온톨로지 변경의 영향 확인이다 */
data class AcceptProposalRequest(val payload: Any? = null, val confirm: Boolean = false)

data class RejectProposalRequest(val reason: String? = null)

/** 로그인한 사람 본인의 제안. 주인은 세션의 사용자 id 다 */
@RestController
@RequestMapping("/api/me/proposals")
class ProposalController(private val proposals: ProposalService) {

    @GetMapping
    fun list(
        @RequestParam(required = false) status: String?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
        @AuthenticationPrincipal user: WorkbenchPrincipal,
    ): Page<ProposalView> {
        val result = proposals.list(user.id, status, PageQuery.of(page, size))
        return Page(proposals.views(user.id, result.items), result.page, result.size, result.totalItems, result.totalPages)
    }

    @GetMapping("/summary")
    fun summary(@AuthenticationPrincipal user: WorkbenchPrincipal): Map<String, Long> = mapOf("pending" to proposals.pendingCount(user.id))

    /** 온톨로지 변경을 승인하면 필터가 요청 처음에 넣은 버전 헤더를 새 번호로 바꾼다. 헤더를 더하면 값이 두 개가 된다 */
    @PostMapping("/{id}/accept")
    fun accept(
        @PathVariable id: String,
        @RequestBody(required = false) body: AcceptProposalRequest?,
        @AuthenticationPrincipal user: WorkbenchPrincipal,
        response: HttpServletResponse,
    ): ProposalView {
        val accepted = proposals.accept(user.id, roleOf(user), id, body?.payload, body?.confirm ?: false)
        (accepted.result?.get("ontologyVersion") as? Number)?.let { response.setHeader(OntologyVersionHeaderFilter.HEADER, it.toString()) }
        return proposals.views(user.id, listOf(accepted)).single()
    }

    @PostMapping("/{id}/reject")
    fun reject(
        @PathVariable id: String,
        @RequestBody(required = false) body: RejectProposalRequest?,
        @AuthenticationPrincipal user: WorkbenchPrincipal,
    ): ProposalView = proposals.views(user.id, listOf(proposals.reject(user.id, id, body?.reason))).single()

    /** CurrentUserFilter 가 요청마다 `ROLE_<역할>` 하나를 넣는다 */
    private fun roleOf(user: WorkbenchPrincipal): Role =
        user.authorities.firstNotNullOfOrNull { a -> a.authority?.takeIf { it.startsWith(ROLE_PREFIX) }?.let { Role.parse(it.removePrefix(ROLE_PREFIX)) } }
            ?: throw IllegalStateException("세션에 역할이 없다: ${user.id}")

    companion object {
        private const val ROLE_PREFIX = "ROLE_"
    }
}
