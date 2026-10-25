package dev.fos.workbench.agent

import dev.fos.workbench.auth.WorkbenchPrincipal
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/** 로그인한 사람 본인의 연동 토큰. 사용자 id 는 세션에서만 받는다 */
@RestController
@RequestMapping("/api/me/tokens")
class IntegrationTokenController(private val tokens: IntegrationTokenService) {

    @GetMapping
    fun list(@AuthenticationPrincipal user: WorkbenchPrincipal): List<IntegrationTokenView> = tokens.list(user.id)

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun issue(@RequestBody body: IssueTokenRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): IssuedIntegrationToken =
        tokens.issue(user.id, body)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun revoke(@PathVariable id: String, @AuthenticationPrincipal user: WorkbenchPrincipal) = tokens.revoke(user.id, id)
}
