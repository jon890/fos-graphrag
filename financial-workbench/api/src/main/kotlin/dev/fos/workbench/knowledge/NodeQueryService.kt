package dev.fos.workbench.knowledge

import dev.fos.workbench.config.params
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class NodeQueryService(
    private val client: Neo4jClient,
    private val ontology: Ontology,
    private val reader: KnowledgeReader,
    private val relationships: RelationshipService,
) {

    @Transactional(readOnly = true)
    fun detail(id: String): NodeDetail {
        val node = reader.node(id)
        val relationshipRows = client.query(
            """
            MATCH (a:Knowledge)-[r]->(b:Knowledge)
            WHERE (a.id = ${'$'}id OR b.id = ${'$'}id) AND type(r) IN ${'$'}types
            RETURN type(r) AS type, properties(r) AS r, properties(a) AS a, properties(b) AS b
            ORDER BY r.createdAt
            """,
        ).bindAll(mapOf("id" to id, "types" to ontology.relationshipTypes.keys.toList())).fetch().all().toList()
        val claimIds = client.query(
            """
            MATCH (c:Knowledge:Claim)-[l:SUBJECT|OBJECT|SUPPORTED_BY]->(:Knowledge {id: ${'$'}id})
            WHERE c.archived = false
            WITH DISTINCT c
            RETURN c.id AS id ORDER BY c.createdAt
            """,
        ).bind(id).to("id").fetch().all().map { it["id"] as String }
        return NodeDetail(
            node = node,
            claim = if (node.type == ClaimService.CLAIM) reader.claim(id) else null,
            relationships = relationships.views(relationshipRows),
            claims = reader.claims(claimIds),
        )
    }

    /** label 과 ticker 를 소문자로 이은 searchText 에서 부분 일치로 찾는다. 보관된 노드는 기본으로 뺀다. */
    @Transactional(readOnly = true)
    @Suppress("UNCHECKED_CAST")
    fun search(q: String?, types: List<String>?, reviewStatus: String?, includeArchived: Boolean, page: PageQuery): Page<NodeView> {
        types?.forEach { ontology.requireNodeType(it) }
        val params = params(
            "q" to q?.trim()?.lowercase()?.takeIf { it.isNotEmpty() },
            "types" to types?.takeIf { it.isNotEmpty() },
            "reviewStatus" to requireReviewStatus(reviewStatus),
            "includeArchived" to includeArchived,
            "skip" to page.skip,
            "limit" to page.size,
        )
        val where = """
            WHERE (${'$'}types IS NULL OR n.type IN ${'$'}types)
              AND (${'$'}includeArchived OR n.archived = false)
              AND (${'$'}q IS NULL OR n.searchText CONTAINS ${'$'}q)
              AND (${'$'}reviewStatus IS NULL OR n.reviewStatus = ${'$'}reviewStatus)
        """
        val total = client.query("MATCH (n:Knowledge) $where RETURN count(n) AS total").bindAll(params)
            .fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        val rows = client.query("MATCH (n:Knowledge) $where RETURN properties(n) AS n ORDER BY n.searchText, n.id SKIP ${'$'}skip LIMIT ${'$'}limit")
            .bindAll(params).fetch().all().map { it["n"] as Map<String, Any?> }
        return page.of(reader.nodes(rows), total)
    }

    /** 검토 대기 목록은 reviewStatus=DRAFT 다. 오래된 것부터 돌려준다. */
    @Transactional(readOnly = true)
    fun claims(reviewStatus: String?, includeArchived: Boolean, page: PageQuery): Page<ClaimView> {
        val params = params(
            "reviewStatus" to requireReviewStatus(reviewStatus),
            "includeArchived" to includeArchived,
            "skip" to page.skip,
            "limit" to page.size,
        )
        val where = "WHERE (${'$'}reviewStatus IS NULL OR c.reviewStatus = ${'$'}reviewStatus) AND (${'$'}includeArchived OR c.archived = false)"
        val total = client.query("MATCH (c:Knowledge:Claim) $where RETURN count(c) AS total").bindAll(params)
            .fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        val ids = client.query("MATCH (c:Knowledge:Claim) $where RETURN c.id AS id ORDER BY c.createdAt, c.id SKIP ${'$'}skip LIMIT ${'$'}limit")
            .bindAll(params).fetch().all().map { it["id"] as String }
        return page.of(reader.claims(ids), total)
    }

    private fun requireReviewStatus(value: String?): String? {
        if (value.isNullOrBlank()) return null
        if (ReviewStatus.entries.none { it.name == value }) {
            throw ValidationFailedException(mapOf("reviewStatus" to "DRAFT, REVIEWED, REJECTED 가운데 하나여야 합니다."))
        }
        return value
    }
}
