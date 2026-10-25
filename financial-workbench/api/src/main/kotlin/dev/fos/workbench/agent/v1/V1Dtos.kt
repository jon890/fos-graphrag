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

/** `publisher`, `documentType`, `publishedAt` 은 없으면 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Document(
    val id: String,
    val title: String,
    val url: String,
    val publisher: String?,
    val documentType: String?,
    val publishedAt: String?,
    val collectedAt: String?,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Concept(val id: String, val label: String, val summary: String?)

/** `subject`, `object` 는 보관됐거나 없으면 null 이다. `documents` 는 보관하지 않은 근거 문서다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Claim(
    val id: String,
    val label: String,
    val predicate: String,
    val predicateLabel: String,
    val reviewStatus: String?,
    val subject: V1NodeRef?,
    val `object`: V1NodeRef?,
    val description: String?,
    val evidenceText: String?,
    val validFrom: String?,
    val validTo: String?,
    val documents: List<V1Document>,
)

/** 검색 결과 한 항목. 속성은 담지 않는다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1NodeSummary(
    val id: String,
    val type: String,
    val typeLabel: String,
    val label: String,
    val reviewStatus: String?,
    val revision: Long,
    val updatedAt: String,
)

/** `createdBy`, `updatedBy` 는 표시 이름이다. 서버가 만든 항목이나 찾지 못한 사용자는 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1NodeHeader(
    val id: String,
    val type: String,
    val typeLabel: String,
    val label: String,
    val revision: Long,
    val createdAt: String,
    val createdBy: String?,
    val updatedAt: String,
    val updatedBy: String?,
)

/** 정의에서 빠진 타입의 노드는 `label` 이 키, `type` 이 null 이다. `valueLabel` 은 enum 일 때만 있다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Property(val key: String, val label: String, val type: String?, val value: Any?, val valueLabel: String?)

/** `direction` 은 이 노드가 시작이면 OUT, 끝이면 IN 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Relation(
    val relationshipId: String,
    val type: String,
    val label: String,
    val direction: String,
    val sentence: String,
    val other: V1NodeRef,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1NodeDetail(
    val node: V1NodeHeader,
    val properties: List<V1Property>,
    val relations: List<V1Relation>,
    val claim: V1Claim?,
    val claims: List<V1Claim>,
    val documents: List<V1Document>,
    val concepts: List<V1Concept>,
    val relationsTruncated: Boolean,
    val claimsTruncated: Boolean,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1GraphNode(val id: String, val type: String, val typeLabel: String, val label: String, val reviewStatus: String?)

/** 주장 관계(SUBJECT, OBJECT, SUPPORTED_BY) 선의 `sentence` 는 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1GraphEdge(val id: String, val type: String, val from: String, val to: String, val sentence: String?)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Graph(
    val center: V1NodeRef,
    val hops: Int,
    val nodes: List<V1GraphNode>,
    val edges: List<V1GraphEdge>,
    val truncated: Boolean,
)
