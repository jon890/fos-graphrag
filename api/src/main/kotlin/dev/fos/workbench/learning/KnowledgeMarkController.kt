package dev.fos.workbench.learning

import dev.fos.workbench.auth.WorkbenchPrincipal
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/** 로그인한 사람 본인의 이해 표시. 사용자 id 는 세션에서만 받는다 */
@RestController
@RequestMapping("/api/me/knowledge")
class KnowledgeMarkController(private val marks: KnowledgeMarkService) {

    @GetMapping
    fun list(
        @RequestParam(required = false) level: List<String>?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
        @AuthenticationPrincipal user: WorkbenchPrincipal,
    ): Page<StudyItem> = marks.list(user.id, level, PageQuery.of(page, size))

    @GetMapping("/summary")
    fun summary(@AuthenticationPrincipal user: WorkbenchPrincipal): KnowledgeSummary = marks.summary(user.id)

    @GetMapping("/{nodeId}")
    fun get(@PathVariable nodeId: String, @AuthenticationPrincipal user: WorkbenchPrincipal): KnowledgeMark =
        marks.get(user.id, nodeId)

    @PutMapping("/{nodeId}")
    fun put(@PathVariable nodeId: String, @RequestBody body: PutKnowledgeRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): KnowledgeMark =
        marks.put(user.id, nodeId, body)

    @DeleteMapping("/{nodeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable nodeId: String, @AuthenticationPrincipal user: WorkbenchPrincipal) =
        marks.delete(user.id, nodeId)
}
