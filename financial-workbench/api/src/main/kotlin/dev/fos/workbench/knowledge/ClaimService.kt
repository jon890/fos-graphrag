package dev.fos.workbench.knowledge

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.history.ChangeAction
import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.FieldChange
import dev.fos.workbench.history.TargetKind
import dev.fos.workbench.history.diff
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.ontology.OntologyValidator
import dev.fos.workbench.web.ArchivedException
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.OntologyViolationException
import dev.fos.workbench.web.SelfReviewForbiddenException
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

enum class ReviewStatus { DRAFT, REVIEWED, REJECTED }

@Service
class ClaimService(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    private val validator: OntologyValidator,
    private val guard: RevisionGuard,
    private val recorder: ChangeEventRecorder,
    private val reader: KnowledgeReader,
) {

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun create(request: CreateClaimRequest, actorId: String): ClaimView {
        val ontology = holder.current()
        val predicate = ontology.requirePredicate(request.predicate)
        if (request.documentIds.isEmpty()) throw ValidationFailedException(mapOf("documentIds" to "근거 문서를 하나 이상 고르세요."))
        if (request.documentIds.distinct().size > Limits.MAX_DOCUMENTS_PER_CLAIM) {
            throw ValidationFailedException(mapOf("documentIds" to "근거 문서는 ${Limits.MAX_DOCUMENTS_PER_CLAIM}개까지 고를 수 있습니다."))
        }
        val ids = (listOf(request.subjectId, request.objectId) + request.documentIds).distinct()
        // 주어, 목적어, 근거 문서가 그 사이에 보관되지 않게 ID 순서로 잠근다. 없는 ID 는 404 다
        val found = ids.sorted().associateWith { guard.lockNode(it) }

        val subject = found.getValue(request.subjectId)
        val obj = found.getValue(request.objectId)
        requireType(subject, predicate.subjectTypes, "claim-subject-type", "주어")
        requireType(obj, predicate.objectTypes, "claim-object-type", "목적어")
        request.documentIds.forEach { requireType(found.getValue(it), listOf("Document"), "claim-evidence-type", "근거") }
        if (found.values.any { it["archived"] == true }) throw ArchivedException()

        val properties = validator.validateCreate(
            CLAIM,
            mapOf(
                "predicate" to request.predicate,
                "description" to request.description,
                "evidenceText" to request.evidenceText,
                "validFrom" to request.validFrom,
                "validTo" to request.validTo,
                "authoringMethod" to (request.authoringMethod ?: "MANUAL"),
                "extractionConfidence" to request.extractionConfidence,
            ),
        )
        requireValidPeriod(properties)
        val id = UUID.randomUUID().toString()
        val now = Timestamps.now()
        val audit = mapOf("revision" to 1L, "archived" to false, "createdAt" to now, "createdBy" to actorId, "updatedAt" to now, "updatedBy" to actorId)
        val props = properties + audit + mapOf(
            "id" to id, "type" to CLAIM, "reviewStatus" to ReviewStatus.DRAFT.name,
            "searchText" to request.predicate.lowercase(), "contentUpdatedBy" to actorId,
        )
        fun link() = audit + ("id" to UUID.randomUUID().toString())
        client.query(
            """
            CREATE (c:Knowledge:Claim) SET c = ${'$'}props
            WITH c
            MATCH (s:Knowledge {id: ${'$'}subjectId}), (o:Knowledge {id: ${'$'}objectId})
            CREATE (c)-[subj:SUBJECT]->(s) SET subj = ${'$'}subjectLink
            CREATE (c)-[obj:OBJECT]->(o) SET obj = ${'$'}objectLink
            WITH c
            UNWIND ${'$'}documents AS d
            MATCH (doc:Knowledge {id: d.documentId})
            CREATE (c)-[e:SUPPORTED_BY]->(doc) SET e = d.link
            """,
        ).bindAll(
            mapOf(
                "props" to props, "subjectId" to request.subjectId, "objectId" to request.objectId,
                "subjectLink" to link(), "objectLink" to link(),
                "documents" to request.documentIds.distinct().map { mapOf("documentId" to it, "link" to link()) },
            ),
        ).run()
        client.query("UNWIND \$ids AS lockedId MATCH (n:Knowledge {id: lockedId}) REMOVE n._lock").bind(ids).to("ids").run()
        recorder.record(
            ChangeEventDraft(
                actorId, ChangeAction.CREATE, id, TargetKind.NODE, CLAIM,
                ontology.claimLabel(
                    ontology.labelOf(subject["type"] as String, subject),
                    ontology.labelOf(obj["type"] as String, obj),
                    request.predicate,
                ),
                1L,
                properties.mapValues { (_, v) -> FieldChange(null, v) } + mapOf(
                    "subjectId" to FieldChange(null, request.subjectId),
                    "objectId" to FieldChange(null, request.objectId),
                    "documentIds" to FieldChange(null, request.documentIds.distinct()),
                ),
            ),
        )
        return reader.claim(id)
    }

    /** 본문은 바꿀 필드만 담는다. 키가 있고 값이 null 이면 그 값을 지운다(유효 기간은 미상으로 돌아간다). */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun patch(id: String, body: Map<String, Any?>, actorId: String): ClaimView {
        val expected = (body["expectedRevision"] as? Number)?.toLong()
            ?: throw ValidationFailedException(mapOf("expectedRevision" to "필수 값입니다."))
        val requested = body - "expectedRevision"
        val immutable = requested.keys.filter { it in IMMUTABLE }
        if (immutable.isNotEmpty()) {
            throw OntologyViolationException("claim-immutable-field", "Claim 의 ${immutable.joinToString()} 은 바꿀 수 없습니다. 보관하고 새로 만드세요.")
        }
        val before = lockClaim(id)
        guard.requireRevision(before, expected)
        guard.requireActive(before)
        val changes = validator.validatePatch(CLAIM, requested)
        requireValidPeriod((before + changes).filterValues { it != null })
        val contentChanged = diff(before, changes)
        if (contentChanged.isEmpty()) {
            // 바뀐 값이 없으면 revision 을 올리지 않고 검토 상태도 그대로 둔다
            guard.unlockNode(id)
            return reader.claim(id)
        }
        val reset = mapOf(
            "reviewStatus" to ReviewStatus.DRAFT.name, "reviewedBy" to null, "reviewedAt" to null, "reviewNote" to null,
            "contentUpdatedBy" to actorId,
        )
        val after = guard.updateNode(id, changes + reset, actorId)
        recorder.record(
            ChangeEventDraft(
                actorId, ChangeAction.UPDATE, id, TargetKind.NODE, CLAIM, reader.labelOf(before),
                (after["revision"] as Number).toLong(), contentChanged + diff(before, reset - "contentUpdatedBy"),
            ),
        )
        return reader.claim(id)
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun review(id: String, request: ReviewRequest, actorId: String): ClaimView {
        val status = ReviewStatus.entries.firstOrNull { it.name == request.status }
            ?: throw ValidationFailedException(mapOf("status" to "REVIEWED, REJECTED, DRAFT 가운데 하나여야 합니다."))
        // REVIEWED 는 활성 근거가 있어야 한다. 근거 보관과 같은 잠금 순서(Document 다음 Claim)를 지킨다
        if (status == ReviewStatus.REVIEWED) guard.lockEvidenceDocuments(id)
        val before = lockClaim(id)
        guard.requireRevision(before, request.expectedRevision)
        guard.requireActive(before)
        // 작성자와 마지막으로 내용을 고친 사람은 그 내용을 검토할 수 없다
        if (before["createdBy"] == actorId || before["contentUpdatedBy"] == actorId) throw SelfReviewForbiddenException()
        if (status == ReviewStatus.REVIEWED) guard.requireActiveEvidence(id)
        val note = request.note?.trim()?.takeIf { it.isNotEmpty() }?.take(2000)
        if (before["reviewStatus"] == status.name && before["reviewNote"] == note) {
            guard.unlockNode(id)
            return reader.claim(id)
        }
        val set = if (status == ReviewStatus.DRAFT) {
            mapOf("reviewStatus" to status.name, "reviewedBy" to null, "reviewedAt" to null, "reviewNote" to note)
        } else {
            mapOf("reviewStatus" to status.name, "reviewedBy" to actorId, "reviewedAt" to Timestamps.now(), "reviewNote" to note)
        }
        val after = guard.updateNode(id, set, actorId)
        recorder.record(
            ChangeEventDraft(
                actorId, ChangeAction.REVIEW, id, TargetKind.NODE, CLAIM, reader.labelOf(before),
                (after["revision"] as Number).toLong(),
                mapOf("reviewStatus" to FieldChange(before["reviewStatus"], status.name)), note,
            ),
        )
        return reader.claim(id)
    }

    private fun lockClaim(id: String): Map<String, Any?> {
        val props = guard.lockNode(id)
        if (props["type"] != CLAIM) throw NotFoundException(id)
        return props
    }

    private fun requireType(node: Map<String, Any?>, allowed: List<String>, rule: String, role: String) {
        if (node["type"] !in allowed) {
            throw OntologyViolationException(rule, "$role 는 ${allowed.joinToString()} 타입이어야 합니다. 받은 타입: ${node["type"]}")
        }
    }

    private fun requireValidPeriod(props: Map<String, Any?>) {
        val from = props["validFrom"] as String?
        val to = props["validTo"] as String?
        if (from != null && to != null && from > to) {
            throw ValidationFailedException(mapOf("validTo" to "validFrom 보다 앞설 수 없습니다."))
        }
    }

    companion object {
        const val CLAIM = "Claim"
        val IMMUTABLE = setOf("predicate", "authoringMethod", "subjectId", "objectId", "documentIds")
    }
}
