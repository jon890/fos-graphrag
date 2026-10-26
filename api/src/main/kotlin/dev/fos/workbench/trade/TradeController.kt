package dev.fos.workbench.trade

import dev.fos.workbench.auth.WorkbenchPrincipal
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/** 로그인한 사람 본인의 체결 기록. 주인은 세션의 사용자 id 다 */
@RestController
@RequestMapping("/api/me/trades")
class TradeController(private val trades: TradeService) {

    @GetMapping
    fun list(
        @RequestParam(required = false) securityId: String?,
        @RequestParam(required = false) decisionId: String?,
        @RequestParam(required = false) ticker: String?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
        @AuthenticationPrincipal user: WorkbenchPrincipal,
    ): Page<TradeView> {
        val filter = TradeFilter(
            securityId = securityId?.trim()?.takeIf { it.isNotEmpty() },
            decisionId = decisionId?.trim()?.takeIf { it.isNotEmpty() },
            ticker = ticker?.trim()?.takeIf { it.isNotEmpty() },
        )
        return trades.list(user.id, filter, PageQuery.of(page, size))
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: String, @AuthenticationPrincipal user: WorkbenchPrincipal) = trades.delete(user.id, id)
}
