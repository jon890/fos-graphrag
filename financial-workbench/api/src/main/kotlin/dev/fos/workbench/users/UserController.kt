package dev.fos.workbench.users

import dev.fos.workbench.auth.WorkbenchPrincipal
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

/** ADMIN 만 부른다. 경로 권한은 SecurityConfig 가 집행한다. */
@RestController
@RequestMapping("/api/users")
class UserController(private val admin: UserAdminService) {

    @GetMapping
    fun list(): List<UserView> = admin.list()

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody body: CreateUserRequest, @AuthenticationPrincipal user: WorkbenchPrincipal): UserView =
        admin.create(body, user.id)

    @PatchMapping("/{id}")
    fun patch(@PathVariable id: String, @RequestBody body: Map<String, Any?>, @AuthenticationPrincipal user: WorkbenchPrincipal): UserView =
        admin.patch(id, body, user.id)
}
