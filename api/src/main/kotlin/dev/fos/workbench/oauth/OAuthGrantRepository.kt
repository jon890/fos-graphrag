package dev.fos.workbench.oauth

import com.fasterxml.jackson.annotation.JsonInclude
import dev.fos.workbench.config.params
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Repository

/** 「연결된 앱」 목록의 한 줄(docs/api-contract.md 「연결된 앱」) */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class ConnectionView(
    val id: String,
    val clientName: String,
    val scope: String,
    val createdAt: String,
    val lastUsedAt: String?,
) {
    companion object {
        fun from(g: Map<String, Any?>) = ConnectionView(
            id = g["id"] as String,
            clientName = g["clientName"] as String,
            scope = g["scope"] as String,
            createdAt = g["createdAt"] as String,
            lastUsedAt = g["lastUsedAt"] as String?,
        )
    }
}

/** 갱신에 쓰는 연결 하나와 그 주인. `ownerActive` 는 주인이 활성이고 허용 목록에 있는지다 */
data class OAuthGrantRecord(
    val id: String,
    val clientId: String,
    val scope: String,
    val resource: String,
    val refreshHash: String,
    val refreshExpiresAt: String,
    val userId: String,
    val ownerActive: Boolean,
)

/** `(:User)-[:OWNS]->(:OAuthGrant)`. 토큰 원문은 저장하지 않고 해시로 찾는다(docs/data-schema.md 「OAuth 연결」) */
@Repository
class OAuthGrantRepository(private val client: Neo4jClient) {

    /**
     * 주인 사용자 노드에 쓰기 잠금을 건 뒤 같은 `clientId` 의 연결을 지우고 새로 만든다.
     * 남은 연결이 [maxPerUser] 를 넘으면 `coalesce(lastUsedAt, createdAt)` 가 오래된 것부터 지운다. 같은 사람의 동시 연결은 잠금에서 줄을 선다.
     */
    @Suppress("UNCHECKED_CAST")
    fun createReplacing(userId: String, props: Map<String, Any>, maxPerUser: Int): ConnectionView {
        val locked = client.query("MATCH (u:User {id: ${'$'}userId}) SET u._lock = true REMOVE u._lock RETURN u.id AS id")
            .bind(userId).to("userId").fetch().one()
        check(locked.isPresent) { "사용자를 찾을 수 없다: $userId" }
        client.query("MATCH (:User {id: ${'$'}userId})-[:OWNS]->(g:OAuthGrant {clientId: ${'$'}clientId}) DETACH DELETE g")
            .bindAll(params("userId" to userId, "clientId" to props["clientId"])).run()
        val created = client.query(
            """
            MATCH (u:User {id: ${'$'}userId})
            CREATE (u)-[:OWNS]->(g:OAuthGrant)
            SET g = ${'$'}props
            RETURN properties(g) AS g
            """,
        ).bindAll(params("userId" to userId, "props" to props)).fetch().one()
            .map { ConnectionView.from(it["g"] as Map<String, Any?>) }
            .orElseThrow { IllegalStateException("앱 연결을 만들지 못했습니다: 사용자 $userId") }
        client.query(
            """
            MATCH (:User {id: ${'$'}userId})-[:OWNS]->(g:OAuthGrant)
            WITH g ORDER BY coalesce(g.lastUsedAt, g.createdAt) DESC, g.id DESC
            SKIP ${'$'}max
            DETACH DELETE g
            """,
        ).bindAll(params("userId" to userId, "max" to maxPerUser.toLong())).run()
        return created
    }

    /** 연결 노드에 쓰기 잠금을 건 뒤 읽는다. 같은 갱신 토큰이 동시에 오면 여기서 줄을 선다 */
    fun findByRefreshLocked(hash: String): OAuthGrantRecord? =
        client.query(
            """
            MATCH (u:User)-[:OWNS]->(g:OAuthGrant {refreshHash: ${'$'}hash})
            SET g._lock = true
            REMOVE g._lock
            RETURN properties(g) AS g, u.id AS userId, (u.enabled = true AND u.email IS NOT NULL) AS active
            """,
        ).bind(hash).to("hash").fetch().one().map { record(it) }.orElse(null)

    /** 바로 앞의 갱신 토큰으로 연결을 찾아 id 를 돌려준다. 다시 쓰였으면 도난으로 보고 연결을 끊는다 */
    fun findByPreviousRefresh(hash: String): String? =
        client.query("MATCH (g:OAuthGrant {previousRefreshHash: ${'$'}hash}) RETURN g.id AS id LIMIT 1")
            .bind(hash).to("hash").fetch().one().map { it["id"] as String }.orElse(null)

    /** 접근 토큰과 갱신 토큰을 새로 쓰고 이전 갱신 해시를 `previousRefreshHash` 로 옮긴다. 갱신도 쓴 것이라 `lastUsedAt` 을 고친다 */
    fun rotate(grantId: String, access: IssuedSecret, refresh: IssuedSecret, previousRefreshHash: String, now: String) {
        client.query(
            """
            MATCH (g:OAuthGrant {id: ${'$'}id})
            SET g.accessHash = ${'$'}accessHash, g.accessExpiresAt = ${'$'}accessExpiresAt,
                g.refreshHash = ${'$'}refreshHash, g.refreshExpiresAt = ${'$'}refreshExpiresAt,
                g.previousRefreshHash = ${'$'}previous, g.lastUsedAt = ${'$'}now
            """,
        ).bindAll(
            params(
                "id" to grantId, "accessHash" to access.hash, "accessExpiresAt" to access.expiresAt,
                "refreshHash" to refresh.hash, "refreshExpiresAt" to refresh.expiresAt, "previous" to previousRefreshHash, "now" to now,
            ),
        ).run()
    }

    fun delete(grantId: String) {
        client.query("MATCH (g:OAuthGrant {id: ${'$'}id}) DETACH DELETE g").bind(grantId).to("id").run()
    }

    /** 내 연결만 지운다. 지운 것이 없으면 false 다 */
    fun deleteOwned(userId: String, grantId: String): Boolean =
        client.query(
            """
            MATCH (:User {id: ${'$'}userId})-[:OWNS]->(g:OAuthGrant {id: ${'$'}id})
            DETACH DELETE g
            RETURN count(g) AS n
            """,
        ).bindAll(params("userId" to userId, "id" to grantId)).fetch().one().map { (it["n"] as Number).toLong() > 0 }.orElse(false)

    /** 연결한 순서(오래된 것부터)다 */
    @Suppress("UNCHECKED_CAST")
    fun list(userId: String): List<ConnectionView> =
        client.query(
            """
            MATCH (:User {id: ${'$'}userId})-[:OWNS]->(g:OAuthGrant)
            RETURN properties(g) AS g ORDER BY g.createdAt, g.id
            """,
        ).bind(userId).to("userId").fetch().all().map { ConnectionView.from(it["g"] as Map<String, Any?>) }

    /** 폐기(RFC 7009)가 받은 토큰이 접근 토큰이든 갱신 토큰이든 그 연결의 id 를 찾는다 */
    fun findByAccessOrRefresh(hash: String): String? =
        client.query(
            """
            OPTIONAL MATCH (a:OAuthGrant {accessHash: ${'$'}hash})
            OPTIONAL MATCH (r:OAuthGrant {refreshHash: ${'$'}hash})
            RETURN coalesce(a.id, r.id) AS id
            """,
        ).bind(hash).to("hash").fetch().one().map { it["id"] as String? }.orElse(null)

    @Suppress("UNCHECKED_CAST")
    private fun record(row: Map<String, Any?>): OAuthGrantRecord {
        val g = row["g"] as Map<String, Any?>
        return OAuthGrantRecord(
            id = g["id"] as String,
            clientId = g["clientId"] as String,
            scope = g["scope"] as String,
            resource = g["resource"] as String,
            refreshHash = g["refreshHash"] as String,
            refreshExpiresAt = g["refreshExpiresAt"] as String,
            userId = row["userId"] as String,
            ownerActive = row["active"] == true,
        )
    }
}

/** 새로 발급한 토큰의 원문, 해시, 끝나는 시각. 원문은 응답에만 싣고 로그에 남지 않게 문자열로 바꿀 때 뺀다 */
class IssuedSecret(val raw: String, val hash: String, val expiresAt: String) {
    override fun toString() = "IssuedSecret(expiresAt=$expiresAt)"
}
