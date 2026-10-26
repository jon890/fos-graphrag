package dev.fos.workbench.oauth

import dev.fos.workbench.config.params
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Repository

/** 인가 코드 하나와 그 주인. `ownerActive` 는 주인이 활성이고 허용 목록에 있는지다 */
data class OAuthCodeRecord(
    val hash: String,
    val clientId: String,
    val redirectUri: String,
    val scope: String,
    val codeChallenge: String,
    val resource: String,
    val createdAt: String,
    val expiresAt: String,
    val usedAt: String?,
    val grantId: String?,
    val userId: String,
    val ownerActive: Boolean,
)

/** `(:User)-[:OWNS]->(:OAuthCode)`. 원문은 저장하지 않고 해시로 찾는다(docs/data-schema.md 「OAuth 연결」) */
@Repository
class OAuthCodeRepository(private val client: Neo4jClient) {

    /** 같은 트랜잭션에서 그 사용자의 끝난 코드를 먼저 지운다. 시각은 고정 자릿수 문자열이라 문자열로 비교한다 */
    fun create(userId: String, props: Map<String, Any>, now: String) {
        client.query("MATCH (:User {id: ${'$'}userId})-[:OWNS]->(c:OAuthCode) WHERE c.expiresAt < ${'$'}now DETACH DELETE c")
            .bindAll(params("userId" to userId, "now" to now)).run()
        val created = client.query(
            """
            MATCH (u:User {id: ${'$'}userId})
            CREATE (u)-[:OWNS]->(c:OAuthCode)
            SET c = ${'$'}props
            RETURN c.hash AS hash
            """,
        ).bindAll(params("userId" to userId, "props" to props)).fetch().one()
        check(created.isPresent) { "인가 코드를 만들지 못했습니다: 사용자 $userId" }
    }

    /**
     * 코드 노드에 쓰기 잠금을 건 뒤 읽는다. 잠금은 트랜잭션이 끝날 때까지 남고 `_lock` 속성은 같은 문장에서 지운다.
     * 같은 코드가 동시에 와도 여기서 줄을 서므로 하나만 바뀐다.
     */
    @Suppress("UNCHECKED_CAST")
    fun findLocked(hash: String): OAuthCodeRecord? =
        client.query(
            """
            MATCH (u:User)-[:OWNS]->(c:OAuthCode {hash: ${'$'}hash})
            SET c._lock = true
            REMOVE c._lock
            RETURN properties(c) AS c, u.id AS userId, (u.enabled = true AND u.email IS NOT NULL) AS active
            """,
        ).bind(hash).to("hash").fetch().one().map {
            val c = it["c"] as Map<String, Any?>
            OAuthCodeRecord(
                hash = c["hash"] as String,
                clientId = c["clientId"] as String,
                redirectUri = c["redirectUri"] as String,
                scope = c["scope"] as String,
                codeChallenge = c["codeChallenge"] as String,
                resource = c["resource"] as String,
                createdAt = c["createdAt"] as String,
                expiresAt = c["expiresAt"] as String,
                usedAt = c["usedAt"] as String?,
                grantId = c["grantId"] as String?,
                userId = it["userId"] as String,
                ownerActive = it["active"] == true,
            )
        }.orElse(null)

    fun markUsed(hash: String, now: String, grantId: String) {
        client.query("MATCH (c:OAuthCode {hash: ${'$'}hash}) SET c.usedAt = ${'$'}now, c.grantId = ${'$'}grantId")
            .bindAll(params("hash" to hash, "now" to now, "grantId" to grantId)).run()
    }
}
