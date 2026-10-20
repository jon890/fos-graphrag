package dev.fos.workbench.knowledge

import dev.fos.workbench.ontology.Ontology
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
}
