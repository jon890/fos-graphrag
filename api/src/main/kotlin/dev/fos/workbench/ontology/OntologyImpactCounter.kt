package dev.fos.workbench.ontology

import dev.fos.workbench.config.params
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component

/** 기존 데이터와 어긋나는 변경 하나. `kind` 와 세는 대상은 docs/data-schema.md 「어긋나는 변경」 표다 */
data class OntologyImpact(val path: String, val kind: String, val count: Long)

/**
 * 편집한 정의가 지금 데이터와 어긋나는 곳을 센다. 데이터는 바꾸지 않는다. 보관된 노드와 관계도 센다.
 * 이름은 사용자 입력에서 오므로 Cypher 에 잇지 않고 parameter 로 비교한다(`n.type = $type`, `n[$prop]`, `type(r) = $rel`).
 */
@Component
class OntologyImpactCounter(private val client: Neo4jClient) {

    fun count(latest: Ontology, edited: Ontology): List<OntologyImpact> {
        val impacts = mutableListOf<OntologyImpact>()
        fun add(path: String, kind: String, cypher: String, vararg bind: Pair<String, Any?>) = countInto(impacts, path, kind, cypher, mapOf(*bind))

        latest.nodeTypes.forEach { (type, before) ->
            val path = "nodeTypes.$type"
            val after = edited.nodeTypes[type]
            if (after == null) {
                // 빠진 타입의 속성은 따로 세지 않는다
                add(path, "REMOVED_NODE_TYPE", "MATCH (n:Knowledge) WHERE n.type = \$type RETURN count(n) AS c", "type" to type)
                return@forEach
            }
            countProperties(impacts, path, type, before, after)
        }
        latest.relationshipTypes.forEach { (rel, before) ->
            val path = "relationshipTypes.$rel"
            val after = edited.relationshipTypes[rel]
            if (after == null) {
                add(path, "REMOVED_RELATIONSHIP_TYPE", "MATCH ()-[r]->() WHERE type(r) = \$rel RETURN count(r) AS c", "rel" to rel)
            } else if (!after.from.containsAll(before.from) || !after.to.containsAll(before.to)) {
                add(
                    path, "NARROWED_RELATIONSHIP_ENDS",
                    "MATCH (a)-[r]->(b) WHERE type(r) = \$rel AND (NOT a.type IN \$from OR NOT b.type IN \$to) RETURN count(r) AS c",
                    "rel" to rel, "from" to after.from, "to" to after.to,
                )
            }
        }
        latest.claimPredicates.forEach { (predicate, before) ->
            val path = "claimPredicates.$predicate"
            val after = edited.claimPredicates[predicate]
            if (after == null) {
                add(path, "REMOVED_CLAIM_PREDICATE", "MATCH (c:Knowledge:Claim) WHERE c.predicate = \$predicate RETURN count(c) AS c", "predicate" to predicate)
            } else if (!after.subjectTypes.containsAll(before.subjectTypes) || !after.objectTypes.containsAll(before.objectTypes)) {
                add(
                    path, "NARROWED_CLAIM_TYPES",
                    """
                    MATCH (c:Knowledge:Claim) WHERE c.predicate = ${'$'}predicate
                      AND (EXISTS { MATCH (c)-[:SUBJECT]->(s) WHERE NOT s.type IN ${'$'}subjectTypes }
                           OR EXISTS { MATCH (c)-[:OBJECT]->(o) WHERE NOT o.type IN ${'$'}objectTypes })
                    RETURN count(c) AS c
                    """,
                    "predicate" to predicate, "subjectTypes" to after.subjectTypes, "objectTypes" to after.objectTypes,
                )
            }
        }
        return impacts.sortedWith(compareBy({ it.path }, { it.kind }))
    }

    private fun countInto(impacts: MutableList<OntologyImpact>, path: String, kind: String, cypher: String, bind: Map<String, Any?>) {
        val n = client.query(cypher).bindAll(params(*bind.toList().toTypedArray())).fetch().one().map { (it["c"] as Number).toLong() }.orElse(0L)
        if (n > 0) impacts.add(OntologyImpact(path, kind, n))
    }

    private fun countProperties(impacts: MutableList<OntologyImpact>, typePath: String, type: String, before: NodeTypeDef, after: NodeTypeDef) {
        val match = "MATCH (n:Knowledge) WHERE n.type = \$type AND"
        fun add(path: String, kind: String, cypher: String, bind: Map<String, Any?>) = countInto(impacts, path, kind, cypher, bind)
        (before.properties.keys - after.properties.keys).forEach { prop ->
            add("$typePath.properties.$prop", "REMOVED_PROPERTY", "$match n[\$prop] IS NOT NULL RETURN count(n) AS c", mapOf("type" to type, "prop" to prop))
        }
        after.properties.forEach { (prop, p) ->
            val path = "$typePath.properties.$prop"
            val old = before.properties[prop]
            val bind = mapOf<String, Any?>("type" to type, "prop" to prop)
            if (p.required && old?.required != true) {
                add(path, "NOW_REQUIRED", "$match n[\$prop] IS NULL RETURN count(n) AS c", bind)
            }
            if (old == null) return@forEach
            if (old.type != p.type) {
                add(path, "CHANGED_PROPERTY_TYPE", "$match n[\$prop] IS NOT NULL RETURN count(n) AS c", bind)
            } else if (p.type == PropertyType.ENUM) {
                (old.values.orEmpty() - p.values.orEmpty().toSet()).forEach { value ->
                    add("$path.values.$value", "REMOVED_ENUM_VALUE", "$match n[\$prop] = \$value RETURN count(n) AS c", bind + ("value" to value))
                }
            }
            if (p.maxLength != null && (old.maxLength == null || p.maxLength < old.maxLength)) {
                add(
                    path, "NARROWED_RANGE", "$match n[\$prop] IS NOT NULL AND size(toString(n[\$prop])) > \$max RETURN count(n) AS c",
                    bind + ("max" to p.maxLength.toLong()),
                )
            }
            val minNarrowed = p.min != null && (old.min == null || p.min > old.min)
            val maxNarrowed = p.max != null && (old.max == null || p.max < old.max)
            if (minNarrowed || maxNarrowed) {
                add(
                    path, "NARROWED_RANGE",
                    "$match ((\$min IS NOT NULL AND n[\$prop] < \$min) OR (\$max IS NOT NULL AND n[\$prop] > \$max)) RETURN count(n) AS c",
                    bind + ("min" to p.min) + ("max" to p.max),
                )
            }
        }
    }
}
