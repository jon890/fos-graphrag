package dev.fos.workbench.knowledge

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.config.params
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class NodeQueryService(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    private val reader: KnowledgeReader,
    private val relationships: RelationshipService,
    properties: WorkbenchProperties,
) {
    private val limits = properties.detail

    @Transactional(readOnly = true)
    fun detail(id: String): NodeDetail {
        val ontology = holder.current()
        val node = reader.node(id)
        val relationshipRows = client.query(
            """
            MATCH (a:Knowledge)-[r]->(b:Knowledge)
            WHERE (a.id = ${'$'}id OR b.id = ${'$'}id) AND NOT type(r) IN ${'$'}claimRelationships
            RETURN type(r) AS type, properties(r) AS r, properties(a) AS a, properties(b) AS b
            ORDER BY r.createdAt, r.id
            LIMIT ${'$'}limit
            """,
        ).bindAll(mapOf("id" to id, "claimRelationships" to ontology.claimRelationships.keys.toList(), "limit" to limits.maxRelationships + 1L))
            .fetch().all().toList()
        val claimIds = client.query(
            """
            MATCH (c:Knowledge:Claim)-[l:SUBJECT|OBJECT|SUPPORTED_BY]->(:Knowledge {id: ${'$'}id})
            WHERE c.archived = false
            WITH DISTINCT c
            RETURN c.id AS id ORDER BY c.createdAt, c.id
            LIMIT ${'$'}limit
            """,
        ).bindAll(mapOf("id" to id, "limit" to limits.maxClaims + 1L)).fetch().all().map { it["id"] as String }
        return NodeDetail(
            node = node,
            claim = if (node.type == ClaimService.CLAIM) reader.claim(id) else null,
            relationships = relationships.views(relationshipRows.take(limits.maxRelationships)),
            claims = reader.claims(claimIds.take(limits.maxClaims)),
            concepts = reader.concepts(listOf(id), MAX_CONCEPTS)[id].orEmpty(),
            relationshipsTruncated = relationshipRows.size > limits.maxRelationships,
            claimsTruncated = claimIds.size > limits.maxClaims,
            limits = DetailLimits(limits.maxRelationships, limits.maxClaims),
        )
    }

    @Transactional(readOnly = true)
    fun counts(): NodeCounts {
        val ontology = holder.current()
        val found = client.query("MATCH (n:Knowledge) WHERE n.archived = false AND n.type IS NOT NULL RETURN n.type AS type, count(n) AS count")
            .fetch().all().associate { it["type"] as String to (it["count"] as Number).toLong() }
        return NodeCounts(ontology.nodeTypes.keys.associateWithTo(LinkedHashMap()) { found[it] ?: 0L })
    }

    /** label, ticker, 타입의 searchProperties 를 소문자로 이은 searchText 에서 부분 일치로 찾는다. 보관된 노드는 기본으로 뺀다. sort 는 label(기본)과 recent(만든 시각 역순)다. */
    @Transactional(readOnly = true)
    @Suppress("UNCHECKED_CAST")
    fun search(q: String?, types: List<String>?, reviewStatus: String?, includeArchived: Boolean, sort: String?, page: PageQuery): Page<NodeView> {
        Ontology.requireTypeFilter(types)
        val orderBy = when (sort) {
            null, "label" -> "n.searchText, n.id"
            "recent" -> "n.createdAt DESC, n.id"
            else -> throw ValidationFailedException(mapOf("sort" to "label, recent 가운데 하나여야 합니다."))
        }
        if ((q?.trim()?.length ?: 0) > Limits.MAX_QUERY_LENGTH) {
            throw ValidationFailedException(mapOf("q" to "검색어는 ${Limits.MAX_QUERY_LENGTH}자 이하여야 합니다."))
        }
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
        val rows = client.query("MATCH (n:Knowledge) $where RETURN properties(n) AS n ORDER BY $orderBy SKIP ${'$'}skip LIMIT ${'$'}limit")
            .bindAll(params).fetch().all().map { it["n"] as Map<String, Any?> }
        return page.of(reader.nodes(rows), total)
    }

    /**
     * 검토 대기 목록은 reviewStatus=DRAFT 다. 오래된 것부터 돌려준다.
     * scope 는 요청한 사람 기준이다. reviewable 은 작성자도 마지막 내용 수정자도 아닌 것(자기 검토 금지와 같은 규칙),
     * mine 은 둘 중 하나인 것이다.
     */
    @Transactional(readOnly = true)
    fun claims(reviewStatus: String?, scope: String?, userId: String, includeArchived: Boolean, page: PageQuery): Page<ClaimView> {
        val params = params(
            "reviewStatus" to requireReviewStatus(reviewStatus),
            "scope" to requireScope(scope),
            "userId" to userId,
            "includeArchived" to includeArchived,
            "skip" to page.skip,
            "limit" to page.size,
        )
        val where = """
            WHERE (${'$'}reviewStatus IS NULL OR c.reviewStatus = ${'$'}reviewStatus)
              AND (${'$'}includeArchived OR c.archived = false)
              AND (${'$'}scope IS NULL
                   OR (${'$'}scope = 'reviewable' AND coalesce(c.createdBy, '') <> ${'$'}userId AND coalesce(c.contentUpdatedBy, c.createdBy) <> ${'$'}userId)
                   OR (${'$'}scope = 'mine' AND (c.createdBy = ${'$'}userId OR c.contentUpdatedBy = ${'$'}userId)))
        """
        val total = client.query("MATCH (c:Knowledge:Claim) $where RETURN count(c) AS total").bindAll(params)
            .fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        val ids = client.query("MATCH (c:Knowledge:Claim) $where RETURN c.id AS id ORDER BY c.createdAt, c.id SKIP ${'$'}skip LIMIT ${'$'}limit")
            .bindAll(params).fetch().all().map { it["id"] as String }
        return page.of(reader.claims(ids), total)
    }

    companion object {
        /** 노드 상세의 concepts 상한(docs/api-contract.md 「상한」) */
        const val MAX_CONCEPTS = 20
    }

    private fun requireReviewStatus(value: String?): String? {
        if (value.isNullOrBlank()) return null
        if (ReviewStatus.entries.none { it.name == value }) {
            throw ValidationFailedException(mapOf("reviewStatus" to "DRAFT, REVIEWED, REJECTED 가운데 하나여야 합니다."))
        }
        return value
    }

    private fun requireScope(value: String?): String? {
        if (value.isNullOrBlank()) return null
        if (value != "reviewable" && value != "mine") {
            throw ValidationFailedException(mapOf("scope" to "reviewable, mine 가운데 하나여야 합니다."))
        }
        return value
    }
}
