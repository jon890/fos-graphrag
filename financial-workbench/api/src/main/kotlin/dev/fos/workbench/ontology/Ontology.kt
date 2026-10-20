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
}

@JsonInclude(JsonInclude.Include.NON_NULL)
data class NodeTypeDef(
    val description: String,
    val labelProperty: String,
    val managedBy: String? = null,
    val properties: Map<String, PropertyDef>,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class PropertyDef(
    val type: PropertyType,
    val required: Boolean = false,
    val maxLength: Int? = null,
    val values: List<String>? = null,
    val min: Double? = null,
    val max: Double? = null,
    val description: String = "",
)

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
    val description: String,
    val from: List<String>,
    val to: List<String>,
)

data class ClaimRelationshipDef(
    val description: String,
    val from: List<String>,
    val to: List<String> = emptyList(),
)

data class ClaimPredicateDef(
    val description: String,
    val subjectTypes: List<String>,
    val objectTypes: List<String>,
)
