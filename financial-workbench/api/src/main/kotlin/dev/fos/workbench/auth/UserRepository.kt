package dev.fos.workbench.auth

import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.params
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Repository
import java.util.UUID

data class UserRef(val id: String, val email: String, val displayName: String)

data class UserRecord(
    val id: String,
    val email: String,
    val displayName: String,
    val role: Role,
    val enabled: Boolean,
    val googleSub: String?,
    val revision: Long,
    val createdAt: String,
    val updatedAt: String,
    val lastLoginAt: String?,
) {
    fun toRef() = UserRef(id, email, displayName)

    companion object {
        fun from(u: Map<String, Any?>) = UserRecord(
            id = u["id"] as String,
            email = u["email"] as String,
            displayName = u["displayName"] as String,
            role = Role.parse(u["role"] as String?) ?: Role.VIEWER,
            enabled = u["enabled"] == true,
            googleSub = u["googleSub"] as String?,
            revision = (u["revision"] as Number?)?.toLong() ?: 1L,
            createdAt = u["createdAt"] as String,
            updatedAt = (u["updatedAt"] ?: u["createdAt"]) as String,
            lastLoginAt = u["lastLoginAt"] as String?,
        )
    }
}

/** 허용 사용자 목록. 이메일은 소문자로 저장하고 비교한다. 개인 계좌 정보는 이 모델에 넣지 않는다. */
@Repository
class UserRepository(private val client: Neo4jClient) {

    fun findById(id: String): UserRecord? = one("MATCH (u:User {id: \$v}) WHERE u.email IS NOT NULL RETURN properties(u) AS u", id)

    fun findByEmail(email: String): UserRecord? =
        one("MATCH (u:User {email: \$v}) RETURN properties(u) AS u", email.trim().lowercase())

    fun findByGoogleSub(sub: String): UserRecord? = one("MATCH (u:User {googleSub: \$v}) RETURN properties(u) AS u", sub)

    @Suppress("UNCHECKED_CAST")
    fun findAll(): List<UserRecord> =
        client.query("MATCH (u:User) WHERE u.email IS NOT NULL RETURN properties(u) AS u ORDER BY u.email").fetch().all()
            .map { UserRecord.from(it["u"] as Map<String, Any?>) }

    fun countWithEmail(): Long =
        client.query("MATCH (u:User) WHERE u.email IS NOT NULL RETURN count(u) AS n").fetch().one()
            .map { (it["n"] as Number).toLong() }.orElse(0L)

    /** 응답에 사용자 이름을 채울 때 쓴다. 없는 ID 는 결과에서 빠진다. */
    fun findRefs(ids: Collection<String>): Map<String, UserRef> {
        if (ids.isEmpty()) return emptyMap()
        return client.query(
            "MATCH (u:User) WHERE u.id IN \$ids AND u.email IS NOT NULL RETURN u.id AS id, u.email AS email, u.displayName AS displayName",
        ).bind(ids.distinct()).to("ids").fetch().all()
            .associate { (it["id"] as String) to UserRef(it["id"] as String, it["email"] as String, it["displayName"] as String) }
    }

    fun create(email: String, displayName: String, role: Role, actorId: String): UserRecord {
        val now = Timestamps.now()
        val props = mapOf(
            "id" to UUID.randomUUID().toString(), "email" to email.trim().lowercase(), "displayName" to displayName.trim(),
            "role" to role.name, "enabled" to true, "revision" to 1L,
            "createdAt" to now, "createdBy" to actorId, "updatedAt" to now, "updatedBy" to actorId,
        )
        client.query("CREATE (u:User) SET u = \$props").bind(props).to("props").run()
        return UserRecord.from(props)
    }

    /** 첫 로그인 때 Google sub 을 묶는다. 이미 다른 sub 이 묶였으면 아무것도 바꾸지 않고 null 이다. */
    fun bindGoogleSub(id: String, sub: String): UserRecord? =
        one(
            "MATCH (u:User {id: \$v}) WHERE u.googleSub IS NULL SET u.googleSub = \$sub RETURN properties(u) AS u",
            id, "sub" to sub,
        )

    fun touchLogin(id: String) {
        client.query("MATCH (u:User {id: \$id}) SET u.lastLoginAt = \$now").bindAll(mapOf("id" to id, "now" to Timestamps.now())).run()
    }

    @Suppress("UNCHECKED_CAST")
    private fun one(cypher: String, value: String, vararg extra: Pair<String, Any?>): UserRecord? =
        client.query(cypher).bindAll(params("v" to value, *extra)).fetch().one()
            .map { UserRecord.from(it["u"] as Map<String, Any?>) }.orElse(null)
}
