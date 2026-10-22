package dev.fos.workbench.knowledge

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.params
import dev.fos.workbench.history.ChangeAction
import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.FieldChange
import dev.fos.workbench.history.TargetKind
import dev.fos.workbench.history.diff
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.ontology.OntologyValidator
import dev.fos.workbench.web.DuplicateException
import dev.fos.workbench.web.NotArchivedException
import dev.fos.workbench.web.OntologyViolationException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Service
class NodeService(
    private val client: Neo4jClient,
    private val ontology: Ontology,
    private val validator: OntologyValidator,
    private val guard: RevisionGuard,
    private val recorder: ChangeEventRecorder,
    private val reader: KnowledgeReader,
) {

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun create(request: CreateNodeRequest, actorId: String): NodeView {
        val def = ontology.requireNodeType(request.type)
        if (def.managedBy == CLAIMS) {
            throw OntologyViolationException("claim-via-claims-api", "Claim 은 /api/claims 로 만듭니다.")
        }
        val properties = validator.validateCreate(request.type, request.properties)
        if (request.type == SECURITY) requireUniqueListing(properties, exceptId = null)
        val now = Timestamps.now()
        val id = UUID.randomUUID().toString()
        val props = properties + mapOf(
            "id" to id, "type" to request.type, "revision" to 1L, "archived" to false,
            "createdAt" to now, "createdBy" to actorId, "updatedAt" to now, "updatedBy" to actorId,
            "searchText" to searchText(request.type, properties),
        )
        // label 은 requireNodeType 으로 허용 목록과 대조한 값만 넣는다
        client.query("CREATE (n:Knowledge:`${request.type}`) SET n = \$props").bind(props).to("props").run()
        recorder.record(
            ChangeEventDraft(
                actorId, ChangeAction.CREATE, id, TargetKind.NODE, request.type, ontology.labelOf(request.type, properties), 1L,
                properties.mapValues { (_, v) -> FieldChange(null, v) },
            ),
        )
        return reader.node(id)
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun patch(id: String, request: PatchNodeRequest, actorId: String): NodeView {
        val before = guard.lockNode(id)
        val type = before["type"] as String
        if (ontology.requireNodeType(type).managedBy == CLAIMS) {
            throw OntologyViolationException("claim-via-claims-api", "Claim 은 PATCH /api/claims/{id} 로 고칩니다.")
        }
        guard.requireRevision(before, request.expectedRevision)
        guard.requireActive(before)
        val changes = validator.validatePatch(type, request.properties)
        if (diff(before, changes).isEmpty()) {
            // 바뀐 값이 없으면 revision 을 올리지 않고 이력도 남기지 않는다
            guard.unlockNode(id)
            return reader.node(id)
        }
        val merged = (before + changes).filterValues { it != null }
        if (type == SECURITY) requireUniqueListing(merged, exceptId = id)
        val after = guard.updateNode(id, changes + ("searchText" to searchText(type, merged)), actorId)
        recorder.record(
            ChangeEventDraft(
                actorId, ChangeAction.UPDATE, id, TargetKind.NODE, type, ontology.labelOf(type, after),
                (after["revision"] as Number).toLong(), diff(before, changes),
            ),
        )
        return reader.node(id)
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun archive(id: String, request: RevisionRequest, actorId: String): NodeView {
        val before = guard.lockNode(id)
        guard.requireRevision(before, request.expectedRevision)
        guard.requireActive(before)
        if (before["type"] == DOCUMENT) guard.requireNotLastEvidence(id)
        val set = mapOf("archived" to true, "archivedAt" to Timestamps.now())
        val after = guard.updateNode(id, set, actorId)
        record(ChangeAction.ARCHIVE, before, after, actorId, request.reason)
        return reader.node(id)
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun restore(id: String, request: RevisionRequest, actorId: String): NodeView {
        // Claim 은 근거 Document 를 먼저 잠근다. 근거 보관과 같은 잠금 순서(Document 다음 Claim)를 지킨다
        if (reader.nodeProps(id)["type"] == ClaimService.CLAIM) guard.lockEvidenceDocuments(id)
        val before = guard.lockNode(id)
        guard.requireRevision(before, request.expectedRevision)
        if (before["archived"] != true) throw NotArchivedException()
        if (before["type"] == ClaimService.CLAIM) guard.requireActiveEvidence(id)
        val after = guard.updateNode(id, mapOf("archived" to false, "archivedAt" to null), actorId)
        record(ChangeAction.RESTORE, before, after, actorId, request.reason)
        return reader.node(id)
    }

    private fun record(action: ChangeAction, before: Map<String, Any?>, after: Map<String, Any?>, actorId: String, note: String?) {
        val type = after["type"] as String
        recorder.record(
            ChangeEventDraft(
                actorId, action, after["id"] as String, TargetKind.NODE, type, reader.labelOf(after),
                (after["revision"] as Number).toLong(),
                mapOf("archived" to FieldChange(before["archived"], after["archived"])),
                note?.takeIf { it.isNotBlank() }?.take(1000),
            ),
        )
    }

    private fun requireUniqueListing(props: Map<String, Any?>, exceptId: String?) {
        val exists = client.query(
            "MATCH (s:Knowledge:Security {market: \$market, ticker: \$ticker}) WHERE s.id <> coalesce(\$exceptId, '') RETURN count(s) > 0 AS exists",
        ).bindAll(params("market" to props["market"], "ticker" to props["ticker"], "exceptId" to exceptId))
            .fetch().one().map { it["exists"] == true }.orElse(false)
        if (exists) throw DuplicateException("같은 시장에 같은 종목 코드가 이미 있습니다. 보관된 종목이면 복원하세요.")
    }

    private fun searchText(type: String, props: Map<String, Any?>): String =
        (listOfNotNull(ontology.labelOf(type, props), props["ticker"]) +
            ontology.requireNodeType(type).searchProperties.mapNotNull { props[it] }).joinToString(" ").lowercase()

    companion object {
        const val CLAIMS = "claims"
        const val SECURITY = "Security"
        const val DOCUMENT = "Document"
    }
}
