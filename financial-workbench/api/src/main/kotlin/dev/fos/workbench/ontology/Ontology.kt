package dev.fos.workbench.ontology

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonValue
import dev.fos.workbench.web.OntologyViolationException

/** ontology/financial-ontology.yaml 의 구조. 필드 이름은 YAML 키와 같다. */
data class Ontology(
    val schemaVersion: String,
    val nodeTypes: Map<String, NodeTypeDef>,
    val relationshipTypes: Map<String, RelationshipTypeDef>,
    val claimRelationships: Map<String, ClaimRelationshipDef>,
    val claimPredicates: Map<String, ClaimPredicateDef>,
    /** Claim 검토 상태의 표시 이름. 키는 서버가 정한 값(DRAFT, REVIEWED, REJECTED)이다 */
    val reviewStatuses: Map<String, LabelDef> = emptyMap(),
    /** 변경 이력 작업(CREATE, UPDATE, ...)의 표시 이름 */
    val changeActions: Map<String, LabelDef> = emptyMap(),
    /** 변경 이력의 changes 키 가운데 온톨로지 속성이 아닌 것의 표시 이름 */
    val changeFields: Map<String, LabelDef> = emptyMap(),
) {
    /** Cypher 에 label 로 넣을 수 있는 이름인지 확인한다. 허용 목록 밖이면 예외다. */
    fun requireNodeType(name: String): NodeTypeDef =
        nodeTypes[name] ?: throw OntologyViolationException("unknown-node-type", "온톨로지에 없는 노드 타입입니다: $name")

    /** 일반 관계 API 로 만들 수 있는 관계 타입인지 확인한다. Claim 관계는 여기 없다. */
    fun requireRelationshipType(name: String): RelationshipTypeDef =
        relationshipTypes[name] ?: throw OntologyViolationException("unknown-relationship-type", "온톨로지에 없는 관계 타입입니다: $name")

    fun requirePredicate(name: String): ClaimPredicateDef =
        claimPredicates[name] ?: throw OntologyViolationException("unknown-predicate", "온톨로지에 없는 Claim predicate 입니다: $name")

    /** 노드가 아닌 관계 타입이 Cypher 에 들어갈 때 쓰는 전체 허용 목록이다. */
    @get:JsonIgnore
    val allRelationshipTypes: Set<String>
        get() = relationshipTypes.keys + claimRelationships.keys

    fun labelOf(type: String, properties: Map<String, Any?>): String {
        val def = nodeTypes[type] ?: return type
        return properties[def.labelProperty]?.toString() ?: type
    }

    /** Claim 의 이름. 「주체 → 대상 관계 표시 이름」 이고, 찾지 못한 끝은 ? 로 둔다 */
    fun claimLabel(subjectLabel: String?, objectLabel: String?, predicate: String): String =
        "${subjectLabel ?: "?"} → ${objectLabel ?: "?"} ${claimPredicates[predicate]?.label ?: predicate}"
}

@JsonInclude(JsonInclude.Include.NON_NULL)
data class NodeTypeDef(
    /** 화면에 보일 이름. 없으면 화면이 타입 키를 그대로 보인다 */
    val label: String? = null,
    val description: String,
    val labelProperty: String,
    val managedBy: String? = null,
    val properties: Map<String, PropertyDef>,
    /** 검색 결과와 고르기 후보에서 이름 옆에 함께 보일 속성 */
    val hintProperties: List<String> = emptyList(),
    /** 검색어에 이름과 함께 넣을 속성 */
    val searchProperties: List<String> = emptyList(),
    /** 그래프와 배지의 색, 모양 */
    val display: NodeDisplayDef? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class NodeDisplayDef(
    /** #rrggbb */
    val color: String? = null,
    /** [SHAPES] 가운데 하나 */
    val shape: String? = null,
) {
    companion object {
        val SHAPES = setOf("ellipse", "round-rectangle", "hexagon", "round-diamond", "round-tag", "round-pentagon")
    }
}

@JsonInclude(JsonInclude.Include.NON_NULL)
data class PropertyDef(
    val type: PropertyType,
    val label: String? = null,
    val required: Boolean = false,
    val maxLength: Int? = null,
    val values: List<String>? = null,
    /** enum 값의 표시 이름. 키는 [values] 안에 있어야 한다. 저장되는 값은 바뀌지 않는다 */
    val valueLabels: Map<String, String>? = null,
    /** enum 값의 예전 표기. 키는 [values] 안에 있어야 한다. 시작할 때 목록 밖 값을 고치는 데 쓴다 */
    val valueAliases: Map<String, List<String>>? = null,
    val min: Double? = null,
    val max: Double? = null,
    val description: String = "",
) {
    /**
     * 목록 밖 enum 값을 목록 값으로 바꾼다. 앞뒤 공백과 대소문자를 무시하고 values 나 valueAliases 와 비교한다.
     * 이미 목록 값이면 그대로, 공백뿐이면 null(속성을 지운다), 어디에도 맞지 않으면 원래 값을 돌려준다.
     */
    fun canonicalEnumValue(raw: String): String? {
        val allowed = values.orEmpty()
        if (raw in allowed) return raw
        val key = raw.trim().lowercase()
        if (key.isEmpty()) return null
        allowed.firstOrNull { it.trim().lowercase() == key }?.let { return it }
        valueAliases.orEmpty().forEach { (value, aliases) ->
            if (aliases.any { it.trim().lowercase() == key }) return value
        }
        return raw
    }
}

enum class PropertyType(@get:JsonValue val yaml: String) {
    STRING("string"),
    TEXT("text"),
    URL("url"),
    ENUM("enum"),
    DATE("date"),
    DATETIME("datetime"),
    NUMBER("number"),
    INTEGER("integer"),
    BOOLEAN("boolean"),
}

data class RelationshipTypeDef(
    val label: String? = null,
    val description: String,
    val from: List<String>,
    val to: List<String>,
    /** 끝(to) 타입 만들기 폼에 시작(from) 노드를 고르는 칸. 없으면 칸이 없다 */
    val createPicker: CreatePickerDef? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class CreatePickerDef(
    val label: String,
    val description: String? = null,
)

data class ClaimRelationshipDef(
    val label: String? = null,
    val description: String,
    val from: List<String>,
    val to: List<String> = emptyList(),
)

data class ClaimPredicateDef(
    val label: String? = null,
    val description: String,
    val subjectTypes: List<String>,
    val objectTypes: List<String>,
    /** 주장 만들기 폼의 문장 틀. `{subject}`, `{object}` 자리에 고르기 칸이 들어간다 */
    val sentence: String? = null,
)

/** 화면에 보일 이름과 짧은 설명. 키 자체는 서버가 정한다. */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class LabelDef(
    val label: String,
    val description: String? = null,
)
