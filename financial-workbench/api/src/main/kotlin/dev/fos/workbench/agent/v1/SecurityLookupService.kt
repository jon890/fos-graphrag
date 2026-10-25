package dev.fos.workbench.agent.v1

import dev.fos.workbench.config.WorkbenchProperties
import dev.fos.workbench.config.params
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.trade.SecurityMarkets
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

/**
 * 시장과 종목 코드로 종목을 찾고, 그 종목의 투자 결정과 발행 기업의 밸류에이션을 함께 돌려준다.
 * 화면에 같은 조회가 없어 자기 Cypher 를 쓴다. 타입, 관계, 속성 키는 이름으로 읽고 온톨로지에서 빠지면 결과가 빌 뿐이다
 * (docs/data-schema.md 「투자 온톨로지」). 모든 노드와 관계는 보관되지 않은 것만 읽는다.
 */
@Service
class SecurityLookupService(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    private val mapper: V1Mapper,
    properties: WorkbenchProperties,
    transactionManager: PlatformTransactionManager,
) {
    private val readOnly = TransactionTemplate(transactionManager).apply {
        isReadOnly = true
        timeout = properties.graph.timeout.toSeconds().toInt().coerceAtLeast(1)
    }

    /** 종목 코드는 대소문자만 무시해 비교하고 다른 변환은 하지 않는다. 맞는 종목이 없으면 빈 matches 다 */
    fun lookup(market: String?, ticker: String?): V1SecurityLookup {
        val trimmed = ticker?.trim().orEmpty()
        if (trimmed.isEmpty() || trimmed.length > SecurityMarkets.MAX_TICKER) {
            throw ValidationFailedException(mapOf("ticker" to "1자 이상 ${SecurityMarkets.MAX_TICKER}자 이하여야 합니다."))
        }
        val marketKey = market?.trim()?.uppercase()?.takeIf { it.isNotEmpty() }
        val markets = marketKey?.let {
            SecurityMarkets.workbenchMarkets(it) ?: throw ValidationFailedException(mapOf("market" to SecurityMarkets.MESSAGE))
        }
        return readOnly.execute { load(holder.current(), marketKey, trimmed, markets) }
    }

    @Suppress("UNCHECKED_CAST")
    private fun load(ontology: Ontology, marketKey: String?, ticker: String, markets: List<String>?): V1SecurityLookup {
        val securities = client.query(
            """
            MATCH (s:Knowledge:Security)
            WHERE s.archived = false AND toUpper(s.ticker) = ${'$'}ticker AND (${'$'}markets IS NULL OR s.market IN ${'$'}markets)
            WITH s ORDER BY s.market, s.createdAt, s.id LIMIT ${'$'}limit
            RETURN properties(s) AS s
            """,
        ).bindAll(params("ticker" to ticker.uppercase(), "markets" to markets, "limit" to MAX_MATCHES + 1L))
            .fetch().all().map { it["s"] as Map<String, Any?> }
        val kept = securities.take(MAX_MATCHES)
        val securityIds = kept.map { it["id"] as String }
        val issuers = issuers(securityIds)
        val decisions = decisions(securityIds)
        val basedOn = basedOn(decisions.values.flatMap { list -> list.take(MAX_DECISIONS).map { it["id"] as String } })
        val valuations = valuations(issuers.values.map { it["id"] as String }.distinct())
        val scenarios = scenarios(valuations.values.flatMap { list -> list.take(MAX_VALUATIONS).map { it["id"] as String } })

        val matches = kept.map { s ->
            val id = s["id"] as String
            val issuer = issuers[id]
            val found = decisions[id].orEmpty()
            val issuerValuations = issuer?.let { valuations[it["id"] as String] }.orEmpty()
            V1SecurityMatch(
                security = V1SecurityRef(
                    id = id,
                    type = s["type"] as String,
                    typeLabel = mapper.typeLabel(s["type"] as String),
                    label = ontology.labelOf(s["type"] as String, s),
                    market = s["market"]?.toString(),
                    marketLabel = valueLabel(ontology, s, "market"),
                    ticker = s["ticker"]?.toString(),
                    currency = s["currency"]?.toString(),
                ),
                issuer = issuer?.let { ref(ontology, it) },
                decisions = found.take(MAX_DECISIONS).map { d ->
                    V1Decision(
                        node = ref(ontology, d),
                        action = d["action"]?.toString(),
                        actionLabel = valueLabel(ontology, d, "action"),
                        decidedAt = d["decidedAt"]?.toString(),
                        reason = mapper.cut(d["reason"]?.toString()),
                        basedOn = basedOn[d["id"] as String].orEmpty().map { ref(ontology, it) },
                    )
                },
                valuations = issuerValuations.take(MAX_VALUATIONS).map { v ->
                    val vScenarios = scenarios[v["id"] as String].orEmpty()
                    V1Valuation(
                        node = ref(ontology, v),
                        asOf = v["asOf"]?.toString(),
                        currentPrice = v["currentPrice"] as Number?,
                        currency = v["currency"]?.toString(),
                        method = v["method"]?.toString(),
                        scenarios = vScenarios.take(MAX_SCENARIOS).map { sc ->
                            V1Scenario(
                                node = ref(ontology, sc),
                                kind = sc["kind"]?.toString(),
                                valuePerShare = sc["valuePerShare"] as Number?,
                                assumptions = mapper.cut(sc["assumptions"]?.toString()),
                            )
                        },
                        scenariosTruncated = vScenarios.size > MAX_SCENARIOS,
                    )
                },
                decisionsTruncated = found.size > MAX_DECISIONS,
                valuationsTruncated = issuerValuations.size > MAX_VALUATIONS,
            )
        }
        return V1SecurityLookup(marketKey, ticker, matches, securities.size > MAX_MATCHES)
    }

    /** 종목마다 발행 기업 하나. 관계를 먼저 이은 순서로 첫 기업이다 */
    @Suppress("UNCHECKED_CAST")
    private fun issuers(securityIds: List<String>): Map<String, Map<String, Any?>> {
        if (securityIds.isEmpty()) return emptyMap()
        return client.query(
            """
            UNWIND ${'$'}ids AS sid
            MATCH (c:Knowledge:Company)-[r:ISSUES]->(:Knowledge:Security {id: sid})
            WHERE r.archived = false AND c.archived = false
            WITH sid, c, r ORDER BY r.createdAt, r.id
            RETURN sid, collect(properties(c))[0] AS c
            """,
        ).bind(securityIds).to("ids").fetch().all().associate { it["sid"] as String to it["c"] as Map<String, Any?> }
    }

    /** 종목마다 결정. 결정일이 늦은 순서이고 결정일이 없으면 뒤에 둔다. 잘림을 알도록 상한보다 하나 더 읽는다 */
    private fun decisions(securityIds: List<String>): Map<String, List<Map<String, Any?>>> = grouped(
        securityIds,
        """
        UNWIND ${'$'}ids AS key
        MATCH (:Knowledge:Security {id: key})-[r:HAS_DECISION]->(d:Knowledge:Decision)
        WHERE r.archived = false AND d.archived = false
        WITH DISTINCT key, d
        ORDER BY d.decidedAt IS NULL, d.decidedAt DESC, d.createdAt, d.id
        RETURN key, collect(properties(d))[0..${'$'}limit] AS items
        """,
        MAX_DECISIONS + 1L,
    )

    /** 결정마다 `BASED_ON` 으로 이어진 밸류에이션. 관계를 먼저 이은 순서다 */
    private fun basedOn(decisionIds: List<String>): Map<String, List<Map<String, Any?>>> = grouped(
        decisionIds,
        """
        UNWIND ${'$'}ids AS key
        MATCH (v:Knowledge:Valuation)-[b:BASED_ON]->(:Knowledge:Decision {id: key})
        WHERE b.archived = false AND v.archived = false
        WITH key, v, b ORDER BY b.createdAt, b.id
        RETURN key, collect(properties(v)) AS items
        """,
        null,
    ).mapValues { (_, list) -> list.distinctBy { it["id"] } }

    /** 기업마다 밸류에이션. 기준일이 늦은 순서이고 기준일이 없으면 뒤에 둔다 */
    private fun valuations(companyIds: List<String>): Map<String, List<Map<String, Any?>>> = grouped(
        companyIds,
        """
        UNWIND ${'$'}ids AS key
        MATCH (:Knowledge:Company {id: key})-[r:HAS_VALUATION]->(v:Knowledge:Valuation)
        WHERE r.archived = false AND v.archived = false
        WITH DISTINCT key, v
        ORDER BY v.asOf IS NULL, v.asOf DESC, v.createdAt, v.id
        RETURN key, collect(properties(v))[0..${'$'}limit] AS items
        """,
        MAX_VALUATIONS + 1L,
    )

    /** 밸류에이션마다 시나리오. 비관, 기준, 낙관 순서다 */
    private fun scenarios(valuationIds: List<String>): Map<String, List<Map<String, Any?>>> = grouped(
        valuationIds,
        """
        UNWIND ${'$'}ids AS key
        MATCH (:Knowledge:Valuation {id: key})-[h:HAS_SCENARIO]->(sc:Knowledge:Scenario)
        WHERE h.archived = false AND sc.archived = false
        WITH DISTINCT key, sc
        ORDER BY CASE sc.kind WHEN 'BEAR' THEN 0 WHEN 'BASE' THEN 1 WHEN 'BULL' THEN 2 ELSE 3 END, sc.createdAt, sc.id
        RETURN key, collect(properties(sc))[0..${'$'}limit] AS items
        """,
        MAX_SCENARIOS + 1L,
    )

    /** `ids` 의 값마다 `items` 목록을 읽는다. 자르는 쿼리만 `limit` 을 쓴다 */
    @Suppress("UNCHECKED_CAST")
    private fun grouped(ids: List<String>, cypher: String, limit: Long?): Map<String, List<Map<String, Any?>>> {
        if (ids.isEmpty()) return emptyMap()
        return client.query(cypher).bindAll(params("ids" to ids.distinct(), "limit" to limit)).fetch().all()
            .associate { it["key"] as String to it["items"] as List<Map<String, Any?>> }
    }

    private fun ref(ontology: Ontology, p: Map<String, Any?>): V1NodeRef {
        val type = p["type"] as String
        return mapper.ref(p["id"] as String, type, ontology.labelOf(type, p))
    }

    /** enum 값의 표시 이름. 표시 이름이 없으면 값, 값이 없으면 null 이다 */
    private fun valueLabel(ontology: Ontology, p: Map<String, Any?>, key: String): String? {
        val value = p[key]?.toString() ?: return null
        return ontology.nodeTypes[p["type"] as String]?.properties?.get(key)?.valueLabels?.get(value) ?: value
    }

    companion object {
        const val MAX_MATCHES = 10
        const val MAX_DECISIONS = 20
        const val MAX_VALUATIONS = 10
        const val MAX_SCENARIOS = 10
    }
}
