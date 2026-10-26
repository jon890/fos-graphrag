package dev.fos.workbench.learning

import com.fasterxml.jackson.annotation.JsonInclude
import dev.fos.workbench.knowledge.ConceptRef
import dev.fos.workbench.knowledge.DocumentRef
import dev.fos.workbench.knowledge.NodeRef
import dev.fos.workbench.knowledge.NodeView

/** 요청한 사람의 이해 표시 하나. 표시가 없으면 level, note, updatedAt 이 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class KnowledgeMark(val nodeId: String, val level: String?, val note: String?, val updatedAt: String?)

data class PutKnowledgeRequest(val level: String? = null, val note: String? = null)

/** 공부 항목을 근거 단계로 가지는 투자 결정. depth 는 결정에서 이 항목까지의 단계 수다 */
data class StudyContext(val decision: NodeRef, val depth: Int)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class StudyItem(
    val node: NodeRef,
    val level: String,
    val note: String?,
    val updatedAt: String,
    val contexts: List<StudyContext>,
    val documents: List<DocumentRef>,
    val concepts: List<ConceptRef>,
)

/** 근거 따라가기 단계에 붙는 주장. label 은 「주체 → 대상 관계」 이름이다 */
data class TraceClaim(val id: String, val label: String, val predicate: String, val reviewStatus: String?)

/** 이 단계로 들어오는 관계가 하나도 없는 관계 종류와, 이을 만한 가까운 시작 노드 */
data class TraceMissing(val relationshipType: String, val candidates: List<NodeRef>)

/** 근거 따라가기의 한 단계. childId, relationshipId, relationshipType 은 한 단계 아래로 가는 처음 찾은 길이고 지금 항목은 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class TraceStep(
    val node: NodeView,
    val depth: Int,
    val childId: String?,
    val relationshipId: String?,
    val relationshipType: String?,
    val status: String,
    val documents: List<DocumentRef>,
    val claims: List<TraceClaim>,
    val concepts: List<ConceptRef>,
    val missing: List<TraceMissing>,
    val knowledge: KnowledgeMark?,
)

/** 지금 항목에서 나가는 관계의 끝. 이 항목에 기대는 아래쪽 항목이다 */
data class TraceDependent(val node: NodeRef, val relationshipId: String, val relationshipType: String)

data class TraceLimits(val maxDepth: Int, val maxSteps: Int, val maxDependents: Int, val maxCandidates: Int)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class TraceView(
    val rootId: String,
    val steps: List<TraceStep>,
    val dependents: List<TraceDependent>,
    val truncated: Boolean,
    val dependentsTruncated: Boolean,
    val limits: TraceLimits,
)

/** 표시 수와 내 능력 범위. counts 는 KNOWN, UNSURE, LEARNING 을 모두 담는다 */
data class KnowledgeSummary(val counts: Map<String, Long>, val decisions: DecisionUnderstanding, val decisionsTruncated: Boolean)

/** total 은 센 결정 수, understood 는 그 가운데 근거 따라가기의 모든 단계를 KNOWN 으로 표시한 결정 수다 */
data class DecisionUnderstanding(val total: Long, val understood: Long)
