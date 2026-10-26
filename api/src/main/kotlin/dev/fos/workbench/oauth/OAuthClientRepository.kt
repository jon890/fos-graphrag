package dev.fos.workbench.oauth

import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.params
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Repository
import java.util.UUID

/** 동적 등록한 클라이언트 하나. `approvedAt` 은 처음 「연결 허용」 을 받은 시각이고 받은 적이 없으면 null 이다 */
data class OAuthClientRecord(
    val id: String,
    val name: String,
    val redirectUris: List<String>,
    val createdAt: String,
    val approvedAt: String?,
) {
    companion object {
        fun from(c: Map<String, Any?>) = OAuthClientRecord(
            id = c["id"] as String,
            name = c["name"] as String,
            redirectUris = (c["redirectUris"] as List<*>).map { it as String },
            createdAt = c["createdAt"] as String,
            approvedAt = c["approvedAt"] as String?,
        )
    }
}

/** `:OAuthClient`. 어디에도 잇지 않는다(docs/data-schema.md 「OAuth 연결」) */
@Repository
class OAuthClientRepository(private val client: Neo4jClient) {

    @Suppress("UNCHECKED_CAST")
    fun create(name: String, redirectUris: List<String>): OAuthClientRecord {
        val props = mapOf(
            "id" to UUID.randomUUID().toString(), "name" to name, "redirectUris" to redirectUris, "createdAt" to Timestamps.now(),
        )
        return client.query("CREATE (c:OAuthClient) SET c = ${'$'}props RETURN properties(c) AS c")
            .bind(props).to("props").fetch().one()
            .map { OAuthClientRecord.from(it["c"] as Map<String, Any?>) }
            .orElseThrow { IllegalStateException("OAuth 클라이언트를 만들지 못했습니다") }
    }

    @Suppress("UNCHECKED_CAST")
    fun find(id: String): OAuthClientRecord? =
        client.query("MATCH (c:OAuthClient {id: ${'$'}id}) RETURN properties(c) AS c")
            .bind(id).to("id").fetch().one()
            .map { OAuthClientRecord.from(it["c"] as Map<String, Any?>) }.orElse(null)

    /** 승인받은 적 없고 [before] 보다 먼저 등록한 클라이언트를 지우고 지운 수를 돌려준다. 시각은 고정 자릿수 문자열이라 문자열로 비교한다 */
    fun deleteStaleUnapproved(before: String): Long =
        client.query(
            """
            MATCH (c:OAuthClient) WHERE c.approvedAt IS NULL AND c.createdAt < ${'$'}before
            DETACH DELETE c
            RETURN count(c) AS n
            """,
        ).bind(before).to("before").fetch().one().map { (it["n"] as Number).toLong() }.orElse(0L)

    /** 승인받은 적 없는 클라이언트 전체 수 */
    fun countUnapproved(): Long =
        client.query("MATCH (c:OAuthClient) WHERE c.approvedAt IS NULL RETURN count(c) AS n")
            .fetch().one().map { (it["n"] as Number).toLong() }.orElse(0L)

    /** 처음 승인받은 시각을 남긴다. 이미 있으면 그대로 둔다 */
    fun markApproved(id: String, now: String) {
        client.query("MATCH (c:OAuthClient {id: ${'$'}id}) WHERE c.approvedAt IS NULL SET c.approvedAt = ${'$'}now")
            .bindAll(params("id" to id, "now" to now)).run()
    }
}
