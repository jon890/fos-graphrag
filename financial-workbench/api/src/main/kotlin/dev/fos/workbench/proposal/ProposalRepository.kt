package dev.fos.workbench.proposal

import dev.fos.workbench.config.params
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Repository

/**
 * `(:User)-[:OWNS]->(:Proposal)`. 모든 쿼리는 주인 사용자 노드에서 `OWNS` 로 제안을 찾는다(docs/data-schema.md 「제안」).
 * 제안은 다른 노드와 잇지 않고 `archived` 를 두지 않는다. 지식 조회에 섞이지 않게 하려는 것이다.
 * 반환하는 맵은 제안 노드의 속성 그대로다. `payload`, `evidence`, `result` 는 JSON 문자열이다.
 */
@Repository
class ProposalRepository(private val client: Neo4jClient) {

    /** 주인 노드에 쓰기 잠금(`_lock`)을 걸고 대기 수를 센다. 같은 주인의 동시 올리기는 여기서 줄을 선다. 사용자가 없으면 null 이다 */
    fun lockOwnerAndCountPending(ownerId: String): Long? =
        client.query(
            """
            MATCH (u:User {id: ${'$'}ownerId})
            SET u._lock = true
            WITH u
            OPTIONAL MATCH (u)-[:OWNS]->(p:Proposal {status: 'PENDING'})
            RETURN count(p) AS pending
            """,
        ).bind(ownerId).to("ownerId").fetch().one().map { (it["pending"] as Number).toLong() }.orElse(null)

    fun unlockOwner(ownerId: String) {
        client.query("MATCH (u:User {id: \$ownerId}) REMOVE u._lock").bind(ownerId).to("ownerId").run()
    }

    @Suppress("UNCHECKED_CAST")
    fun findByDedupeKey(ownerId: String, key: String): Map<String, Any?>? =
        client.query("MATCH (:User {id: \$ownerId})-[:OWNS]->(p:Proposal {dedupeKey: \$key}) RETURN properties(p) AS p")
            .bindAll(params("ownerId" to ownerId, "key" to key)).fetch().one().map { it["p"] as Map<String, Any?> }.orElse(null)

    @Suppress("UNCHECKED_CAST")
    fun find(ownerId: String, id: String): Map<String, Any?>? =
        client.query("MATCH (:User {id: \$ownerId})-[:OWNS]->(p:Proposal {id: \$id}) RETURN properties(p) AS p")
            .bindAll(params("ownerId" to ownerId, "id" to id)).fetch().one().map { it["p"] as Map<String, Any?> }.orElse(null)

    /** props 에는 `id` 가 있다 */
    fun create(ownerId: String, props: Map<String, Any?>): String =
        client.query(
            """
            MATCH (u:User {id: ${'$'}ownerId})
            CREATE (u)-[:OWNS]->(p:Proposal)
            SET p = ${'$'}props
            RETURN p.id AS id
            """,
        ).bindAll(params("ownerId" to ownerId, "props" to props)).fetch().one().map { it["id"] as String }
            .orElseThrow { IllegalStateException("제안을 저장하지 못했습니다: 사용자 $ownerId") }

    /** 결정한 제안 가운데 `decidedAt` 이 before 보다 오래된 것을 지운다. 대기 중인 제안과 exceptIds 는 지우지 않는다 */
    fun deleteDecidedBefore(ownerId: String, before: String, exceptIds: Collection<String> = emptyList()): Long =
        client.query(
            """
            MATCH (:User {id: ${'$'}ownerId})-[:OWNS]->(p:Proposal)
            WHERE p.status <> 'PENDING' AND p.decidedAt < ${'$'}before AND NOT p.id IN ${'$'}exceptIds
            WITH p, p.id AS id
            DETACH DELETE p
            RETURN count(id) AS n
            """,
        ).bindAll(params("ownerId" to ownerId, "before" to before, "exceptIds" to exceptIds.toList())).fetch().one().map { (it["n"] as Number).toLong() }.orElse(0L)

    /** 제안 노드에 쓰기 잠금을 건 뒤 속성을 읽는다. 같은 제안의 동시 승인과 거절은 여기서 줄을 선다. 내 제안이 아니거나 없으면 null 이다 */
    @Suppress("UNCHECKED_CAST")
    fun lock(ownerId: String, id: String): Map<String, Any?>? =
        client.query("MATCH (:User {id: \$ownerId})-[:OWNS]->(p:Proposal {id: \$id}) SET p._lock = true RETURN properties(p) AS p")
            .bindAll(params("ownerId" to ownerId, "id" to id)).fetch().one().map { it["p"] as Map<String, Any?> }.orElse(null)

    /** 승인이나 거절의 결과를 쓰고 잠금과 마지막 승인 실패를 지운다. props 의 null 값은 그 속성을 지운다 */
    @Suppress("UNCHECKED_CAST")
    fun finish(ownerId: String, id: String, props: Map<String, Any?>): Map<String, Any?> =
        client.query(
            """
            MATCH (:User {id: ${'$'}ownerId})-[:OWNS]->(p:Proposal {id: ${'$'}id})
            SET p += ${'$'}props
            REMOVE p._lock, p.lastErrorCode, p.lastErrorMessage, p.lastErrorAt
            RETURN properties(p) AS p
            """,
        ).bindAll(params("ownerId" to ownerId, "id" to id, "props" to props)).fetch().one().map { it["p"] as Map<String, Any?> }
            .orElseThrow { IllegalStateException("제안을 갱신하지 못했습니다: $id") }

    /** 승인 실패를 남긴다. 그 사이 다른 요청이 결정했으면 쓰지 않는다 */
    fun recordError(ownerId: String, id: String, code: String, message: String, at: String) {
        client.query(
            """
            MATCH (:User {id: ${'$'}ownerId})-[:OWNS]->(p:Proposal {id: ${'$'}id})
            WHERE p.status = 'PENDING'
            SET p.lastErrorCode = ${'$'}code, p.lastErrorMessage = ${'$'}message, p.lastErrorAt = ${'$'}at
            """,
        ).bindAll(params("ownerId" to ownerId, "id" to id, "code" to code, "message" to message, "at" to at)).run()
    }

    /**
     * 대기는 오래된 것부터, 결정한 것은 결정한 시각이 늦은 것부터다. status 가 없으면 대기를 앞에 둔다.
     * 정렬 식은 status 에 따라 고른 상수 문자열이다.
     */
    @Suppress("UNCHECKED_CAST")
    fun page(ownerId: String, status: String?, page: PageQuery): Page<Map<String, Any?>> {
        val p = params("ownerId" to ownerId, "status" to status, "skip" to page.skip, "limit" to page.size)
        val match = "MATCH (:User {id: \$ownerId})-[:OWNS]->(p:Proposal) WHERE (\$status IS NULL OR p.status = \$status)"
        val order = when (status) {
            null -> "CASE p.status WHEN 'PENDING' THEN 0 ELSE 1 END, " +
                "CASE p.status WHEN 'PENDING' THEN p.createdAt END, CASE WHEN p.status <> 'PENDING' THEN p.decidedAt END DESC, p.id"
            PENDING -> "p.createdAt, p.id"
            else -> "p.decidedAt DESC, p.id"
        }
        val total = client.query("$match RETURN count(p) AS total").bindAll(p)
            .fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        val rows = client.query("$match RETURN properties(p) AS p ORDER BY $order SKIP \$skip LIMIT \$limit")
            .bindAll(p).fetch().all().map { it["p"] as Map<String, Any?> }
        return page.of(rows, total)
    }

    fun countPending(ownerId: String): Long =
        client.query("MATCH (:User {id: \$ownerId})-[:OWNS]->(p:Proposal {status: 'PENDING'}) RETURN count(p) AS n")
            .bind(ownerId).to("ownerId").fetch().one().map { (it["n"] as Number).toLong() }.orElse(0L)

    /** 제안이 가리키는 지식 노드의 속성. 없는 id 는 빠진다 */
    @Suppress("UNCHECKED_CAST")
    fun nodes(ids: Collection<String>): List<Map<String, Any?>> {
        if (ids.isEmpty()) return emptyList()
        return client.query("MATCH (n:Knowledge) WHERE n.id IN \$ids RETURN properties(n) AS n").bind(ids.distinct()).to("ids")
            .fetch().all().map { it["n"] as Map<String, Any?> }
    }

    companion object {
        const val PENDING = "PENDING"
    }
}
