package dev.fos.workbench.agent.v1

import dev.fos.workbench.agent.v1.V1Mapper.Companion.MAX_CLAIMS
import dev.fos.workbench.agent.v1.V1Mapper.Companion.MAX_CONCEPTS
import dev.fos.workbench.agent.v1.V1Mapper.Companion.MAX_DOCUMENTS
import dev.fos.workbench.agent.v1.V1Mapper.Companion.MAX_RELATIONS
import dev.fos.workbench.graph.GraphService
import dev.fos.workbench.knowledge.KnowledgeReader
import dev.fos.workbench.knowledge.NodeQueryService
import dev.fos.workbench.learning.KnowledgeMarkService
import dev.fos.workbench.learning.LearningRules
import dev.fos.workbench.learning.TraceService
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.Page
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * 화면용 조회 서비스의 결과를 v1 표현으로 옮긴다. v1 전용 Cypher 를 쓰지 않고, 넉넉히 읽은 결과에서 보관한 것을 빼고 v1 상한으로 자른다.
 * 클래스 단위 트랜잭션을 두지 않는다. 주변 그래프의 시간 제한은 GraphService 가 스스로 연 트랜잭션에만 걸려,
 * 바깥 트랜잭션에 합류하면 제한이 사라진다. 근거 따라가기도 TraceService 가 스스로 연 시간 제한 트랜잭션에서 돈다.
 */
@Service
class AgentQueryService(
    private val queries: NodeQueryService,
    private val reader: KnowledgeReader,
    private val graph: GraphService,
    private val traces: TraceService,
    private val marks: KnowledgeMarkService,
    private val holder: OntologyHolder,
    private val mapper: V1Mapper,
) {

    /** 보관하지 않은 노드만 이름 순서로 찾는다. 검색어와 타입 형식 검사는 NodeQueryService 가 한다 */
    fun search(q: String?, types: List<String>?, page: Int?, size: Int?): Page<V1NodeSummary> {
        val found = queries.search(q, types, null, false, null, mapper.page(page, size))
        return Page(found.items.map(mapper::summary), found.page, found.size, found.totalItems, found.totalPages)
    }

    /** 보관한 노드는 404 다. 상세와 근거 문서를 한 트랜잭션에서 읽는다 */
    @Transactional(readOnly = true)
    fun detail(id: String): V1NodeDetail {
        val detail = queries.detail(id)
        val node = detail.node
        if (node.archived) throw NotFoundException(id)
        // 지금 온톨로지에 없는 관계 종류, 보관한 관계, 상대 끝이 보관된 관계를 뺀 뒤 자른다
        val relationshipTypes = holder.current().relationshipTypes
        val relations = detail.relationships.filter { r ->
            r.type in relationshipTypes && !r.archived && !(if (r.from.id == id) r.to else r.from).archived
        }
        val documents = reader.evidenceDocuments(listOf(id), LearningRules.evidenceTypes(holder.current()), MAX_DOCUMENTS)[id].orEmpty()
        return V1NodeDetail(
            node = V1NodeHeader(
                id = node.id,
                type = node.type,
                typeLabel = mapper.typeLabel(node.type),
                label = node.label,
                revision = node.revision,
                createdAt = node.createdAt,
                createdBy = node.createdBy?.displayName,
                updatedAt = node.updatedAt,
                updatedBy = node.updatedBy?.displayName,
            ),
            properties = mapper.properties(node),
            relations = relations.take(MAX_RELATIONS).map { r ->
                val out = r.from.id == id
                V1Relation(
                    relationshipId = r.id,
                    type = r.type,
                    label = relationshipTypes.getValue(r.type).label ?: r.type,
                    direction = if (out) "OUT" else "IN",
                    sentence = mapper.sentence(r.type, r.from.label, r.to.label),
                    other = mapper.ref(if (out) r.to else r.from),
                )
            },
            claim = detail.claim?.let { mapper.claim(it, cutText = false) },
            claims = detail.claims.take(MAX_CLAIMS).map { mapper.claim(it, cutText = true) },
            documents = documents.map(mapper::document),
            concepts = detail.concepts.take(MAX_CONCEPTS).map(mapper::concept),
            relationsTruncated = relations.size > MAX_RELATIONS || detail.relationshipsTruncated,
            claimsTruncated = detail.claims.size > MAX_CLAIMS || detail.claimsTruncated,
        )
    }

    /** 중심은 nodes 의 첫 항목이다. 선의 문장은 일반 관계에만 만들고 주장 관계는 null 이다 */
    fun neighborhood(id: String, hops: Int): V1Graph {
        val view = graph.neighborhood(id, hops, null, null)
        val relationshipTypes = holder.current().relationshipTypes
        val labels = view.nodes.associate { it.id to it.label }
        val nodes = view.nodes.map { V1GraphNode(it.id, it.type, mapper.typeLabel(it.type), it.label, it.reviewStatus) }
        val center = view.nodes.first()
        return V1Graph(
            center = mapper.ref(center.id, center.type, center.label),
            hops = view.hops,
            nodes = nodes,
            edges = view.edges.map { e ->
                val sentence = if (e.type in relationshipTypes) {
                    mapper.sentence(e.type, labels.getValue(e.source), labels.getValue(e.target))
                } else {
                    null
                }
                V1GraphEdge(e.id, e.type, e.source, e.target, sentence)
            },
            truncated = view.truncated,
        )
    }

    /**
     * 화면의 근거 따라가기를 옮긴다. 관계는 위 단계에서 아래 단계로 가므로 `via` 의 문장은 이 단계가 시작, `childId` 단계가 끝이다.
     * 이해 표시는 TraceService 가 토큰 주인 것만 읽는다
     */
    fun trace(id: String, userId: String): V1Trace {
        val view = traces.trace(id, userId)
        val relationshipTypes = holder.current().relationshipTypes
        val labels = view.steps.associate { it.node.id to it.node.label }
        val root = view.steps.first { it.node.id == view.rootId }.node
        return V1Trace(
            root = mapper.ref(root),
            steps = view.steps.map { step ->
                val relationshipId = step.relationshipId
                val type = step.relationshipType
                val childId = step.childId
                val via = if (relationshipId != null && type != null && childId != null) {
                    V1TraceVia(relationshipId, type, childId, mapper.sentence(type, step.node.label, labels.getValue(childId)))
                } else {
                    null
                }
                V1TraceStep(
                    node = mapper.ref(step.node),
                    depth = step.depth,
                    via = via,
                    status = step.status,
                    documents = step.documents.map(mapper::document),
                    claims = step.claims.map { V1TraceClaim(it.id, it.label, it.predicate, it.reviewStatus) },
                    concepts = step.concepts.map(mapper::concept),
                    missing = step.missing.map { m ->
                        V1TraceMissing(m.relationshipType, relationshipTypes[m.relationshipType]?.label ?: m.relationshipType, m.candidates.map(mapper::ref))
                    },
                    myKnowledge = step.knowledge?.let { k -> k.level?.let { V1Knowledge(it, k.note, k.updatedAt) } },
                )
            },
            dependents = view.dependents.map { d ->
                V1TraceDependent(mapper.ref(d.node), d.relationshipType, mapper.sentence(d.relationshipType, root.label, d.node.label))
            },
            truncated = view.truncated,
            dependentsTruncated = view.dependentsTruncated,
        )
    }

    /** 토큰 주인의 공부 목록. 보관한 항목의 표시는 뺀다. 수준 형식 검사는 KnowledgeMarkService 가 한다 */
    fun knowledge(userId: String, level: List<String>?, page: Int?, size: Int?): Page<V1StudyItem> {
        val found = marks.list(userId, level, mapper.page(page, size), includeArchived = false)
        val items = found.items.map { item ->
            V1StudyItem(
                node = mapper.ref(item.node),
                level = item.level,
                note = item.note,
                updatedAt = item.updatedAt,
                contexts = item.contexts.map { V1StudyContext(mapper.ref(it.decision), it.depth) },
                documents = item.documents.map(mapper::document),
                concepts = item.concepts.map(mapper::concept),
            )
        }
        return Page(items, found.page, found.size, found.totalItems, found.totalPages)
    }
}
