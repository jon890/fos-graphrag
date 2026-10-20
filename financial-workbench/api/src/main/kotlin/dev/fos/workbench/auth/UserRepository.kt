package dev.fos.workbench.auth

import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Repository
import java.time.Instant
import java.util.UUID

data class UserRef(val id: String, val username: String, val displayName: String)

data class UserRecord(
    val id: String,
    val username: String,
    val displayName: String,
    val passwordHash: String,
    val enabled: Boolean,
)

@Repository
class UserRepository(private val client: Neo4jClient) {

    fun findByUsername(username: String): UserRecord? =
        client.query(
            """
            MATCH (u:User {username: ${'$'}username})
            RETURN u.id AS id, u.username AS username, u.displayName AS displayName,
                   u.passwordHash AS passwordHash, u.enabled AS enabled
            """,
        ).bind(username).to("username").fetch().one().map {
            UserRecord(
                id = it["id"] as String,
                username = it["username"] as String,
                displayName = it["displayName"] as String,
                passwordHash = it["passwordHash"] as String,
                enabled = it["enabled"] as Boolean,
            )
        }.orElse(null)

    /** 응답에 사용자 이름을 채울 때 쓴다. 없는 ID 는 결과에서 빠진다. */
    fun findRefs(ids: Collection<String>): Map<String, UserRef> {
        if (ids.isEmpty()) return emptyMap()
        return client.query("MATCH (u:User) WHERE u.id IN ${'$'}ids RETURN u.id AS id, u.username AS username, u.displayName AS displayName")
            .bind(ids.distinct()).to("ids").fetch().all()
            .associate { (it["id"] as String) to UserRef(it["id"] as String, it["username"] as String, it["displayName"] as String) }
    }

    fun create(username: String, displayName: String, passwordHash: String): UserRef {
        val id = UUID.randomUUID().toString()
        client.query(
            """
            CREATE (:User {id: ${'$'}id, username: ${'$'}username, displayName: ${'$'}displayName,
                           passwordHash: ${'$'}passwordHash, enabled: true, createdAt: ${'$'}createdAt})
            """,
        ).bindAll(
            mapOf(
                "id" to id, "username" to username, "displayName" to displayName,
                "passwordHash" to passwordHash, "createdAt" to Instant.now().toString(),
            ),
        ).run()
        return UserRef(id, username, displayName)
    }
}
