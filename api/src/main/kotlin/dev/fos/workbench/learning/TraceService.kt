package dev.fos.workbench.learning

import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.knowledge.KnowledgeReader
import dev.fos.workbench.knowledge.ReviewStatus
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.web.NotFoundException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

/**
 * 지금 항목에서 들어오는 일반 관계를 거꾸로 따라 올라가 근거 단계를 모은다(docs/adr/011-learning-marks-and-trace.md).
 * 깊이마다 쿼리 하나로 다음 단계를 모으고, 같은 노드에 여러 길로 닿으면 처음 찾은 길만 남긴다.
 * 처음 찾은 길은 얕은 깊이, 같은 깊이면 아래 단계의 순서와 관계의 createdAt, id 순서다. 요청마다 같은 결과가 나와야 한다.
 */
@Service
class TraceService(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    private val reader: KnowledgeReader,
    properties: WorkbenchProperties,
    transactionManager: PlatformTransactionManager,
) {
    private val readOnly = TransactionTemplate(transactionManager).apply {
        isReadOnly = true
        timeout = properties.graph.timeout.toSeconds().toInt().coerceAtLeast(1)
    }

    /** 주변 그래프와 같은 시간 제한(`workbench.graph.timeout`)의 읽기 트랜잭션. 안에서 부른 [nodeSet] 은 이 트랜잭션에 합류한다 */
    fun <T : Any> read(block: () -> T): T = readOnly.execute { block() }

    fun trace(id: String, userId: String): TraceView = read { load(id, userId) }

    /** [trace] 와 같은 규칙으로 모은 단계 id 집합과 잘림 여부. 내 능력 범위가 쓴다 */
    fun nodeSet(id: String): Pair<Set<String>, Boolean> = read {
        val collected = collect(id, LearningRules.traversableTypes(holder.current()))
        collected.steps.map { it.id }.toSet() to collected.truncated
    }

    private class Found(
        val props: Map<String, Any?>,
        val depth: Int,
        val childId: String?,
        val relationshipId: String?,
        val relationshipType: String?,
    ) {
        val id: String get() = props["id"] as String
        val type: String get() = props["type"] as String
        val createdAt: String get() = props["createdAt"] as String
    }

    private class Collected(val steps: List<Found>, val truncated: Boolean)

    private class StepClaims(val claims: List<Map<String, Any?>>, val reviewed: Boolean, val draft: Boolean)

    private val byCreated = compareBy<Found>({ it.createdAt }, { it.id })

    private fun load(id: String, userId: String): TraceView {
        val ontology = holder.current()
        val traversable = LearningRules.traversableTypes(ontology)
        val collected = collect(id, traversable)
        val found = collected.steps
        val ids = found.map { it.id }
        val views = reader.nodes(found.map { it.props }).associateBy { it.id }
        val documents = reader.evidenceDocuments(ids, LearningRules.evidenceTypes(ontology), MAX_STEP_DOCUMENTS)
        val concepts = reader.concepts(ids, MAX_STEP_CONCEPTS)
        val claims = claims(ids)
        val claimNames = reader.claimLabels(claims.values.flatMap { c -> c.claims.map { it["id"] as String } })
        val marks = marks(userId, ids)
        val missing = missing(ontology, found, traversable)
        val steps = found.sortedWith(compareBy<Found> { it.depth }.then(byCreated)).map { f ->
            val stepDocuments = documents[f.id].orEmpty()
            val stepClaims = claims[f.id]
            val status = when {
                stepDocuments.isNotEmpty() || stepClaims?.reviewed == true -> SUPPORTED
                stepClaims?.draft == true -> PARTIAL
                else -> MISSING
            }
            TraceStep(
                node = views.getValue(f.id),
                depth = f.depth,
                childId = f.childId,
                relationshipId = f.relationshipId,
                relationshipType = f.relationshipType,
                status = status,
                documents = stepDocuments,
                claims = stepClaims?.claims.orEmpty().map {
                    val claimId = it["id"] as String
                    TraceClaim(claimId, claimNames[claimId] ?: it["predicate"] as String, it["predicate"] as String, it["reviewStatus"] as String?)
                },
                concepts = concepts[f.id].orEmpty(),
                missing = missing[f.id].orEmpty(),
                knowledge = marks[f.id],
            )
        }
        val (dependents, dependentsTruncated) = dependents(id, traversable)
        return TraceView(
            rootId = id,
            steps = steps,
            dependents = dependents,
            truncated = collected.truncated,
            dependentsTruncated = dependentsTruncated,
            limits = TraceLimits(LearningRules.MAX_DEPTH, MAX_STEPS, MAX_DEPENDENTS, MAX_CANDIDATES),
        )
    }

    /**
     * 너비 우선으로 [LearningRules.MAX_DEPTH] 까지, 지금 항목을 포함해 [MAX_STEPS] 개까지 모은다.
     * 한 깊이의 새 노드가 남은 자리보다 많으면 createdAt, id 순서로 앞에서부터 남긴다.
     * 마지막 깊이 다음에 위 단계가 더 있는지 한 번 더 읽어 잘림을 판정한다.
     */
    private fun collect(id: String, traversable: List<String>): Collected {
        val root = reader.nodeProps(id)
        if (root["archived"] == true) throw NotFoundException(id)
        val steps = mutableListOf(Found(root, 0, null, null, null))
        val seen = mutableSetOf(id)
        var frontier = listOf(id)
        var truncated = false
        for (depth in 1..LearningRules.MAX_DEPTH + 1) {
            val parents = parents(frontier, seen, traversable, depth)
            if (parents.isEmpty()) break
            val room = MAX_STEPS - steps.size
            if (depth > LearningRules.MAX_DEPTH || room <= 0) {
                truncated = true
                break
            }
            val kept = if (parents.size > room) {
                truncated = true
                parents.sortedWith(byCreated).take(room)
            } else {
                parents
            }
            steps += kept
            seen += kept.map { it.id }
            frontier = kept.map { it.id }
            if (truncated) break
        }
        return Collected(steps, truncated)
    }

    /** frontier 의 위 단계. 아래 단계의 frontier 순서, 관계의 createdAt, id 순서로 놓고 노드마다 첫 행만 남긴다 */
    @Suppress("UNCHECKED_CAST")
    private fun parents(frontier: List<String>, seen: Set<String>, traversable: List<String>, depth: Int): List<Found> {
        if (frontier.isEmpty() || traversable.isEmpty()) return emptyList()
        val order = frontier.withIndex().associate { it.value to it.index }
        val rows = client.query(
            """
            MATCH (p:Knowledge)-[r]->(c:Knowledge)
            WHERE c.id IN ${'$'}frontier AND type(r) IN ${'$'}traversable AND r.archived = false
              AND p.archived = false AND NOT p.id IN ${'$'}seen
            RETURN properties(p) AS p, r.id AS relationshipId, type(r) AS relationshipType, r.createdAt AS createdAt, c.id AS childId
            """,
        ).bindAll(mapOf("frontier" to frontier, "traversable" to traversable, "seen" to seen.toList())).fetch().all()
        return rows
            .sortedWith(
                compareBy<Map<String, Any?>>(
                    { order.getValue(it["childId"] as String) },
                    { it["createdAt"] as String? },
                    { it["relationshipId"] as String },
                ),
            )
            .distinctBy { (it["p"] as Map<String, Any?>)["id"] }
            .map {
                Found(it["p"] as Map<String, Any?>, depth, it["childId"] as String, it["relationshipId"] as String, it["relationshipType"] as String)
            }
    }

    /** 단계마다 그 단계가 주체나 대상인 보관되지 않은 주장. 만든 순서로 [MAX_STEP_CLAIMS] 개까지 담고, 검토 상태는 잘리기 전 전체로 본다 */
    @Suppress("UNCHECKED_CAST")
    private fun claims(ids: List<String>): Map<String, StepClaims> =
        client.query(
            """
            MATCH (c:Knowledge:Claim)-[:SUBJECT|OBJECT]->(n:Knowledge)
            WHERE n.id IN ${'$'}ids AND c.archived = false
            WITH DISTINCT n.id AS nodeId, c
            ORDER BY c.createdAt, c.id
            WITH nodeId, collect({id: c.id, predicate: c.predicate, reviewStatus: c.reviewStatus}) AS claims
            RETURN nodeId, claims[0..${'$'}limit] AS claims,
                   any(x IN claims WHERE x.reviewStatus = ${'$'}reviewed) AS reviewed,
                   any(x IN claims WHERE x.reviewStatus = ${'$'}draft) AS draft
            """,
        ).bindAll(
            mapOf(
                "ids" to ids, "limit" to MAX_STEP_CLAIMS.toLong(),
                "reviewed" to ReviewStatus.REVIEWED.name, "draft" to ReviewStatus.DRAFT.name,
            ),
        ).fetch().all().associate {
            it["nodeId"] as String to StepClaims(it["claims"] as List<Map<String, Any?>>, it["reviewed"] == true, it["draft"] == true)
        }

    /** 요청한 사람 본인의 표시만 읽는다 */
    private fun marks(userId: String, ids: List<String>): Map<String, KnowledgeMark> =
        client.query(
            """
            MATCH (:User {id: ${'$'}userId})-[k:KNOWS]->(n:Knowledge) WHERE n.id IN ${'$'}ids
            RETURN n.id AS nodeId, k.level AS level, k.note AS note, k.updatedAt AS updatedAt
            """,
        ).bindAll(mapOf("userId" to userId, "ids" to ids)).fetch().all().associate {
            val nodeId = it["nodeId"] as String
            nodeId to KnowledgeMark(nodeId, it["level"] as String?, it["note"] as String?, it["updatedAt"] as String?)
        }

    /**
     * 단계 타입을 끝 타입으로 가지는 따라가는 관계 종류 가운데, 보관되지 않은 노드에서 들어오는 보관되지 않은 관계가 없는 것.
     * 후보는 그 종류의 시작 타입인 노드 가운데 따라가는 관계(방향 무시)로 [CANDIDATE_HOPS] 홉 안에 닿는 것을 가까운 순서, 늦게 만든 순서로 담는다.
     */
    @Suppress("UNCHECKED_CAST")
    private fun missing(ontology: Ontology, found: List<Found>, traversable: List<String>): Map<String, List<TraceMissing>> {
        val pairs = found.flatMap { f ->
            traversable.filter { f.type in ontology.relationshipTypes.getValue(it).to }.map { mapOf("nodeId" to f.id, "type" to it) }
        }
        if (pairs.isEmpty()) return emptyMap()
        val absent = client.query(
            """
            UNWIND ${'$'}pairs AS pair
            MATCH (n:Knowledge {id: pair.nodeId})
            WHERE NOT EXISTS {
              MATCH (s:Knowledge)-[r]->(n) WHERE type(r) = pair.type AND r.archived = false AND s.archived = false
            }
            RETURN pair.nodeId AS nodeId, pair.type AS type
            """,
        ).bindAll(mapOf("pairs" to pairs)).fetch().all().map { it["nodeId"] as String to it["type"] as String }.toSet()
        if (absent.isEmpty()) return emptyMap()
        val items = pairs.filter { (it["nodeId"] to it["type"]) in absent }.map {
            mapOf("nodeId" to it["nodeId"], "type" to it["type"], "fromTypes" to ontology.relationshipTypes.getValue(it["type"] as String).from)
        }
        // 가변 길이 패턴의 길이는 parameter 가 될 수 없어 상수를 문자열에 넣는다
        val candidates = client.query(
            """
            UNWIND ${'$'}items AS item
            MATCH (n:Knowledge {id: item.nodeId})
            MATCH p = (n)-[*1..$CANDIDATE_HOPS]-(m:Knowledge)
            WHERE m <> n AND m.type IN item.fromTypes
              AND all(r IN relationships(p) WHERE type(r) IN ${'$'}types AND r.archived = false)
              AND all(x IN nodes(p) WHERE x:Knowledge AND x.archived = false)
            WITH item, m, min(length(p)) AS distance
            ORDER BY distance, m.createdAt DESC, m.id
            RETURN item.nodeId AS nodeId, item.type AS type, collect(properties(m))[0..${'$'}limit] AS candidates
            """,
        ).bindAll(mapOf("items" to items, "types" to traversable, "limit" to MAX_CANDIDATES.toLong())).fetch().all().associate {
            (it["nodeId"] as String to it["type"] as String) to (it["candidates"] as List<Map<String, Any?>>).map(reader::ref)
        }
        return items.groupBy({ it["nodeId"] as String }) {
            val type = it["type"] as String
            TraceMissing(type, candidates[it["nodeId"] as String to type].orEmpty())
        }
    }

    /** 지금 항목에서 나가는 따라가는 관계의 끝. 만든 순서로 [MAX_DEPENDENTS] 개까지 */
    @Suppress("UNCHECKED_CAST")
    private fun dependents(id: String, traversable: List<String>): Pair<List<TraceDependent>, Boolean> {
        if (traversable.isEmpty()) return emptyList<TraceDependent>() to false
        val rows = client.query(
            """
            MATCH (:Knowledge {id: ${'$'}id})-[r]->(m:Knowledge)
            WHERE type(r) IN ${'$'}types AND r.archived = false AND m.archived = false
            RETURN properties(m) AS m, r.id AS relationshipId, type(r) AS relationshipType
            ORDER BY r.createdAt, r.id
            LIMIT ${'$'}limit
            """,
        ).bindAll(mapOf("id" to id, "types" to traversable, "limit" to MAX_DEPENDENTS + 1L)).fetch().all().toList()
        val dependents = rows.take(MAX_DEPENDENTS).map {
            TraceDependent(reader.ref(it["m"] as Map<String, Any?>), it["relationshipId"] as String, it["relationshipType"] as String)
        }
        return dependents to (rows.size > MAX_DEPENDENTS)
    }

    companion object {
        const val MAX_STEPS = 60
        const val MAX_DEPENDENTS = 50
        const val MAX_CANDIDATES = 5
        const val MAX_STEP_DOCUMENTS = 20
        const val MAX_STEP_CLAIMS = 20
        const val MAX_STEP_CONCEPTS = 20
        const val CANDIDATE_HOPS = 3
        const val SUPPORTED = "SUPPORTED"
        const val PARTIAL = "PARTIAL"
        const val MISSING = "MISSING"
    }
}
