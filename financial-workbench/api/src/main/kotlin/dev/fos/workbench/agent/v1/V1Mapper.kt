package dev.fos.workbench.agent.v1

import dev.fos.workbench.knowledge.ClaimView
import dev.fos.workbench.knowledge.ConceptRef
import dev.fos.workbench.knowledge.DocumentRef
import dev.fos.workbench.knowledge.NodeRef
import dev.fos.workbench.knowledge.NodeView
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.ontology.PropertyType
import dev.fos.workbench.web.PageQuery
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.stereotype.Component

/** 지금 온톨로지의 표시 이름으로 v1 표현을 만든다. 표시 이름이 없으면 키를 그대로 쓴다 */
@Component
class V1Mapper(private val holder: OntologyHolder) {

    fun typeLabel(type: String): String = holder.current().nodeTypes[type]?.label ?: type

    fun ref(id: String, type: String, label: String): V1NodeRef = V1NodeRef(id, type, typeLabel(type), label)

    fun ref(r: NodeRef): V1NodeRef = ref(r.id, r.type, r.label)

    fun ref(n: NodeView): V1NodeRef = ref(n.id, n.type, n.label)

    /** 화면용 `PageQuery.of` 는 100 까지 받으므로 v1 의 상한 50 을 먼저 검사한다 */
    fun page(page: Int?, size: Int?): PageQuery {
        if (size != null && size !in 1..MAX_PAGE_SIZE) {
            throw ValidationFailedException(mapOf("size" to "1 이상 $MAX_PAGE_SIZE 이하여야 합니다."))
        }
        return PageQuery.of(page, size)
    }

    /** 상세 밖에 끼워 넣은 긴 글은 [MAX_TEXT] 자에서 자르고 끝에 `…` 를 붙인다 */
    fun cut(text: String?): String? = if (text != null && text.length > MAX_TEXT) text.take(MAX_TEXT) + "…" else text

    fun document(d: DocumentRef): V1Document = V1Document(d.id, d.title, d.url, d.publisher, d.documentType, d.publishedAt, d.collectedAt)

    fun concept(c: ConceptRef): V1Concept = V1Concept(c.id, c.label, c.summary)

    /** 보관된 주체와 대상은 null, 보관된 근거 문서는 뺀다. `cutText` 면 설명과 근거 문장을 자른다 */
    fun claim(c: ClaimView, cutText: Boolean): V1Claim {
        val p = c.node.properties
        val predicate = p["predicate"]?.toString() ?: ""
        val description = p["description"]?.toString()
        val evidenceText = p["evidenceText"]?.toString()
        return V1Claim(
            id = c.node.id,
            label = c.node.label,
            predicate = predicate,
            predicateLabel = holder.current().claimPredicates[predicate]?.label ?: predicate,
            reviewStatus = c.node.reviewStatus,
            subject = c.subject?.takeUnless { it.archived }?.let(::ref),
            `object` = c.`object`?.takeUnless { it.archived }?.let(::ref),
            description = if (cutText) cut(description) else description,
            evidenceText = if (cutText) cut(evidenceText) else evidenceText,
            validFrom = p["validFrom"]?.toString(),
            validTo = p["validTo"]?.toString(),
            documents = c.documents.filterNot { it.archived }.map(::document),
        )
    }

    fun summary(n: NodeView): V1NodeSummary =
        V1NodeSummary(n.id, n.type, typeLabel(n.type), n.label, n.reviewStatus, n.revision, n.updatedAt)

    /**
     * 값이 있는 속성을 정의 순서로 담고 글은 자르지 않는다. enum 값은 표시 이름을 함께 담는다.
     * 정의에서 빠진 타입의 노드는 저장된 값을 모두 담고 `label` 은 키, `type` 은 null 이다
     */
    fun properties(n: NodeView): List<V1Property> {
        val def = holder.current().nodeTypes[n.type]
            ?: return n.properties.filterValues { it != null }.map { (key, value) -> V1Property(key, key, null, value, null) }
        return def.properties.mapNotNull { (key, p) ->
            val value = n.properties[key] ?: return@mapNotNull null
            val valueLabel = if (p.type == PropertyType.ENUM) p.valueLabels?.get(value.toString()) ?: value.toString() else null
            V1Property(key, p.label ?: key, p.type.yaml, value, valueLabel)
        }
    }

    /** 화면용 값(색, 모양, 만들기 폼 정보, 예전 값 별칭)은 담지 않는다. 순서는 정의 순서다. 버전과 정의는 같은 스냅샷에서 읽는다 */
    fun ontology(): V1Ontology {
        val snapshot = holder.snapshot()
        val o = snapshot.ontology
        return V1Ontology(
            version = snapshot.version,
            nodeTypes = o.nodeTypes.map { (key, def) ->
                V1NodeType(
                    key = key,
                    label = def.label ?: key,
                    description = def.description,
                    labelProperty = def.labelProperty,
                    properties = def.properties.map { (propertyKey, p) ->
                        V1PropertyDef(
                            key = propertyKey,
                            label = p.label ?: propertyKey,
                            type = p.type.yaml,
                            required = p.required,
                            description = p.description,
                            values = if (p.type == PropertyType.ENUM) {
                                p.values.orEmpty().map { V1EnumValue(it, p.valueLabels?.get(it) ?: it) }
                            } else {
                                null
                            },
                        )
                    },
                )
            },
            relationshipTypes = o.relationshipTypes.map { (key, def) ->
                V1RelationshipType(key, def.label ?: key, def.description, def.from, def.to, def.sentence)
            },
            claimPredicates = o.claimPredicates.map { (key, def) ->
                V1ClaimPredicate(key, def.label ?: key, def.description, def.subjectTypes, def.objectTypes, def.sentence)
            },
        )
    }

    /** 관계 문장 틀의 `{from}`, `{to}` 를 두 끝의 이름으로 바꾼다. 조사는 고르지 않는다. 틀이 없으면 `from -[표시 이름]-> to` 다 */
    fun sentence(type: String, fromLabel: String, toLabel: String): String {
        val def = holder.current().relationshipTypes[type]
        val template = def?.sentence ?: return "$fromLabel -[${def?.label ?: type}]-> $toLabel"
        return template.replace("{from}", fromLabel).replace("{to}", toLabel)
    }

    companion object {
        // 응답 크기 상한(docs/api-contract.md 「에이전트 API(`/api/v1`)」 의 「요청 한도와 응답 크기」)
        const val MAX_PAGE_SIZE = 50
        const val MAX_RELATIONS = 100
        const val MAX_CLAIMS = 20
        const val MAX_DOCUMENTS = 20
        const val MAX_CONCEPTS = 20
        const val MAX_TEXT = 500
    }
}
