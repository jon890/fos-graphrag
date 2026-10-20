package dev.fos.workbench.knowledge

import dev.fos.workbench.auth.UserRef
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.web.NotFoundException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component

/** Neo4j 의 속성 맵을 API 표현으로 바꾼다. 쓰기와 조회 서비스가 함께 쓴다. */
@Component
class KnowledgeReader(
    private val client: Neo4jClient,
    private val ontology: Ontology,
    private val users: UserRepository,
) {

    @Suppress("UNCHECKED_CAST")
    fun nodeProps(id: String): Map<String, Any?> =
        client.query("MATCH (n:Knowledge {id: \$id}) RETURN properties(n) AS n").bind(id).to("id")
            .fetch().one().map { it["n"] as Map<String, Any?> }.orElseThrow { NotFoundException(id) }

    fun node(id: String): NodeView = nodes(listOf(nodeProps(id))).single()

    fun nodes(rows: List<Map<String, Any?>>): List<NodeView> {
        val refs = users.findRefs(rows.flatMap { listOfNotNull(it["createdBy"], it["updatedBy"]) }.map { it as String })
        return rows.map { toNodeView(it, refs) }
    }

    fun ref(p: Map<String, Any?>): NodeRef =
        NodeRef(p["id"] as String, p["type"] as String, ontology.labelOf(p["type"] as String, p), p["archived"] == true)

    fun claim(id: String): ClaimView = claims(listOf(id)).firstOrNull() ?: throw NotFoundException(id)

    /** 순서를 지켜 ClaimView 를 만든다. 없는 ID 는 빠진다. */
    @Suppress("UNCHECKED_CAST")
    fun claims(ids: List<String>): List<ClaimView> {
        if (ids.isEmpty()) return emptyList()
        val rows = client.query(
            """
            MATCH (c:Knowledge:Claim) WHERE c.id IN ${'$'}ids
            OPTIONAL MATCH (c)-[:SUBJECT]->(s:Knowledge)
            OPTIONAL MATCH (c)-[:OBJECT]->(o:Knowledge)
            OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(d:Knowledge)
            WITH c, s, o, d ORDER BY d.title
            RETURN properties(c) AS c, properties(s) AS s, properties(o) AS o, collect(properties(d)) AS docs
            """,
        ).bind(ids).to("ids").fetch().all().toList()
        val userIds = rows.flatMap { r ->
            val c = r["c"] as Map<String, Any?>
            listOfNotNull(c["createdBy"], c["updatedBy"], c["reviewedBy"]).map { it as String }
        }
        val refs = users.findRefs(userIds)
        val byId = rows.associateBy { (it["c"] as Map<String, Any?>)["id"] as String }
        return ids.mapNotNull { id ->
            val r = byId[id] ?: return@mapNotNull null
            val c = r["c"] as Map<String, Any?>
            ClaimView(
                node = toNodeView(c, refs),
                reviewedBy = (c["reviewedBy"] as String?)?.let { refs[it] },
                reviewedAt = c["reviewedAt"] as String?,
                reviewNote = c["reviewNote"] as String?,
                subject = (r["s"] as Map<String, Any?>?)?.let(::ref),
                `object` = (r["o"] as Map<String, Any?>?)?.let(::ref),
                documents = (r["docs"] as List<Map<String, Any?>>).map(::document),
            )
        }
    }

    private fun document(d: Map<String, Any?>) = DocumentRef(
        id = d["id"] as String,
        title = d["title"] as String,
        url = d["url"] as String,
        publisher = d["publisher"] as String?,
        documentType = d["documentType"] as String?,
        publishedAt = d["publishedAt"] as String?,
        collectedAt = d["collectedAt"] as String?,
        archived = d["archived"] == true,
    )

    private fun toNodeView(p: Map<String, Any?>, refs: Map<String, UserRef>): NodeView {
        val type = p["type"] as String
        val def = ontology.requireNodeType(type)
        return NodeView(
            id = p["id"] as String,
            type = type,
            label = ontology.labelOf(type, p),
            properties = def.properties.keys.filter { p[it] != null }.associateWith { p[it] },
            revision = (p["revision"] as Number).toLong(),
            archived = p["archived"] == true,
            archivedAt = p["archivedAt"] as String?,
            createdAt = p["createdAt"] as String,
            createdBy = refs[p["createdBy"]],
            updatedAt = p["updatedAt"] as String,
            updatedBy = refs[p["updatedBy"]],
            reviewStatus = p["reviewStatus"] as String?,
        )
    }
}
