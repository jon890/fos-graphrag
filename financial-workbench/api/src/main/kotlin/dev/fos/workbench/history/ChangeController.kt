package dev.fos.workbench.history

import dev.fos.workbench.auth.UserRef
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.config.params
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue

data class ChangeEventView(
    val id: String,
    val at: String,
    val actor: UserRef?,
    val action: String,
    val targetId: String,
    val targetKind: String,
    val targetType: String,
    val targetLabel: String,
    val revision: Long,
    val changes: Map<String, FieldChange>,
    val note: String?,
)

@RestController
class ChangeController(
    private val client: Neo4jClient,
    private val users: UserRepository,
    private val mapper: JsonMapper,
) {

    @GetMapping("/api/changes")
    @Transactional(readOnly = true)
    fun list(
        @RequestParam(required = false) targetId: String?,
        @RequestParam(required = false) actor: String?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
    ): Page<ChangeEventView> {
        val query = PageQuery.of(page, size)
        val actorId = actor?.let { users.findByUsername(it)?.id ?: return query.of(emptyList(), 0) }
        val params = params("targetId" to targetId, "actorId" to actorId, "skip" to query.skip, "limit" to query.size)
        val where = "WHERE (\$targetId IS NULL OR e.targetId = \$targetId) AND (\$actorId IS NULL OR e.actorId = \$actorId)"
        val total = client.query("MATCH (e:ChangeEvent) $where RETURN count(e) AS total")
            .bindAll(params).fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        @Suppress("UNCHECKED_CAST")
        val rows = client.query("MATCH (e:ChangeEvent) $where RETURN properties(e) AS e ORDER BY e.at DESC, e.id SKIP \$skip LIMIT \$limit")
            .bindAll(params).fetch().all().map { it["e"] as Map<String, Any?> }
        val refs = users.findRefs(rows.map { it["actorId"] as String })
        return query.of(rows.map { toView(it, refs) }, total)
    }

    private fun toView(e: Map<String, Any?>, refs: Map<String, UserRef>) = ChangeEventView(
        id = e["id"] as String,
        at = e["at"] as String,
        actor = refs[e["actorId"]],
        action = e["action"] as String,
        targetId = e["targetId"] as String,
        targetKind = e["targetKind"] as String,
        targetType = e["targetType"] as String,
        targetLabel = e["targetLabel"] as String,
        revision = (e["revision"] as Number).toLong(),
        changes = mapper.readValue<Map<String, FieldChange>>(e["changes"] as String),
        note = e["note"] as String?,
    )
}
