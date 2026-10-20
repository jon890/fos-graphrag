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

    /**
     * 근거 규칙의 잠금 순서는 Document 다음 Claim 이다.
     * Claim 을 복원하거나 REVIEWED 로 검토할 때는 Claim 을 잠그기 전에 이 함수로 근거 Document 를 ID 순서로 잠근다.
     * Document 보관은 그 Document 를 먼저 잠그고 연결된 Claim 을 잠근다. 두 쪽 모두 Document 를 먼저 쥐므로 서로를 기다린다.
     */
    fun lockEvidenceDocuments(claimId: String) {
        client.query(
            """
            MATCH (:Knowledge:Claim {id: ${'$'}id})-[:SUPPORTED_BY]->(d:Knowledge)
            WITH d ORDER BY d.id
            SET d._lock = true
            """,
        ).bind(claimId).to("id").run()
    }

    /** lockEvidenceDocuments 로 잠근 뒤 부른다. 활성 근거가 없으면 거절하고, 있으면 Document 잠금 표시를 지운다. */
    fun requireActiveEvidence(claimId: String) {
        val active = client.query(
            "MATCH (:Knowledge:Claim {id: \$id})-[:SUPPORTED_BY]->(d:Knowledge) WHERE d.archived = false RETURN count(d) > 0 AS ok",
        ).bind(claimId).to("id").fetch().one().map { it["ok"] == true }.orElse(false)
        if (!active) throw NoActiveEvidenceException()
        client.query("MATCH (:Knowledge:Claim {id: \$id})-[:SUPPORTED_BY]->(d:Knowledge) REMOVE d._lock").bind(claimId).to("id").run()
    }

    /**
     * Document 를 잠근 뒤(보관 경로) 부른다. 이 문서를 근거로 쓰는 Claim 을 보관 여부와 상관없이 ID 순서로 잠근 다음,
     * 잠금 뒤의 값으로 활성 Claim 가운데 다른 활성 근거가 없는 것을 찾는다. 있으면 거절한다.
     * 잠금 전에 archived 로 거르면, 동시에 복원되는 Claim 을 놓친다.
     */
    fun requireNotLastEvidence(documentId: String) {
        client.query(
            """
            MATCH (c:Knowledge:Claim)-[:SUPPORTED_BY]->(:Knowledge {id: ${'$'}id})
            WITH DISTINCT c ORDER BY c.id
            SET c._lock = true
            """,
        ).bind(documentId).to("id").run()
        val orphaned = client.query(
            """
            MATCH (c:Knowledge:Claim)-[:SUPPORTED_BY]->(:Knowledge {id: ${'$'}id})
            WHERE c.archived = false AND NOT EXISTS {
              MATCH (c)-[:SUPPORTED_BY]->(other:Knowledge) WHERE other.id <> ${'$'}id AND other.archived = false
            }
            RETURN DISTINCT c.id AS id ORDER BY id
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
