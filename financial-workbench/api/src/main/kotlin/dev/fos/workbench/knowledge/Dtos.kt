package dev.fos.workbench.knowledge

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonUnwrapped
import dev.fos.workbench.auth.UserRef

data class NodeRef(val id: String, val type: String, val label: String, val archived: Boolean)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class NodeView(
    val id: String,
    val type: String,
    val label: String,
    val properties: Map<String, Any?>,
    val revision: Long,
    val archived: Boolean,
    val archivedAt: String?,
    val createdAt: String,
    val createdBy: UserRef?,
    val updatedAt: String,
    val updatedBy: UserRef?,
    val reviewStatus: String?,
)

data class DocumentRef(
    val id: String,
    val title: String,
    val url: String,
    val publisher: String?,
    val documentType: String?,
    val publishedAt: String?,
    val collectedAt: String?,
    val archived: Boolean,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class ClaimView(
    @get:JsonUnwrapped val node: NodeView,
    val reviewedBy: UserRef?,
    val reviewedAt: String?,
    val reviewNote: String?,
    val contentUpdatedBy: UserRef?,
    val subject: NodeRef?,
    val `object`: NodeRef?,
    val documents: List<DocumentRef>,
)

data class RelationshipView(
    val id: String,
    val type: String,
    val from: NodeRef,
    val to: NodeRef,
    val revision: Long,
    val archived: Boolean,
    val createdAt: String,
    val createdBy: UserRef?,
)

data class NodeDetail(
    val node: NodeView,
    val claim: ClaimView?,
    val relationships: List<RelationshipView>,
    val claims: List<ClaimView>,
    val relationshipsTruncated: Boolean,
    val claimsTruncated: Boolean,
    val limits: DetailLimits,
)

/** 보관하지 않은 노드의 타입별 개수. 온톨로지의 모든 노드 타입 키를 담고 없는 타입은 0 이다 */
data class NodeCounts(val counts: Map<String, Long>)

data class DetailLimits(val maxRelationships: Int, val maxClaims: Int)

data class CreateNodeRequest(val type: String, val properties: Map<String, Any?> = emptyMap())

data class PatchNodeRequest(val expectedRevision: Long, val properties: Map<String, Any?> = emptyMap())

data class RevisionRequest(val expectedRevision: Long, val reason: String? = null)

data class CreateRelationshipRequest(val type: String, val fromId: String, val toId: String)

data class CreateClaimRequest(
    val predicate: String,
    val subjectId: String,
    val objectId: String,
    val documentIds: List<String> = emptyList(),
    val description: String? = null,
    val evidenceText: String? = null,
    val validFrom: String? = null,
    val validTo: String? = null,
    val authoringMethod: String? = null,
    val extractionConfidence: Double? = null,
)

data class ReviewRequest(val expectedRevision: Long, val status: String, val note: String? = null)
