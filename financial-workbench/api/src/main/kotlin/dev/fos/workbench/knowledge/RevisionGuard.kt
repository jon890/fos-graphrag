package dev.fos.workbench.knowledge

import dev.fos.workbench.web.ArchivedException
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.RevisionConflictException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component
import java.time.Instant

/**
 * 대상에 쓰기 잠금을 먼저 걸고 그 뒤에 revision 을 읽는다(ADR 003).
 * 반드시 서비스의 쓰기 트랜잭션 안에서 부른다. 잠금 표시 `_lock` 은 [updateNode], [updateRelationship] 가 지우고,
 * 예외로 끝나면 트랜잭션 롤백이 지운다.
 */
@Component
class RevisionGuard(private val client: Neo4jClient) {

    @Suppress("UNCHECKED_CAST")
    fun lockNode(id: String): Map<String, Any?> =
        client.query("MATCH (n:Knowledge {id: \$id}) SET n._lock = true RETURN properties(n) AS n")
            .bind(id).to("id").fetch().one()
            .map { (it["n"] as Map<String, Any?>) - LOCK }
            .orElseThrow { NotFoundException(id) }

    data class LockedRelationship(val type: String, val fromId: String, val toId: String, val props: Map<String, Any?>)

    @Suppress("UNCHECKED_CAST")
    fun lockRelationship(id: String): LockedRelationship =
        client.query(
            "MATCH (a:Knowledge)-[r {id: \$id}]->(b:Knowledge) SET r._lock = true " +
                "RETURN type(r) AS type, a.id AS fromId, b.id AS toId, properties(r) AS r",
        ).bind(id).to("id").fetch().one().map {
            LockedRelationship(it["type"] as String, it["fromId"] as String, it["toId"] as String, (it["r"] as Map<String, Any?>) - LOCK)
        }.orElseThrow { NotFoundException(id) }

    /** 일반 관계를 만들기 전처럼 revision 을 바꾸지 않고 노드만 잠근다. 트랜잭션 끝에 [unlockNode] 를 부른다. */
    fun unlockNode(id: String) {
        client.query("MATCH (n:Knowledge {id: \$id}) REMOVE n._lock").bind(id).to("id").run()
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
        ).bindAll(mapOf("id" to id, "set" to set, "now" to Instant.now().toString(), "actor" to actorId))
            .fetch().one().map { it["n"] as Map<String, Any?> }.orElseThrow { NotFoundException(id) }

    @Suppress("UNCHECKED_CAST")
    fun updateRelationship(id: String, set: Map<String, Any?>, actorId: String): Map<String, Any?> =
        client.query(
            """
            MATCH (:Knowledge)-[r {id: ${'$'}id}]->(:Knowledge)
            SET r += ${'$'}set, r.revision = r.revision + 1, r.updatedAt = ${'$'}now, r.updatedBy = ${'$'}actor
            REMOVE r._lock
            RETURN properties(r) AS r
            """,
        ).bindAll(mapOf("id" to id, "set" to set, "now" to Instant.now().toString(), "actor" to actorId))
            .fetch().one().map { it["r"] as Map<String, Any?> }.orElseThrow { NotFoundException(id) }

    companion object {
        const val LOCK = "_lock"
    }
}
