package dev.fos.workbench.learning

import dev.fos.workbench.ontology.Ontology

/**
 * 근거 따라가기와 공부 목록이 함께 쓰는 관계 분류(docs/adr/011-learning-marks-and-trace.md).
 * 관계 이름 목록이 아니라 온톨로지의 끝(to) 타입으로 나눈다. 돌려준 키는 Cypher 에 parameter 로만 넘긴다.
 */
object LearningRules {
    const val DOCUMENT = "Document"
    const val CONCEPT = "Concept"
    const val DECISION = "Decision"

    /** 근거 따라가기와 공부 맥락의 깊이 상한 */
    const val MAX_DEPTH = 6

    /** 끝 타입에 Document 가 있는 관계 종류 */
    fun evidenceTypes(o: Ontology): List<String> = o.relationshipTypes.filterValues { DOCUMENT in it.to }.keys.toList()

    /** 끝 타입에 Concept 가 있는 관계 종류 */
    fun conceptTypes(o: Ontology): List<String> = o.relationshipTypes.filterValues { CONCEPT in it.to }.keys.toList()

    /** 근거 관계와 개념 관계를 뺀 나머지 일반 관계 종류. 주장 관계와 KNOWS 는 relationshipTypes 에 없어 처음부터 빠진다 */
    fun traversableTypes(o: Ontology): List<String> {
        val excluded = (evidenceTypes(o) + conceptTypes(o)).toSet()
        return o.relationshipTypes.keys.filterNot { it in excluded }
    }
}
