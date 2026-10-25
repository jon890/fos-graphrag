package dev.fos.workbench.learning

import com.fasterxml.jackson.annotation.JsonInclude
import dev.fos.workbench.knowledge.ConceptRef
import dev.fos.workbench.knowledge.DocumentRef
import dev.fos.workbench.knowledge.NodeRef

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
