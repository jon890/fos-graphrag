package dev.fos.workbench.knowledge

import dev.fos.workbench.auth.WorkbenchPrincipal
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/nodes")
class NodeController(private val nodes: NodeService, private val queries: NodeQueryService) {

    @GetMapping
    fun search(
        @RequestParam(required = false) q: String?,
        @RequestParam(required = false) types: List<String>?,
        @RequestParam(required = false) reviewStatus: String?,
        @RequestParam(required = false, defaultValue = "false") includeArchived: Boolean,
        @RequestParam(required = false) sort: String?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
    ): Page<NodeView> = queries.search(q, types, reviewStatus, includeArchived, sort, PageQuery.of(page, size))

    @GetMapping("/counts")
    fun counts(): NodeCounts = queries.counts()

    @GetMapping("/{id}")
    fun detail(@PathVariable id: String): NodeDetail = queries.detail(id)

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody body: CreateNodeRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): NodeView =
        nodes.create(body, user.id)

    @PatchMapping("/{id}")
    fun patch(@PathVariable id: String, @RequestBody body: PatchNodeRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): NodeView =
        nodes.patch(id, body, user.id)

    @PostMapping("/{id}/archive")
    fun archive(@PathVariable id: String, @RequestBody body: RevisionRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): NodeView =
        nodes.archive(id, body, user.id)

    @PostMapping("/{id}/restore")
    fun restore(@PathVariable id: String, @RequestBody body: RevisionRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): NodeView =
        nodes.restore(id, body, user.id)
}
