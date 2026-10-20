package dev.fos.workbench.knowledge

import dev.fos.workbench.auth.WorkbenchUser
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/nodes")
class NodeController(private val nodes: NodeService, private val queries: NodeQueryService) {

    @GetMapping("/{id}")
    fun detail(@PathVariable id: String): NodeDetail = queries.detail(id)

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody body: CreateNodeRequest, @AuthenticationPrincipal user: WorkbenchUser): NodeView =
        nodes.create(body, user.id)

    @PatchMapping("/{id}")
    fun patch(@PathVariable id: String, @RequestBody body: PatchNodeRequest, @AuthenticationPrincipal user: WorkbenchUser): NodeView =
        nodes.patch(id, body, user.id)

    @PostMapping("/{id}/archive")
    fun archive(@PathVariable id: String, @RequestBody body: RevisionRequest, @AuthenticationPrincipal user: WorkbenchUser): NodeView =
        nodes.archive(id, body, user.id)

    @PostMapping("/{id}/restore")
    fun restore(@PathVariable id: String, @RequestBody body: RevisionRequest, @AuthenticationPrincipal user: WorkbenchUser): NodeView =
        nodes.restore(id, body, user.id)
}
