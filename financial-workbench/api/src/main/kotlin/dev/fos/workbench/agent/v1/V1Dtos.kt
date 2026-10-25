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

/** 이 단계에서 한 단계 아래(지금 항목 쪽, `childId`)로 가는 관계 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1TraceVia(val relationshipId: String, val relationshipType: String, val childId: String, val sentence: String)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1TraceClaim(val id: String, val label: String, val predicate: String, val reviewStatus: String?)

/** `label` 은 관계 종류의 표시 이름이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1TraceMissing(val relationshipType: String, val label: String, val candidates: List<V1NodeRef>)

/** 토큰 주인의 이해 표시 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Knowledge(val level: String, val note: String?, val updatedAt: String?)

/** 지금 항목(`depth = 0`)의 `via` 는 null 이다. `myKnowledge` 는 토큰 주인의 표시가 없으면 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1TraceStep(
    val node: V1NodeRef,
    val depth: Int,
    val via: V1TraceVia?,
    val status: String,
    val documents: List<V1Document>,
    val claims: List<V1TraceClaim>,
    val concepts: List<V1Concept>,
    val missing: List<V1TraceMissing>,
    val myKnowledge: V1Knowledge?,
)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1TraceDependent(val node: V1NodeRef, val relationshipType: String, val sentence: String)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Trace(
    val root: V1NodeRef,
    val steps: List<V1TraceStep>,
    val dependents: List<V1TraceDependent>,
    val truncated: Boolean,
    val dependentsTruncated: Boolean,
)

/** 값이 없는 속성은 null 이다. `marketLabel` 은 지금 온톨로지의 표시 이름이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1SecurityRef(
    val id: String,
    val type: String,
    val typeLabel: String,
    val label: String,
    val market: String?,
    val marketLabel: String?,
    val ticker: String?,
    val currency: String?,
)

/** `reason` 은 500자에서 자른다. `basedOn` 은 이 결정에 `BASED_ON` 으로 이어진 밸류에이션이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Decision(
    val node: V1NodeRef,
    val action: String?,
    val actionLabel: String?,
    val decidedAt: String?,
    val reason: String?,
    val basedOn: List<V1NodeRef>,
)

/** `assumptions` 는 500자에서 자른다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Scenario(val node: V1NodeRef, val kind: String?, val valuePerShare: Number?, val assumptions: String?)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1Valuation(
    val node: V1NodeRef,
    val asOf: String?,
    val currentPrice: Number?,
    val currency: String?,
    val method: String?,
    val scenarios: List<V1Scenario>,
    val scenariosTruncated: Boolean,
)

/** `issuer` 는 이 종목을 발행한 보관하지 않은 기업 가운데 먼저 이은 하나이고, 없으면 null 이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1SecurityMatch(
    val security: V1SecurityRef,
    val issuer: V1NodeRef?,
    val decisions: List<V1Decision>,
    val valuations: List<V1Valuation>,
    val decisionsTruncated: Boolean,
    val valuationsTruncated: Boolean,
)

/** `market` 은 받은 값을 대문자로 바꾼 것이고 없었으면 null 이다. `ticker` 는 앞뒤 공백을 지운 입력이다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1SecurityLookup(val market: String?, val ticker: String, val matches: List<V1SecurityMatch>, val matchesTruncated: Boolean)

/** 공부 항목을 근거 단계로 가지는 투자 결정. `depth` 는 결정에서 이 항목까지의 단계 수다 */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1StudyContext(val decision: V1NodeRef, val depth: Int)

@JsonInclude(JsonInclude.Include.ALWAYS)
data class V1StudyItem(
    val node: V1NodeRef,
    val level: String,
    val note: String?,
    val updatedAt: String,
    val contexts: List<V1StudyContext>,
    val documents: List<V1Document>,
    val concepts: List<V1Concept>,
)
