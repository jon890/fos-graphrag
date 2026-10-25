package dev.fos.workbench.agent

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonUnwrapped
import dev.fos.workbench.auth.Role
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.params
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Repository
import java.util.UUID

@JsonInclude(JsonInclude.Include.ALWAYS)
data class IntegrationTokenView(val id: String, val name: String, val last4: String, val createdAt: String, val lastUsedAt: String?) {
    companion object {
        fun from(t: Map<String, Any?>) = IntegrationTokenView(
            id = t["id"] as String,
            name = t["name"] as String,
            last4 = t["last4"] as String,
            createdAt = t["createdAt"] as String,
            lastUsedAt = t["lastUsedAt"] as String?,
        )
    }
}

/** 발급 응답. 원문(`token`)은 이 응답에만 싣는다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class IssuedIntegrationToken(@get:JsonUnwrapped val view: IntegrationTokenView, val token: String)

data class IssueTokenRequest(val name: String? = null)

/** 인증에 쓰는 토큰과 주인. 폐기했거나 주인이 비활성이면 찾지 않는다 */
data class ActiveToken(
    val tokenId: String,
    val tokenName: String,
    val last4: String,
    val lastUsedAt: String?,
    val userId: String,
    val displayName: String,
    val role: Role,
)

/** `(:User)-[:OWNS]->(:IntegrationToken)`. 원문은 저장하지 않고 해시와 끝 네 글자만 둔다 */
@Repository
class IntegrationTokenRepository(private val client: Neo4jClient) {

    @Suppress("UNCHECKED_CAST")
    fun list(userId: String): List<IntegrationTokenView> =
        client.query(
            """
            MATCH (:User {id: ${'$'}userId})-[:OWNS]->(t:IntegrationToken) WHERE t.revokedAt IS NULL
            RETURN properties(t) AS t ORDER BY t.createdAt, t.id
            """,
        ).bind(userId).to("userId").fetch().all().map { IntegrationTokenView.from(it["t"] as Map<String, Any?>) }

    /**
     * 사용자 노드에 쓰기 잠금(`_lock`)을 건 뒤 폐기하지 않은 토큰 수를 센다. 잠금은 [create] 가 풀거나 트랜잭션이 끝나며 사라진다.
     * 같은 사람의 동시 발급은 여기서 줄을 선다. 사용자가 없으면 null 이다.
     */
    fun countActiveLocked(userId: String): Long? =
        client.query(
            """
            MATCH (u:User {id: ${'$'}userId})
            SET u._lock = true
            WITH u
            OPTIONAL MATCH (u)-[:OWNS]->(t:IntegrationToken) WHERE t.revokedAt IS NULL
            RETURN count(t) AS n
            """,
        ).bind(userId).to("userId").fetch().one().map { (it["n"] as Number).toLong() }.orElse(null)

    @Suppress("UNCHECKED_CAST")
    fun create(userId: String, name: String, hash: String, last4: String): IntegrationTokenView {
        val props = mapOf(
            "id" to UUID.randomUUID().toString(), "name" to name, "hash" to hash, "last4" to last4, "createdAt" to Timestamps.now(),
        )
        return client.query(
            """
            MATCH (u:User {id: ${'$'}userId})
            CREATE (u)-[:OWNS]->(t:IntegrationToken)
            SET t = ${'$'}props
            REMOVE u._lock
            RETURN properties(t) AS t
            """,
        ).bindAll(params("userId" to userId, "props" to props)).fetch().one()
            .map { IntegrationTokenView.from(it["t"] as Map<String, Any?>) }
            .orElseThrow { IllegalStateException("연동 토큰을 만들지 못했습니다: 사용자 $userId") }
    }

    /** 폐기하지 않은 내 토큰에만 `revokedAt` 을 쓴다. 바뀐 것이 없으면 false 다 */
    fun revoke(userId: String, tokenId: String): Boolean =
        client.query(
            """
            MATCH (:User {id: ${'$'}userId})-[:OWNS]->(t:IntegrationToken {id: ${'$'}tokenId}) WHERE t.revokedAt IS NULL
            SET t.revokedAt = ${'$'}now
            RETURN t.id AS id
            """,
        ).bindAll(params("userId" to userId, "tokenId" to tokenId, "now" to Timestamps.now())).fetch().one().isPresent

    fun findActiveByHash(hash: String): ActiveToken? =
        client.query(
            """
            MATCH (u:User)-[:OWNS]->(t:IntegrationToken {hash: ${'$'}hash})
            WHERE t.revokedAt IS NULL AND u.enabled = true AND u.email IS NOT NULL
            RETURN t.id AS tokenId, t.name AS tokenName, t.last4 AS last4, t.lastUsedAt AS lastUsedAt,
                   u.id AS userId, u.displayName AS displayName, u.role AS role
            LIMIT 1
            """,
        ).bind(hash).to("hash").fetch().one().map {
            ActiveToken(
                tokenId = it["tokenId"] as String,
                tokenName = it["tokenName"] as String,
                last4 = it["last4"] as String,
                lastUsedAt = it["lastUsedAt"] as String?,
                userId = it["userId"] as String,
                displayName = it["displayName"] as String,
                role = Role.parse(it["role"] as String?) ?: Role.VIEWER,
            )
        }.orElse(null)

    fun touchLastUsed(tokenId: String, now: String) {
        client.query("MATCH (t:IntegrationToken {id: ${'$'}tokenId}) SET t.lastUsedAt = ${'$'}now")
            .bindAll(params("tokenId" to tokenId, "now" to now)).run()
    }
}
