package dev.fos.workbench.knowledge

import dev.fos.workbench.auth.UserRef
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.ontology.OntologyLoader
import dev.fos.workbench.web.NotFoundException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component

/** Neo4j 의 속성 맵을 API 표현으로 바꾼다. 쓰기와 조회 서비스가 함께 쓴다. */
@Component
class KnowledgeReader(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    private val users: UserRepository,
) {

    @Suppress("UNCHECKED_CAST")
    fun nodeProps(id: String): Map<String, Any?> =
        client.query("MATCH (n:Knowledge {id: \$id}) RETURN properties(n) AS n").bind(id).to("id")
            .fetch().one().map { it["n"] as Map<String, Any?> }.orElseThrow { NotFoundException(id) }

    /**
     * 관계의 저장된 속성에 관계 타입(`type`)을 더한 맵. 주장 관계도 찾는다.
     * `RevisionGuard.lockRelationship` 처럼 타입마다 id 인덱스로 찾되 잠그지 않는다. 없으면 404 다
     */
    @Suppress("UNCHECKED_CAST")
    fun relationshipProps(id: String): Map<String, Any?> {
        for (type in holder.current().allRelationshipTypes.sorted()) {
            val found = client.query("MATCH (:Knowledge)-[r:`$type` {id: \$id}]->(:Knowledge) RETURN properties(r) AS r")
                .bind(id).to("id").fetch().one().map { (it["r"] as Map<String, Any?>) - RevisionGuard.LOCK + ("type" to type) }
                .orElse(null)
            if (found != null) return found
        }
        throw NotFoundException(id)
    }

    fun node(id: String): NodeView = nodes(listOf(nodeProps(id))).single()

    fun nodes(rows: List<Map<String, Any?>>): List<NodeView> {
        val ontology = holder.current()
        val refs = users.findRefs(rows.flatMap { listOfNotNull(it["createdBy"], it["updatedBy"]) }.map { it as String })
        val claimNames = claimLabels(rows.filter { it["type"] == ClaimService.CLAIM }.map { it["id"] as String })
        return rows.map { toNodeView(ontology, it, refs, claimNames[it["id"]] ?: ontology.labelOf(it["type"] as String, it)) }
    }

    /** Claim id 마다 「주체 → 대상 관계」 이름. 쿼리 한 번으로 읽고 Claim 이 아닌 id 는 빠진다 */
    @Suppress("UNCHECKED_CAST")
    fun claimLabels(ids: Collection<String>): Map<String, String> {
        if (ids.isEmpty()) return emptyMap()
        val ontology = holder.current()
        return client.query(
            """
            MATCH (c:Knowledge:Claim) WHERE c.id IN ${'$'}ids
            OPTIONAL MATCH (c)-[:SUBJECT]->(s:Knowledge)
            OPTIONAL MATCH (c)-[:OBJECT]->(o:Knowledge)
            RETURN c.id AS id, c.predicate AS predicate, properties(s) AS s, properties(o) AS o
            """,
        ).bind(ids.toList()).to("ids").fetch().all().associate { r ->
            r["id"] as String to ontology.claimLabel(
                (r["s"] as Map<String, Any?>?)?.let { ontology.labelOf(it["type"] as String, it) },
                (r["o"] as Map<String, Any?>?)?.let { ontology.labelOf(it["type"] as String, it) },
                r["predicate"] as String,
            )
        }
    }

    /** Claim 이면 주체와 대상 이름으로 만든 이름, 아니면 labelProperty 값 */
    fun labelOf(p: Map<String, Any?>): String {
        val ontology = holder.current()
        val type = p["type"] as String
        return if (type == ClaimService.CLAIM) {
            val id = p["id"] as String
            claimLabels(listOf(id))[id] ?: ontology.labelOf(type, p)
        } else {
            ontology.labelOf(type, p)
        }
    }

    /** Claim 을 넘기지 않는다. Claim 이름은 `labelOf` 나 `claimLabels` 로 만든다 */
    fun ref(p: Map<String, Any?>): NodeRef = ref(holder.current(), p)

    private fun ref(ontology: Ontology, p: Map<String, Any?>): NodeRef =
        NodeRef(p["id"] as String, p["type"] as String, ontology.labelOf(p["type"] as String, p), p["archived"] == true)

    fun claim(id: String): ClaimView = claims(listOf(id)).firstOrNull() ?: throw NotFoundException(id)

    /** 순서를 지켜 ClaimView 를 만든다. 없는 ID 는 빠진다. */
    @Suppress("UNCHECKED_CAST")
    fun claims(ids: List<String>): List<ClaimView> {
        if (ids.isEmpty()) return emptyList()
        val ontology = holder.current()
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
            listOfNotNull(c["createdBy"], c["updatedBy"], c["reviewedBy"], c["contentUpdatedBy"]).map { it as String }
        }
        val refs = users.findRefs(userIds)
        val byId = rows.associateBy { (it["c"] as Map<String, Any?>)["id"] as String }
        return ids.mapNotNull { id ->
            val r = byId[id] ?: return@mapNotNull null
            val c = r["c"] as Map<String, Any?>
            ClaimView(
                node = toNodeView(
                    ontology, c, refs,
                    ontology.claimLabel(
                        (r["s"] as Map<String, Any?>?)?.let { ontology.labelOf(it["type"] as String, it) },
                        (r["o"] as Map<String, Any?>?)?.let { ontology.labelOf(it["type"] as String, it) },
                        c["predicate"] as String,
                    ),
                ),
                reviewedBy = (c["reviewedBy"] as String?)?.let { refs[it] },
                reviewedAt = c["reviewedAt"] as String?,
                reviewNote = c["reviewNote"] as String?,
                contentUpdatedBy = (c["contentUpdatedBy"] as String?)?.let { refs[it] },
                subject = (r["s"] as Map<String, Any?>?)?.let { ref(ontology, it) },
                `object` = (r["o"] as Map<String, Any?>?)?.let { ref(ontology, it) },
                documents = (r["docs"] as List<Map<String, Any?>>).map(::document),
            )
        }
    }

    /**
     * 노드 id 마다 개념으로 나가는 보관되지 않은 관계의 끝 개념. 주장 관계(Claim 의 SUBJECT, OBJECT 등)는 빼고, 그 밖의 관계 종류로는 좁히지 않는다.
     * 관계를 만든 순서이고, 같은 개념이 두 관계로 이어져 있으면 먼저 만든 관계 하나로 담는다. 개념이 없는 id 는 빠진다.
     */
    @Suppress("UNCHECKED_CAST")
    fun concepts(nodeIds: Collection<String>, limit: Int): Map<String, List<ConceptRef>> {
        if (nodeIds.isEmpty()) return emptyMap()
        val ontology = holder.current()
        return client.query(
            """
            UNWIND ${'$'}ids AS nodeId
            MATCH (:Knowledge {id: nodeId})-[r]->(c:Knowledge:Concept)
            WHERE r.archived = false AND c.archived = false AND NOT type(r) IN ${'$'}claimRelationships
            WITH nodeId, c, r ORDER BY r.createdAt, r.id
            WITH nodeId, c, collect(r)[0] AS first
            WITH nodeId, c, first ORDER BY first.createdAt, first.id
            RETURN nodeId, collect({c: properties(c), type: type(first)})[0..${'$'}limit] AS concepts
            """,
        ).bindAll(
            mapOf("ids" to nodeIds.toList(), "claimRelationships" to ontology.claimRelationships.keys.toList(), "limit" to limit.toLong()),
        ).fetch().all().associate { row ->
            row["nodeId"] as String to (row["concepts"] as List<Map<String, Any?>>).map {
                val c = it["c"] as Map<String, Any?>
                ConceptRef(c["id"] as String, ontology.labelOf(c["type"] as String, c), c["summary"] as String?, it["type"] as String)
            }
        }
    }

    /** 노드 id 마다 types 관계로 이어진 보관되지 않은 근거 문서. 관계를 만든 순서이고 같은 문서는 한 번만 담는다. 문서가 없는 id 는 빠진다 */
    @Suppress("UNCHECKED_CAST")
    fun evidenceDocuments(nodeIds: Collection<String>, types: List<String>, limit: Int): Map<String, List<DocumentRef>> {
        if (nodeIds.isEmpty() || types.isEmpty()) return emptyMap()
        return client.query(
            """
            UNWIND ${'$'}ids AS nodeId
            MATCH (:Knowledge {id: nodeId})-[r]->(d:Knowledge:Document)
            WHERE type(r) IN ${'$'}types AND r.archived = false AND d.archived = false
            WITH nodeId, d, r ORDER BY r.createdAt, r.id
            WITH nodeId, d, collect(r)[0] AS first
            WITH nodeId, d, first ORDER BY first.createdAt, first.id
            RETURN nodeId, collect(properties(d))[0..${'$'}limit] AS documents
            """,
        ).bindAll(mapOf("ids" to nodeIds.toList(), "types" to types, "limit" to limit.toLong())).fetch().all().associate { row ->
            row["nodeId"] as String to (row["documents"] as List<Map<String, Any?>>).map(::document)
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

    private fun toNodeView(
        ontology: Ontology,
        p: Map<String, Any?>,
        refs: Map<String, UserRef>,
        label: String,
    ): NodeView {
        val type = p["type"] as String
        // 정의에서 빠진 타입의 노드는 시스템 속성을 뺀 저장된 값을 모두 담는다(docs/data-schema.md 의 「정의에서 빠진 데이터」)
        val keys = ontology.nodeTypes[type]?.properties?.keys
            ?: p.keys.filterNot { it in OntologyLoader.RESERVED_PROPERTIES || it.startsWith("_") }
        return NodeView(
            id = p["id"] as String,
            type = type,
            label = label,
            properties = keys.filter { p[it] != null }.associateWith { p[it] },
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
