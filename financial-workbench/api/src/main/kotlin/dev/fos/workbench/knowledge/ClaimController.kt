package dev.fos.workbench.knowledge

import dev.fos.workbench.auth.WorkbenchUser
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/claims")
class ClaimController(private val claims: ClaimService, private val reader: KnowledgeReader) {

    @GetMapping("/{id}")
    @Transactional(readOnly = true)
    fun get(@PathVariable id: String): ClaimView = reader.claim(id)

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody body: CreateClaimRequest, @AuthenticationPrincipal user: WorkbenchUser): ClaimView =
        claims.create(body, user.id)

    @PatchMapping("/{id}")
    fun patch(@PathVariable id: String, @RequestBody body: Map<String, Any?>, @AuthenticationPrincipal user: WorkbenchUser): ClaimView =
        claims.patch(id, body, user.id)

    @PostMapping("/{id}/review")
    fun review(@PathVariable id: String, @RequestBody body: ReviewRequest, @AuthenticationPrincipal user: WorkbenchUser): ClaimView =
        claims.review(id, body, user.id)
}
