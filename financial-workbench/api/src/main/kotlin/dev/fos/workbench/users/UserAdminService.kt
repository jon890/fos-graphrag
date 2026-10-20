package dev.fos.workbench.users

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.auth.Role
import dev.fos.workbench.auth.UserRecord
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.history.ChangeAction
import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.FieldChange
import dev.fos.workbench.history.TargetKind
import dev.fos.workbench.history.diff
import dev.fos.workbench.web.ApiException
import dev.fos.workbench.web.DuplicateException
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.RevisionConflictException
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class UserView(
    val id: String,
    val email: String,
    val displayName: String,
    val role: Role,
    val enabled: Boolean,
    val linked: Boolean,
    val revision: Long,
    val createdAt: String,
    val updatedAt: String,
    val lastLoginAt: String?,
) {
    companion object {
        fun of(u: UserRecord) = UserView(
            u.id, u.email, u.displayName, u.role, u.enabled, u.googleSub != null, u.revision, u.createdAt, u.updatedAt, u.lastLoginAt,
        )
    }
}

data class CreateUserRequest(val email: String, val displayName: String, val role: String)

class LastAdminException :
    ApiException(HttpStatus.CONFLICT, "LAST_ADMIN", "마지막 활성 관리자는 강등하거나 비활성화할 수 없습니다. 다른 관리자를 먼저 지정하세요.")

/** 허용 사용자 관리. 모든 변경은 같은 트랜잭션의 ChangeEvent 로 남고 revision 으로 동시 수정을 막는다. */
@Service
class UserAdminService(
    private val client: Neo4jClient,
    private val users: UserRepository,
    private val recorder: ChangeEventRecorder,
) {

    @Transactional(readOnly = true)
    fun list(): List<UserView> = users.findAll().map(UserView::of)

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun create(request: CreateUserRequest, actorId: String): UserView {
        val email = request.email.trim().lowercase()
        val role = Role.parse(request.role)
        val errors = buildMap {
            if (!EMAIL.matches(email)) put("email", "이메일 형식이 아닙니다.")
            if (request.displayName.isBlank() || request.displayName.length > 64) put("displayName", "1~64자여야 합니다.")
            if (role == null) put("role", "VIEWER, EDITOR, ADMIN 가운데 하나여야 합니다.")
        }
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        if (users.findByEmail(email) != null) throw DuplicateException("이미 허용 목록에 있는 이메일입니다.")
        val user = users.create(email, request.displayName, role!!, actorId)
        recorder.record(
            ChangeEventDraft(
                actorId, ChangeAction.CREATE, user.id, TargetKind.USER, USER, user.email, 1L,
                mapOf("email" to FieldChange(null, user.email), "displayName" to FieldChange(null, user.displayName), "role" to FieldChange(null, user.role.name)),
            ),
        )
        return UserView.of(user)
    }

    /** 본문은 expectedRevision 과 바꿀 필드(role, displayName, enabled)만 담는다. */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    @Suppress("UNCHECKED_CAST")
    fun patch(id: String, body: Map<String, Any?>, actorId: String): UserView {
        val expected = (body["expectedRevision"] as? Number)?.toLong()
            ?: throw ValidationFailedException(mapOf("expectedRevision" to "필수 값입니다."))
        val unknown = body.keys - setOf("expectedRevision", "role", "displayName", "enabled")
        if (unknown.isNotEmpty()) throw ValidationFailedException(unknown.associateWith { "바꿀 수 없는 필드입니다." })

        // 대상과 활성 관리자를 ID 순서로 한 번에 잠근다. 두 관리자가 서로를 동시에 강등해도 잠금 순서가 같아 교착이 줄고,
        // 마지막 관리자 판정이 잠금 뒤의 값으로 이루어진다
        val locked = client.query(
            """
            MATCH (u:User) WHERE u.email IS NOT NULL AND (u.id = ${'$'}id OR (u.role = 'ADMIN' AND u.enabled = true))
            WITH u ORDER BY u.id
            SET u._lock = true
            RETURN properties(u) AS u
            """,
        ).bind(id).to("id").fetch().all().map { (it["u"] as Map<String, Any?>) - "_lock" }
        val before = locked.firstOrNull { it["id"] == id } ?: throw NotFoundException(id)
        val current = (before["revision"] as Number).toLong()
        if (current != expected) throw RevisionConflictException(expected, current)

        val changes = linkedMapOf<String, Any?>()
        val errors = linkedMapOf<String, String>()
        if ("role" in body) Role.parse(body["role"] as? String)?.let { changes["role"] = it.name } ?: errors.put("role", "VIEWER, EDITOR, ADMIN 가운데 하나여야 합니다.")
        if ("enabled" in body) (body["enabled"] as? Boolean)?.let { changes["enabled"] = it } ?: errors.put("enabled", "true 나 false 여야 합니다.")
        if ("displayName" in body) {
            val name = (body["displayName"] as? String)?.trim()
            if (name.isNullOrEmpty() || name.length > 64) errors["displayName"] = "1~64자여야 합니다." else changes["displayName"] = name
        }
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)

        val wasActiveAdmin = before["role"] == Role.ADMIN.name && before["enabled"] == true
        val staysActiveAdmin = (changes["role"] ?: before["role"]) == Role.ADMIN.name && (changes["enabled"] ?: before["enabled"]) == true
        if (wasActiveAdmin && !staysActiveAdmin) {
            val others = locked.count { it["id"] != id && it["role"] == Role.ADMIN.name && it["enabled"] == true }
            if (others == 0) throw LastAdminException()
        }

        if (diff(before, changes).isEmpty()) {
            // 바뀐 값이 없으면 revision 을 올리지 않고 이력도 남기지 않는다
            client.query("MATCH (u:User) WHERE u._lock IS NOT NULL REMOVE u._lock").run()
            return UserView.of(UserRecord.from(before))
        }
        val after = client.query(
            """
            MATCH (u:User {id: ${'$'}id})
            SET u += ${'$'}set, u.revision = u.revision + 1, u.updatedAt = ${'$'}now, u.updatedBy = ${'$'}actor
            REMOVE u._lock
            WITH u
            OPTIONAL MATCH (other:User) WHERE other._lock IS NOT NULL
            REMOVE other._lock
            RETURN DISTINCT properties(u) AS u
            """,
        ).bindAll(mapOf("id" to id, "set" to changes, "now" to Timestamps.now(), "actor" to actorId))
            .fetch().one().map { it["u"] as Map<String, Any?> }.get()
        val recorded = diff(before, changes)
        if (recorded.isNotEmpty()) {
            recorder.record(
                ChangeEventDraft(
                    actorId, ChangeAction.UPDATE, id, TargetKind.USER, USER, before["email"] as String,
                    (after["revision"] as Number).toLong(), recorded,
                ),
            )
        }
        return UserView.of(UserRecord.from(after))
    }

    companion object {
        const val USER = "User"
        private val EMAIL = Regex("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")
    }
}
