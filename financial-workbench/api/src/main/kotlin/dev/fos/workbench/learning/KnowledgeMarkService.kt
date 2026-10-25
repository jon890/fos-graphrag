package dev.fos.workbench.learning

import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.params
import dev.fos.workbench.knowledge.KnowledgeReader
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * 요청한 사람 본인의 이해 표시(`(:User)-[:KNOWS]->(:Knowledge)`)를 읽고 쓴다.
 * 모든 쿼리는 세션의 사용자 id 로만 관계를 찾는다. 다른 사람의 표시를 읽는 길은 없다.
 * 개인 기록이라 항목과 사용자의 revision, updatedAt 을 바꾸지 않고 ChangeEvent 도 남기지 않는다(docs/data-schema.md 「이해 표시」).
 */
@Service
class KnowledgeMarkService(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    private val reader: KnowledgeReader,
    private val traces: TraceService,
) {

    @Transactional(readOnly = true)
    fun get(userId: String, nodeId: String): KnowledgeMark {
        reader.nodeProps(nodeId)
        return client.query(
            """
            MATCH (:User {id: ${'$'}userId})-[k:KNOWS]->(:Knowledge {id: ${'$'}nodeId})
            RETURN k.level AS level, k.note AS note, k.updatedAt AS updatedAt
            """,
        ).bindAll(mapOf("userId" to userId, "nodeId" to nodeId)).fetch().one()
            .map { KnowledgeMark(nodeId, it["level"] as String?, it["note"] as String?, it["updatedAt"] as String?) }
            .orElse(KnowledgeMark(nodeId, null, null, null))
    }

    /**
     * 사용자 노드에 잠금 표시를 건 뒤 MERGE 한다. 같은 사람의 두 요청이 동시에 와도 관계가 하나로 남고 나중 쓰기가 이긴다.
     * 보관된 항목에도 쓴다.
     */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun put(userId: String, nodeId: String, body: PutKnowledgeRequest): KnowledgeMark {
        val level = body.level
        if (level == null || level !in LEVELS) {
            throw ValidationFailedException(mapOf("level" to LEVEL_MESSAGE))
        }
        val note = body.note?.trim()?.takeIf { it.isNotEmpty() }
        if (note != null && note.length > MAX_NOTE) {
            throw ValidationFailedException(mapOf("note" to "${MAX_NOTE}자 이하여야 합니다."))
        }
        reader.nodeProps(nodeId)
        val row = client.query(
            """
            MATCH (u:User {id: ${'$'}userId})
            MATCH (n:Knowledge {id: ${'$'}nodeId})
            SET u._lock = true
            MERGE (u)-[k:KNOWS]->(n)
            SET k.level = ${'$'}level, k.updatedAt = ${'$'}now, k.note = ${'$'}note
            REMOVE u._lock
            RETURN k.level AS level, k.note AS note, k.updatedAt AS updatedAt
            """,
        ).bindAll(params("userId" to userId, "nodeId" to nodeId, "level" to level, "now" to Timestamps.now(), "note" to note))
            .fetch().one().orElseThrow { IllegalStateException("이해 표시를 쓰지 못했습니다: 사용자 $userId") }
        return KnowledgeMark(nodeId, row["level"] as String?, row["note"] as String?, row["updatedAt"] as String?)
    }

    /** 표시가 없어도 그대로 끝낸다 */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun delete(userId: String, nodeId: String) {
        reader.nodeProps(nodeId)
        client.query("MATCH (:User {id: \$userId})-[k:KNOWS]->(:Knowledge {id: \$nodeId}) DELETE k")
            .bindAll(mapOf("userId" to userId, "nodeId" to nodeId)).run()
    }

    /** 공부 목록. 바꾼 시각이 늦은 순서, 같으면 노드 id 순서다. `includeArchived` 가 거짓이면 보관된 항목을 뺀다 */
    @Transactional(readOnly = true)
    @Suppress("UNCHECKED_CAST")
    fun list(userId: String, levels: List<String>?, page: PageQuery, includeArchived: Boolean = true): Page<StudyItem> {
        val filter = levels?.map { it.trim() }?.filter { it.isNotEmpty() }?.takeIf { it.isNotEmpty() }
        if (filter != null && filter.any { it !in LEVELS }) {
            throw ValidationFailedException(mapOf("level" to LEVEL_MESSAGE))
        }
        val ontology = holder.current()
        val p = params("userId" to userId, "levels" to filter, "skip" to page.skip, "limit" to page.size)
        val archived = if (includeArchived) "" else " AND n.archived = false"
        val match = "MATCH (:User {id: \$userId})-[k:KNOWS]->(n:Knowledge) WHERE (\$levels IS NULL OR k.level IN \$levels)$archived"
        val total = client.query("$match RETURN count(k) AS total").bindAll(p)
            .fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        val rows = client.query(
            """
            $match
            RETURN properties(n) AS n, k.level AS level, k.note AS note, k.updatedAt AS updatedAt
            ORDER BY k.updatedAt DESC, n.id
            SKIP ${'$'}skip LIMIT ${'$'}limit
            """,
        ).bindAll(p).fetch().all().toList()
        val nodes = rows.map { it["n"] as Map<String, Any?> }
        val ids = nodes.map { it["id"] as String }
        val claimNames = reader.claimLabels(ids)
        val contexts = contexts(nodes.filter { it["archived"] != true }.map { it["id"] as String }, LearningRules.traversableTypes(ontology))
        val documents = reader.evidenceDocuments(ids, LearningRules.evidenceTypes(ontology), MAX_DOCUMENTS)
        val concepts = reader.concepts(ids, MAX_CONCEPTS)
        val items = rows.zip(nodes) { row, n ->
            val id = n["id"] as String
            val ref = reader.ref(n).let { r -> claimNames[id]?.let { r.copy(label = it) } ?: r }
            StudyItem(
                node = ref,
                level = row["level"] as String,
                note = row["note"] as String?,
                updatedAt = row["updatedAt"] as String,
                contexts = contexts[id].orEmpty(),
                documents = documents[id].orEmpty(),
                concepts = concepts[id].orEmpty(),
            )
        }
        return page.of(items, total)
    }

    /**
     * 표시 수와 내 능력 범위. 근거 따라가기와 같은 읽기 트랜잭션(`workbench.graph.timeout`) 하나에서 돈다.
     * 결정마다 근거 따라가기의 단계 집합을 다시 모으므로 쿼리는 결정 수에 비례한다.
     */
    fun summary(userId: String): KnowledgeSummary = traces.read {
        val counts = LEVELS.associateWith { 0L }.toMutableMap()
        client.query("MATCH (:User {id: \$userId})-[k:KNOWS]->(:Knowledge) RETURN k.level AS level, count(k) AS n")
            .bind(userId).to("userId").fetch().all()
            .forEach { row -> (row["level"] as String?)?.takeIf { it in LEVELS }?.let { counts[it] = (row["n"] as Number).toLong() } }
        val decisionIds = if (LearningRules.DECISION in holder.current().nodeTypes) {
            client.query(
                """
                MATCH (n:Knowledge) WHERE n.type = ${'$'}type AND n.archived = false
                RETURN n.id AS id ORDER BY n.createdAt, n.id LIMIT ${'$'}limit
                """,
            ).bindAll(mapOf("type" to LearningRules.DECISION, "limit" to MAX_DECISIONS + 1L)).fetch().all().map { it["id"] as String }
        } else {
            emptyList()
        }
        val counted = decisionIds.take(MAX_DECISIONS)
        val known = client.query("MATCH (:User {id: \$userId})-[k:KNOWS]->(n:Knowledge) WHERE k.level = 'KNOWN' RETURN n.id AS id")
            .bind(userId).to("userId").fetch().all().map { it["id"] as String }.toSet()
        val understood = counted.count { known.containsAll(traces.nodeSet(it).first) }
        KnowledgeSummary(counts, DecisionUnderstanding(counted.size.toLong(), understood.toLong()), decisionIds.size > MAX_DECISIONS)
    }

    /**
     * 항목에서 따라가는 관계만 정방향으로 0~[LearningRules.MAX_DEPTH] 홉 따라 닿는 보관되지 않은 결정.
     * 경로 위 모든 노드와 관계는 보관되지 않아야 한다. 결정마다 가장 짧은 길이를 depth 로 두고 가까운 순서로 [MAX_CONTEXTS] 개까지.
     */
    @Suppress("UNCHECKED_CAST")
    private fun contexts(nodeIds: List<String>, types: List<String>): Map<String, List<StudyContext>> {
        if (nodeIds.isEmpty()) return emptyMap()
        // 가변 길이 패턴의 길이는 parameter 가 될 수 없어 상수를 문자열에 넣는다. 결정 레이블도 상수다
        return client.query(
            """
            UNWIND ${'$'}ids AS nodeId
            MATCH p = (:Knowledge {id: nodeId})-[*0..${LearningRules.MAX_DEPTH}]->(d:Knowledge:${LearningRules.DECISION})
            WHERE all(r IN relationships(p) WHERE type(r) IN ${'$'}types AND r.archived = false)
              AND all(x IN nodes(p) WHERE x:Knowledge AND x.archived = false)
            WITH nodeId, d, min(length(p)) AS depth
            ORDER BY depth, d.createdAt, d.id
            RETURN nodeId, collect({d: properties(d), depth: depth})[0..${'$'}limit] AS contexts
            """,
        ).bindAll(mapOf("ids" to nodeIds, "types" to types, "limit" to MAX_CONTEXTS.toLong())).fetch().all().associate { row ->
            row["nodeId"] as String to (row["contexts"] as List<Map<String, Any?>>).map {
                StudyContext(reader.ref(it["d"] as Map<String, Any?>), (it["depth"] as Number).toInt())
            }
        }
    }

    companion object {
        val LEVELS = setOf("KNOWN", "UNSURE", "LEARNING")
        const val MAX_NOTE = 1000
        const val MAX_CONTEXTS = 3
        const val MAX_DOCUMENTS = 5
        const val MAX_CONCEPTS = 10
        const val MAX_DECISIONS = 200
        private const val LEVEL_MESSAGE = "KNOWN, UNSURE, LEARNING 가운데 하나여야 합니다."
    }
}
