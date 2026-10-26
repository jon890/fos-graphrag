package dev.fos.workbench.learning

import dev.fos.workbench.auth.WorkbenchPrincipal
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** 근거 따라가기. 단계의 이해 표시는 세션의 사용자 것만 담는다 */
@RestController
@RequestMapping("/api/nodes")
class TraceController(private val traces: TraceService) {

    @GetMapping("/{id}/trace")
    fun trace(@PathVariable id: String, @AuthenticationPrincipal user: WorkbenchPrincipal): TraceView = traces.trace(id, user.id)
}
