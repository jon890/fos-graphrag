package dev.fos.workbench.knowledge

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.config.params
import dev.fos.workbench.history.ChangeAction
import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.FieldChange
import dev.fos.workbench.history.TargetKind
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.web.ArchivedException
import dev.fos.workbench.web.DuplicateException
import dev.fos.workbench.web.NotArchivedException
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.OntologyViolationException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class RelationshipService(
    private val client: Neo4jClient,
    private val ontology: Ontology,
    private val guard: RevisionGuard,
    private val recorder: ChangeEventRecorder,
    private val reader: KnowledgeReader,
    private val users: UserRepository,
) {

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun create(request: CreateRelationshipRequest, actorId: String): RelationshipView {
        val def = ontology.requireRelationshipType(request.type)
        // 중복 관계와 보관 경합을 막으려고 양 끝 노드를 ID 순서로 잠근다
        val locked = lockEnds(request.fromId, request.toId)
        val from = locked.getValue(request.fromId)
        val to = locked.getValue(request.toId)
        if (from["type"] !in def.from || to["type"] !in def.to) {
            throw OntologyViolationException(
                "relationship-endpoint",
                "${request.type} 는 ${def.from.joinToString()} → ${def.to.joinToString()} 사이에만 만들 수 있습니다. 요청: ${from["type"]} → ${to["type"]}",
            )
        }
        if (from["archived"] == true || to["archived"] == true) throw ArchivedException()
        requireNoActiveDuplicate(request.type, request.fromId, request.toId, exceptId = null)

        val id = UUID.randomUUID().toString()
        val now = Timestamps.now()
        val props = mapOf(
            "id" to id, "revision" to 1L, "archived" to false,
            "createdAt" to now, "createdBy" to actorId, "updatedAt" to now, "updatedBy" to actorId,
        )
        // 관계 타입은 requireRelationshipType 으로 허용 목록과 대조한 값만 넣는다
        client.query(
            "MATCH (a:Knowledge {id: \$from}), (b:Knowledge {id: \$to}) CREATE (a)-[r:`${request.type}`]->(b) SET r = \$props",
        ).bindAll(mapOf("from" to request.fromId, "to" to request.toId, "props" to props)).run()
        unlockEnds(request.fromId, request.toId)
        recorder.record(
            ChangeEventDraft(
                actorId, ChangeAction.CREATE, id, TargetKind.RELATIONSHIP, request.type, label(from, to), 1L,
                mapOf("fromId" to FieldChange(null, request.fromId), "toId" to FieldChange(null, request.toId)),
            ),
        )
        return view(id)
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun archive(id: String, request: RevisionRequest, actorId: String): RelationshipView = transition(id, request, actorId, archive = true)

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun restore(id: String, request: RevisionRequest, actorId: String): RelationshipView = transition(id, request, actorId, archive = false)

    private fun transition(id: String, request: RevisionRequest, actorId: String, archive: Boolean): RelationshipView {
        val locked = guard.lockRelationship(id)
        if (locked.type !in ontology.relationshipTypes) {
            throw OntologyViolationException("claim-relationship", "Claim 에 딸린 관계는 Claim 을 보관해 정리합니다.")
        }
        guard.requireRevision(locked.props, request.expectedRevision)
        if (archive) {
            guard.requireActive(locked.props)
        } else {
            if (locked.props["archived"] != true) throw NotArchivedException()
            // 복원은 만들기와 같은 규칙을 따른다. 끝 노드가 보관됐거나 같은 활성 관계가 있으면 거절한다
            val ends = lockEnds(locked.fromId, locked.toId)
            if (ends.values.any { it["archived"] == true }) throw ArchivedException()
            requireNoActiveDuplicate(locked.type, locked.fromId, locked.toId, exceptId = id)
            unlockEnds(locked.fromId, locked.toId)
        }
        val set = if (archive) mapOf("archived" to true, "archivedAt" to Timestamps.now()) else mapOf("archived" to false, "archivedAt" to null)
        val after = guard.updateRelationship(locked.type, id, set, actorId)
        recorder.record(
            ChangeEventDraft(
                actorId, if (archive) ChangeAction.ARCHIVE else ChangeAction.RESTORE, id, TargetKind.RELATIONSHIP, locked.type,
                label(reader.nodeProps(locked.fromId), reader.nodeProps(locked.toId)), (after["revision"] as Number).toLong(),
                mapOf("archived" to FieldChange(locked.props["archived"], after["archived"])),
                request.reason?.takeIf { it.isNotBlank() }?.take(1000),
            ),
        )
        return view(id)
    }

    /** 관계 타입마다 id 인덱스가 있어 타입을 넣어 찾는다. */
    fun view(id: String): RelationshipView = ontology.relationshipTypes.keys.sorted().firstNotNullOfOrNull { type ->
        views(
            client.query(
                "MATCH (a:Knowledge)-[r:`$type` {id: \$id}]->(b:Knowledge) RETURN type(r) AS type, properties(r) AS r, properties(a) AS a, properties(b) AS b",
            ).bind(id).to("id").fetch().all().toList(),
        ).firstOrNull()
    } ?: throw NotFoundException(id)

    /** `type`, `r`, `a`, `b` 열을 가진 행을 RelationshipView 로 바꾼다. */
    @Suppress("UNCHECKED_CAST")
    fun views(rows: List<Map<String, Any?>>): List<RelationshipView> {
        val refs = users.findRefs(rows.mapNotNull { (it["r"] as Map<String, Any?>)["createdBy"] as String? })
        return rows.map {
            val r = it["r"] as Map<String, Any?>
            RelationshipView(
                id = r["id"] as String,
                type = it["type"] as String,
                from = reader.ref(it["a"] as Map<String, Any?>),
                to = reader.ref(it["b"] as Map<String, Any?>),
                revision = (r["revision"] as Number).toLong(),
                archived = r["archived"] == true,
                createdAt = r["createdAt"] as String,
                createdBy = refs[r["createdBy"]],
            )
        }
    }

    private fun lockEnds(fromId: String, toId: String): Map<String, Map<String, Any?>> =
        listOf(fromId, toId).distinct().sorted().associateWith { guard.lockNode(it) }

    private fun unlockEnds(fromId: String, toId: String) {
        listOf(fromId, toId).distinct().forEach { guard.unlockNode(it) }
    }

    /** 관계 타입은 호출 전에 온톨로지 허용 목록과 대조한 값이다. */
    private fun requireNoActiveDuplicate(type: String, fromId: String, toId: String, exceptId: String?) {
        val duplicate = client.query(
            "MATCH (:Knowledge {id: \$from})-[r:`$type`]->(:Knowledge {id: \$to}) " +
                "WHERE r.archived = false AND r.id <> coalesce(\$exceptId, '') RETURN count(r) > 0 AS dup",
        ).bindAll(params("from" to fromId, "to" to toId, "exceptId" to exceptId)).fetch().one().map { it["dup"] == true }.orElse(false)
        if (duplicate) throw DuplicateException("같은 관계가 이미 있습니다.")
    }

    private fun label(from: Map<String, Any?>, to: Map<String, Any?>): String =
        "${reader.ref(from).label} → ${reader.ref(to).label}"
}
