package dev.fos.workbench.graph

import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.config.params
import dev.fos.workbench.knowledge.ClaimService
import dev.fos.workbench.knowledge.KnowledgeReader
import dev.fos.workbench.knowledge.ReviewStatus
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

data class GraphNode(val id: String, val type: String, val label: String, val reviewStatus: String?, val predicate: String? = null)

data class GraphEdge(val id: String, val type: String, val source: String, val target: String)

data class GraphLimits(val maxHops: Int, val maxNodes: Int, val maxRelationships: Int)

data class GraphView(
    val centerId: String,
    val hops: Int,
    val nodes: List<GraphNode>,
    val edges: List<GraphEdge>,
    val truncated: Boolean,
    val limits: GraphLimits,
)

/** 선택한 노드 주변만 읽는다. 홉 수, 결과 개수, 실행 시간을 서버 설정으로 제한한다. */
@Service
class GraphService(
    private val client: Neo4jClient,
    private val ontology: Ontology,
    private val reader: KnowledgeReader,
    private val properties: WorkbenchProperties,
    transactionManager: PlatformTransactionManager,
) {
    private val limits = properties.graph
    private val readOnly = TransactionTemplate(transactionManager).apply {
        isReadOnly = true
        timeout = limits.timeout.toSeconds().toInt().coerceAtLeast(1)
    }

    fun neighborhood(id: String, hops: Int, types: List<String>?, reviewStatus: String?): GraphView {
        if (hops < 1 || hops > limits.maxHops) {
            throw ValidationFailedException(mapOf("hops" to "1 이상 ${limits.maxHops} 이하여야 합니다."))
        }
        types?.forEach { ontology.requireNodeType(it) }
        if (reviewStatus != null && ReviewStatus.entries.none { it.name == reviewStatus }) {
            throw ValidationFailedException(mapOf("reviewStatus" to "DRAFT, REVIEWED, REJECTED 가운데 하나여야 합니다."))
        }
        return readOnly.execute { load(id, hops, types?.takeIf { it.isNotEmpty() }, reviewStatus) }!!
    }

    @Suppress("UNCHECKED_CAST")
    private fun load(id: String, hops: Int, types: List<String>?, reviewStatus: String?): GraphView {
        val center = reader.nodeProps(id)
        if (center["archived"] == true) throw NotFoundException(id)
        val neighborLimit = limits.maxNodes - 1
        // hops 는 위에서 상한과 비교한 정수다. 가변 길이 패턴의 길이는 parameter 로 줄 수 없다
        val neighbors = client.query(
            """
            MATCH (c:Knowledge {id: ${'$'}id})
            MATCH p = (c)-[*1..$hops]-(m:Knowledge)
            WHERE m <> c
              AND all(r IN relationships(p) WHERE r.archived = false)
              // 필터는 중심을 뺀 경로 위 모든 노드에 적용한다. 필터에서 빠진 노드를 거쳐야만 닿는 노드는 보이지 않는다
              AND all(x IN nodes(p)[1..] WHERE x.archived = false
                  AND (${'$'}types IS NULL OR x.type IN ${'$'}types)
                  AND (${'$'}reviewStatus IS NULL OR x.type <> 'Claim' OR x.reviewStatus = ${'$'}reviewStatus))
            WITH m, min(length(p)) AS distance
            ORDER BY distance, m.id
            LIMIT ${'$'}limit
            RETURN properties(m) AS m
            """,
        ).bindAll(params("id" to id, "types" to types, "reviewStatus" to reviewStatus, "limit" to neighborLimit + 1L))
            .fetch().all().map { it["m"] as Map<String, Any?> }
        val nodeTruncated = neighbors.size > neighborLimit
        val neighborNodes = listOf(center) + neighbors.take(neighborLimit)
        // 모은 주장의 주체와 대상은 홉 수와 상관없이 함께 돌려준다. 이웃 쿼리의 경로 필터는 건드리지 않는다
        val claimIds = neighborNodes.filter { it["type"] == ClaimService.CLAIM }.map { it["id"] as String }
        var endpointTruncated = false
        var endpoints = emptyList<Map<String, Any?>>()
        if (claimIds.isNotEmpty()) {
            val room = limits.maxNodes - neighborNodes.size
            val found = client.query(
                """
                MATCH (c:Knowledge:Claim)-[r:SUBJECT|OBJECT]->(m:Knowledge)
                WHERE c.id IN ${'$'}claimIds AND NOT m.id IN ${'$'}ids
                  AND r.archived = false AND m.archived = false
                  AND (${'$'}types IS NULL OR m.type IN ${'$'}types)
                WITH DISTINCT m
                ORDER BY m.id
                LIMIT ${'$'}limit
                RETURN properties(m) AS m
                """,
            ).bindAll(
                params(
                    "claimIds" to claimIds, "ids" to neighborNodes.map { it["id"] as String },
                    "types" to types, "limit" to room + 1L,
                ),
            ).fetch().all().map { it["m"] as Map<String, Any?> }
            endpointTruncated = found.size > room
            endpoints = found.take(room)
        }
        val nodes = neighborNodes + endpoints
        val ids = nodes.map { it["id"] as String }
        val claimNames = reader.claimLabels(claimIds)
        val edges = client.query(
            """
            MATCH (a:Knowledge)-[r]->(b:Knowledge)
            WHERE a.id IN ${'$'}ids AND b.id IN ${'$'}ids AND r.archived = false
            RETURN r.id AS id, type(r) AS type, a.id AS source, b.id AS target
            ORDER BY r.id
            LIMIT ${'$'}limit
            """,
        ).bindAll(mapOf("ids" to ids, "limit" to limits.maxRelationships + 1L)).fetch().all()
            .map { GraphEdge(it["id"] as String, it["type"] as String, it["source"] as String, it["target"] as String) }
        return GraphView(
            centerId = id,
            hops = hops,
            nodes = nodes.map {
                val type = it["type"] as String
                val nodeId = it["id"] as String
                GraphNode(
                    nodeId, type, claimNames[nodeId] ?: ontology.labelOf(type, it), it["reviewStatus"] as String?,
                    if (type == ClaimService.CLAIM) it["predicate"] as String? else null,
                )
            },
            edges = edges.take(limits.maxRelationships),
            truncated = nodeTruncated || endpointTruncated || edges.size > limits.maxRelationships,
            limits = GraphLimits(limits.maxHops, limits.maxNodes, limits.maxRelationships),
        )
    }
}
