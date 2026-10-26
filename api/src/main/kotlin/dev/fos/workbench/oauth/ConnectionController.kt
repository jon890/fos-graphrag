package dev.fos.workbench.oauth

import dev.fos.workbench.auth.WorkbenchPrincipal
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/** 로그인한 사람 본인의 연결된 앱(docs/api-contract.md 「연결된 앱」). 사용자 id 는 세션에서만 받는다 */
@RestController
@RequestMapping("/api/me/connections")
class ConnectionController(private val connections: ConnectionService) {

    @GetMapping
    fun list(@AuthenticationPrincipal user: WorkbenchPrincipal): List<ConnectionView> = connections.list(user.id)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun disconnect(@PathVariable id: String, @AuthenticationPrincipal user: WorkbenchPrincipal) = connections.disconnect(user.id, id)
}
