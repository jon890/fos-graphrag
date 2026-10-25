package dev.fos.workbench.agent.v1

import com.fasterxml.jackson.annotation.JsonInclude

// 에이전트 API(/api/v1)의 응답. 필드 이름과 모양은 docs/api-contract.md 「에이전트 API(`/api/v1`)」 와 같다.
// 화면용 응답(NodeView 등)과 따로 유지한다. 값이 null 인 필드도 키를 담는다.

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1NodeRef(val id: String, val type: String, val typeLabel: String, val label: String)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Me(val user: V1MeUser, val token: V1MeToken, val rateLimitPerMinute: Int)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1MeUser(val id: String, val displayName: String, val role: String)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1MeToken(val id: String, val name: String, val last4: String)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Ontology(
    val version: Int,
    val nodeTypes: List<V1NodeType>,
    val relationshipTypes: List<V1RelationshipType>,
    val claimPredicates: List<V1ClaimPredicate>,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1NodeType(
    val key: String,
    val label: String,
    val description: String,
    val labelProperty: String,
    val properties: List<V1PropertyDef>,
)

/** `values` 는 `enum` 일 때만 있고 그 밖에는 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1PropertyDef(
    val key: String,
    val label: String,
    val type: String,
    val required: Boolean,
    val description: String,
    val values: List<V1EnumValue>?,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1EnumValue(val value: String, val label: String)

/** `sentence` 는 문장 틀이 없으면 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1RelationshipType(
    val key: String,
    val label: String,
    val description: String,
    val from: List<String>,
    val to: List<String>,
    val sentence: String?,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1ClaimPredicate(
    val key: String,
    val label: String,
    val description: String,
    val subjectTypes: List<String>,
    val objectTypes: List<String>,
    val sentence: String?,
)
