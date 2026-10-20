package dev.fos.workbench.knowledge

import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.web.ArchivedException
import dev.fos.workbench.web.LastEvidenceException
import dev.fos.workbench.web.NoActiveEvidenceException
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.RevisionConflictException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component

/**
 * 대상에 쓰기 잠금을 먼저 걸고 그 뒤에 revision 을 읽는다(ADR 003).
 * 반드시 서비스의 쓰기 트랜잭션 안에서 부른다. 잠금 표시 `_lock` 은 [updateNode], [updateRelationship] 가 지우고,
 * 예외로 끝나면 트랜잭션 롤백이 지운다.
 */
@Component
class RevisionGuard(private val client: Neo4jClient, private val ontology: Ontology) {

    @Suppress("UNCHECKED_CAST")
    fun lockNode(id: String): Map<String, Any?> =
        client.query("MATCH (n:Knowledge {id: \$id}) SET n._lock = true RETURN properties(n) AS n")
            .bind(id).to("id").fetch().one()
            .map { (it["n"] as Map<String, Any?>) - LOCK }
            .orElseThrow { NotFoundException(id) }

    data class LockedRelationship(val type: String, val fromId: String, val toId: String, val props: Map<String, Any?>)

    /** 관계 타입을 넣어야 타입별 id 인덱스를 쓴다. 허용 목록의 타입을 차례로 찾는다. */
    @Suppress("UNCHECKED_CAST")
    fun lockRelationship(id: String): LockedRelationship {
        for (type in ontology.allRelationshipTypes.sorted()) {
            val found = client.query(
                "MATCH (a:Knowledge)-[r:`$type` {id: \$id}]->(b:Knowledge) SET r._lock = true " +
                    "RETURN a.id AS fromId, b.id AS toId, properties(r) AS r",
            ).bind(id).to("id").fetch().one().map {
                LockedRelationship(type, it["fromId"] as String, it["toId"] as String, (it["r"] as Map<String, Any?>) - LOCK)
            }.orElse(null)
            if (found != null) return found
        }
        throw NotFoundException(id)
    }

    /** 일반 관계를 만들기 전처럼 revision 을 바꾸지 않고 노드만 잠근다. 트랜잭션 끝에 [unlockNode] 를 부른다. */
    fun unlockNode(id: String) {
        client.query("MATCH (n:Knowledge {id: \$id}) REMOVE n._lock").bind(id).to("id").run()
    }

    /** Claim 에 보관되지 않은 근거 문서가 하나 이상 있는지. */
    fun hasActiveEvidence(claimId: String): Boolean =
        client.query(
            "MATCH (:Knowledge:Claim {id: \$id})-[:SUPPORTED_BY]->(d:Knowledge) WHERE d.archived = false RETURN count(d) > 0 AS ok",
        ).bind(claimId).to("id").fetch().one().map { it["ok"] == true }.orElse(false)

    fun requireActiveEvidence(claimId: String) {
        if (!hasActiveEvidence(claimId)) throw NoActiveEvidenceException()
    }

    /**
     * Document 를 보관하기 전에 부른다. 이 문서를 근거로 쓰는 활성 Claim 을 ID 순서로 잠근 뒤,
     * 이 문서 말고 다른 활성 근거가 없는 Claim 이 있으면 거절한다. 두 문서를 동시에 보관해도 두 번째는 잠금 뒤 값을 본다.
     */
    fun requireNotLastEvidence(documentId: String) {
        val orphaned = client.query(
            """
            MATCH (c:Knowledge:Claim)-[:SUPPORTED_BY]->(:Knowledge {id: ${'$'}id})
            WHERE c.archived = false
            WITH c ORDER BY c.id
            SET c._lock = true
            WITH c
            WHERE NOT EXISTS {
              MATCH (c)-[:SUPPORTED_BY]->(other:Knowledge) WHERE other.id <> ${'$'}id AND other.archived = false
            }
            RETURN c.id AS id
            """,
        ).bind(documentId).to("id").fetch().all().map { it["id"] as String }
        if (orphaned.isNotEmpty()) throw LastEvidenceException(orphaned)
        client.query("MATCH (c:Knowledge:Claim)-[:SUPPORTED_BY]->(:Knowledge {id: \$id}) REMOVE c._lock").bind(documentId).to("id").run()
    }

    fun requireRevision(props: Map<String, Any?>, expected: Long) {
        val current = (props["revision"] as Number).toLong()
        if (current != expected) throw RevisionConflictException(expected, current)
    }

    fun requireActive(props: Map<String, Any?>) {
        if (props["archived"] == true) throw ArchivedException()
    }

    /** `set` 의 null 값은 그 속성을 지운다. revision 을 1 올리고 갱신된 속성 맵을 돌려준다. */
    @Suppress("UNCHECKED_CAST")
    fun updateNode(id: String, set: Map<String, Any?>, actorId: String): Map<String, Any?> =
        client.query(
            """
            MATCH (n:Knowledge {id: ${'$'}id})
            SET n += ${'$'}set, n.revision = n.revision + 1, n.updatedAt = ${'$'}now, n.updatedBy = ${'$'}actor
            REMOVE n._lock
            RETURN properties(n) AS n
            """,
        ).bindAll(mapOf("id" to id, "set" to set, "now" to Timestamps.now(), "actor" to actorId))
            .fetch().one().map { it["n"] as Map<String, Any?> }.orElseThrow { NotFoundException(id) }

    @Suppress("UNCHECKED_CAST")
    fun updateRelationship(type: String, id: String, set: Map<String, Any?>, actorId: String): Map<String, Any?> =
        client.query(
            """
            MATCH (:Knowledge)-[r:`$type` {id: ${'$'}id}]->(:Knowledge)
            SET r += ${'$'}set, r.revision = r.revision + 1, r.updatedAt = ${'$'}now, r.updatedBy = ${'$'}actor
            REMOVE r._lock
            RETURN properties(r) AS r
            """,
        ).bindAll(mapOf("id" to id, "set" to set, "now" to Timestamps.now(), "actor" to actorId))
            .fetch().one().map { it["r"] as Map<String, Any?> }.orElseThrow { NotFoundException(id) }

    companion object {
        const val LOCK = "_lock"
    }
}
