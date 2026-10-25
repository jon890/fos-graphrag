package dev.fos.workbench.trade

import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.params
import dev.fos.workbench.knowledge.NodeRef
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Repository
import java.util.UUID

/** 체결 목록의 조건. 값이 null 이면 그 조건을 쓰지 않는다. `from`, `to` 는 UTC 초까지의 시각 문자열이다 */
data class TradeFilter(
    val securityId: String? = null,
    val decisionId: String? = null,
    val ticker: String? = null,
    val from: String? = null,
    val to: String? = null,
)

/**
 * `(:User)-[:OWNS]->(:Trade)`. 주인 조건은 이 저장소 한 곳에만 있다(docs/adr/013-owner-trades-and-agent-proposals.md).
 * 모든 쿼리는 주인 사용자 노드에서 `OWNS` 로 체결을 찾는다. `ownerId` 속성만으로 찾지 않는다.
 * 체결과 그 관계에는 `archived` 를 두지 않는다. 주변 그래프의 경로 조건에 걸려 지나가지 않게 하려는 것이다.
 */
@Repository
class TradeRepository(private val client: Neo4jClient, private val holder: OntologyHolder) {

    /** 주인 노드에 쓰기 잠금(`_lock`)을 건다. 같은 주인의 동시 저장은 여기서 줄을 선다. 사용자가 없으면 false 다 */
    fun lockOwner(ownerId: String): Boolean =
        client.query("MATCH (u:User {id: \$ownerId}) SET u._lock = true RETURN u.id AS id")
            .bind(ownerId).to("ownerId").fetch().one().isPresent

    fun unlockOwner(ownerId: String) {
        client.query("MATCH (u:User {id: \$ownerId}) REMOVE u._lock").bind(ownerId).to("ownerId").run()
    }

    /** MERGE 로 하나 만들거나 찾는다. created 가 true 면 새로 만들었다. 이미 있으면 저장된 값을 고치지 않는다 */
    fun merge(ownerId: String, input: TradeInput, tokenId: String?, createdVia: String): Pair<String, Boolean> {
        val props = buildMap<String, Any> {
            put("id", UUID.randomUUID().toString())
            put("side", input.side)
            put("market", input.market)
            put("ticker", input.ticker)
            input.name?.let { put("name", it) }
            put("quantity", input.quantity)
            put("price", input.price)
            put("currency", input.currency)
            put("amount", input.amount)
            input.fee?.let { put("fee", it) }
            put("executedAt", input.executedAt)
            put("createdAt", Timestamps.now())
            put("createdVia", createdVia)
            tokenId?.let { put("tokenId", it) }
        }
        val row = client.query(
            """
            MATCH (u:User {id: ${'$'}ownerId})
            MERGE (t:Trade {ownerId: ${'$'}ownerId, broker: ${'$'}broker, externalId: ${'$'}externalId})
            ON CREATE SET t += ${'$'}props, t._new = true
            MERGE (u)-[:OWNS]->(t)
            WITH t, coalesce(t._new, false) AS created
            REMOVE t._new
            RETURN t.id AS id, created
            """,
        ).bindAll(params("ownerId" to ownerId, "broker" to input.broker, "externalId" to input.externalId, "props" to props))
            .fetch().one().orElseThrow { IllegalStateException("체결을 저장하지 못했습니다: 사용자 $ownerId") }
        return row["id"] as String to (row["created"] as Boolean)
    }

    /** 종목이 아직 없으면 markets 와 ticker 로 보관되지 않은 종목을 만든 순서로 하나 찾아 `OF_SECURITY` 를 만든다. 없으면 잇지 않는다 */
    fun linkSecurityIfMissing(ownerId: String, tradeId: String, markets: List<String>, ticker: String) {
        client.query(
            """
            MATCH (:User {id: ${'$'}ownerId})-[:OWNS]->(t:Trade {id: ${'$'}tradeId})
            WHERE NOT (t)-[:OF_SECURITY]->()
            MATCH (s:Knowledge:Security)
            WHERE s.archived = false AND toUpper(s.ticker) = ${'$'}ticker AND s.market IN ${'$'}markets
            WITH t, s ORDER BY s.createdAt, s.id LIMIT 1
            MERGE (t)-[:OF_SECURITY]->(s)
            """,
        ).bindAll(params("ownerId" to ownerId, "tradeId" to tradeId, "markets" to markets, "ticker" to ticker.uppercase())).run()
    }

    /** 요청한 순서로 돌려준다. 내 체결이 아닌 id 는 빠진다 */
    @Suppress("UNCHECKED_CAST")
    fun views(ownerId: String, ids: List<String>): List<TradeView> {
        if (ids.isEmpty()) return emptyList()
        val ontology = holder.current()
        val byId = client.query(
            """
            MATCH (:User {id: ${'$'}ownerId})-[:OWNS]->(t:Trade) WHERE t.id IN ${'$'}ids
            OPTIONAL MATCH (t)-[:OF_SECURITY]->(s:Knowledge)
            WITH t, head(collect(properties(s))) AS s
            OPTIONAL MATCH (t)-[e:EXECUTES]->(d:Knowledge)
            WITH t, s, e, d ORDER BY e.createdAt, d.id
            WITH t, s, collect(properties(d)) AS decisions
            RETURN properties(t) AS t, s, decisions
            """,
        ).bindAll(params("ownerId" to ownerId, "ids" to ids.distinct())).fetch().all().associate { row ->
            val t = row["t"] as Map<String, Any?>
            t["id"] as String to view(
                ontology, t, row["s"] as Map<String, Any?>?, row["decisions"] as List<Map<String, Any?>>,
            )
        }
        return ids.mapNotNull { byId[it] }
    }

    /** 체결 시각이 늦은 순서, 같으면 id 순서다. 조건을 여럿 주면 모두 맞는 것이다 */
    fun page(ownerId: String, filter: TradeFilter, page: PageQuery): Page<TradeView> {
        val p = params(
            "ownerId" to ownerId, "securityId" to filter.securityId, "decisionId" to filter.decisionId, "ticker" to filter.ticker,
            "from" to filter.from, "to" to filter.to, "skip" to page.skip, "limit" to page.size,
        )
        val match = """
            MATCH (:User {id: ${'$'}ownerId})-[:OWNS]->(t:Trade)
            WHERE (${'$'}securityId IS NULL OR EXISTS { (t)-[:OF_SECURITY]->(:Knowledge {id: ${'$'}securityId}) })
              AND (${'$'}decisionId IS NULL OR EXISTS { (t)-[:EXECUTES]->(:Knowledge {id: ${'$'}decisionId}) })
              AND (${'$'}ticker IS NULL OR toUpper(t.ticker) = toUpper(${'$'}ticker))
              AND (${'$'}from IS NULL OR t.executedAt >= ${'$'}from)
              AND (${'$'}to IS NULL OR t.executedAt < ${'$'}to)
        """
        val total = client.query("$match RETURN count(t) AS total").bindAll(p)
            .fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        val ids = client.query("$match RETURN t.id AS id ORDER BY t.executedAt DESC, t.id SKIP \$skip LIMIT \$limit")
            .bindAll(p).fetch().all().map { it["id"] as String }
        return page.of(views(ownerId, ids), total)
    }

    /** 체결과 그 관계(`OWNS`, `OF_SECURITY`, `EXECUTES`)를 함께 지운다. 내 체결이 아니거나 없으면 false 다 */
    fun delete(ownerId: String, tradeId: String): Boolean =
        client.query(
            """
            MATCH (:User {id: ${'$'}ownerId})-[:OWNS]->(t:Trade {id: ${'$'}tradeId})
            WITH t, t.id AS id
            DETACH DELETE t
            RETURN id
            """,
        ).bindAll(params("ownerId" to ownerId, "tradeId" to tradeId)).fetch().one().isPresent

    private fun view(ontology: Ontology, t: Map<String, Any?>, security: Map<String, Any?>?, decisions: List<Map<String, Any?>>) =
        TradeView(
            id = t["id"] as String,
            broker = t["broker"] as String,
            externalId = t["externalId"] as String,
            side = t["side"] as String,
            market = t["market"] as String,
            ticker = t["ticker"] as String,
            name = t["name"] as String?,
            quantity = (t["quantity"] as Number).toDouble(),
            price = (t["price"] as Number).toDouble(),
            currency = t["currency"] as String,
            amount = (t["amount"] as Number).toDouble(),
            fee = (t["fee"] as Number?)?.toDouble(),
            executedAt = t["executedAt"] as String,
            createdAt = t["createdAt"] as String,
            createdVia = t["createdVia"] as String,
            security = security?.let { ref(ontology, it) },
            decisions = decisions.map { ref(ontology, it) },
        )

    private fun ref(ontology: Ontology, p: Map<String, Any?>): NodeRef {
        val type = p["type"] as String
        return NodeRef(p["id"] as String, type, ontology.labelOf(type, p), p["archived"] == true)
    }
}
