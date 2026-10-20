package dev.fos.workbench.knowledge

import dev.fos.workbench.auth.WorkbenchUser
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/relationships")
class RelationshipController(private val relationships: RelationshipService) {

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody body: CreateRelationshipRequest, @AuthenticationPrincipal user: WorkbenchUser): RelationshipView =
        relationships.create(body, user.id)

    @PostMapping("/{id}/archive")
    fun archive(@PathVariable id: String, @RequestBody body: RevisionRequest, @AuthenticationPrincipal user: WorkbenchUser): RelationshipView =
        relationships.archive(id, body, user.id)

    @PostMapping("/{id}/restore")
    fun restore(@PathVariable id: String, @RequestBody body: RevisionRequest, @AuthenticationPrincipal user: WorkbenchUser): RelationshipView =
        relationships.restore(id, body, user.id)
}
