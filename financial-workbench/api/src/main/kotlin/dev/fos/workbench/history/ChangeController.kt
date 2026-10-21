package dev.fos.workbench.history

import dev.fos.workbench.auth.UserRef
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.config.params
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.security.core.Authentication
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue

/** 이력의 changes 에 든 ID 를 읽는 시점의 이름으로 바꾼 것. 사용자면 type 이 User 다 */
data class ChangeRef(val id: String, val type: String, val label: String, val archived: Boolean)

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
    val refs: Map<String, ChangeRef>,
    val note: String?,
)

@RestController
class ChangeController(
    private val client: Neo4jClient,
    private val users: UserRepository,
    private val mapper: JsonMapper,
    private val ontology: Ontology,
) {

    @GetMapping("/api/changes")
    @Transactional(readOnly = true)
    fun list(
        @RequestParam(required = false) targetId: String?,
        @RequestParam(required = false) actor: String?,
        @RequestParam(required = false) page: Int?,
        @RequestParam(required = false) size: Int?,
        authentication: Authentication,
    ): Page<ChangeEventView> {
        val query = PageQuery.of(page, size)
        val admin = isAdmin(authentication)
        val actorId = actor?.let { users.findByEmail(it)?.id ?: return query.of(emptyList(), 0) }
        val params = params("targetId" to targetId, "actorId" to actorId, "skip" to query.skip, "limit" to query.size, "admin" to admin)
        val where = "WHERE (\$targetId IS NULL OR e.targetId = \$targetId) AND (\$actorId IS NULL OR e.actorId = \$actorId) " +
            "AND (\$admin OR e.targetKind <> 'USER')"
        val total = client.query("MATCH (e:ChangeEvent) $where RETURN count(e) AS total")
            .bindAll(params).fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        @Suppress("UNCHECKED_CAST")
        val rows = client.query("MATCH (e:ChangeEvent) $where RETURN properties(e) AS e ORDER BY e.at DESC, e.id SKIP \$skip LIMIT \$limit")
            .bindAll(params).fetch().all().map { it["e"] as Map<String, Any?> }
        val changes = rows.map { mapper.readValue<Map<String, FieldChange>>(it["changes"] as String) }
        val nodeIds = changes.flatMap { idsOf(it, NODE_REF_KEYS) }.toSet()
        val userIds = changes.flatMap { idsOf(it, USER_REF_KEYS) }.toSet()
        val userRefs = users.findRefs(rows.map { it["actorId"] as String } + userIds)
        val known = nodeRefs(nodeIds) + userIds.mapNotNull { id -> userRefs[id]?.let { id to ChangeRef(id, "User", it.displayName, false) } }
        return query.of(
            rows.zip(changes).map { (e, c) ->
                val ids = idsOf(c, NODE_REF_KEYS) + idsOf(c, USER_REF_KEYS)
                toView(e, c, ids.mapNotNull { known[it] }.associateBy { it.id }, userRefs)
            },
            total,
        )
    }

    /** 이력에 한 번이라도 나온 사용자. 이력 화면의 사용자 고르기 칸이 쓴다 */
    @GetMapping("/api/changes/actors")
    @Transactional(readOnly = true)
    fun actors(authentication: Authentication): List<UserRef> {
        val ids = client.query("MATCH (e:ChangeEvent) WHERE \$admin OR e.targetKind <> 'USER' RETURN DISTINCT e.actorId AS id")
            .bind(isAdmin(authentication)).to("admin").fetch().all().map { it["id"] as String }
        // 서버가 남긴 이력의 작업자(system)는 User 노드가 없어 findRefs 에서 빠진다
        return users.findRefs(ids).values.sortedBy { it.displayName }
    }

    // 사용자 관리 이벤트는 허용 목록(이메일)을 드러내므로 ADMIN 에게만 보인다
    private fun isAdmin(authentication: Authentication) = authentication.authorities.any { it.authority == "ROLE_ADMIN" }

    /** changes 가운데 keys 에 든 키의 before, after 에서 ID 문자열을 모은다. 목록이면 원소를 모은다 */
    private fun idsOf(changes: Map<String, FieldChange>, keys: Set<String>): Set<String> =
        changes.filterKeys { it in keys }.values
            .flatMap { listOf(it.before, it.after) }
            .flatMap { if (it is Collection<*>) it else listOf(it) }
            .filterIsInstance<String>()
            .toSet()

    @Suppress("UNCHECKED_CAST")
    private fun nodeRefs(ids: Set<String>): Map<String, ChangeRef> {
        if (ids.isEmpty()) return emptyMap()
        return client.query("MATCH (n:Knowledge) WHERE n.id IN \$ids RETURN properties(n) AS n")
            .bind(ids.toList()).to("ids").fetch().all()
            .map { it["n"] as Map<String, Any?> }
            .associate { n ->
                val type = n["type"] as String
                val id = n["id"] as String
                id to ChangeRef(id, type, ontology.labelOf(type, n), n["archived"] == true)
            }
    }

    private fun toView(e: Map<String, Any?>, changes: Map<String, FieldChange>, refs: Map<String, ChangeRef>, userRefs: Map<String, UserRef>) =
        ChangeEventView(
            id = e["id"] as String,
            at = e["at"] as String,
            actor = userRefs[e["actorId"]],
            action = e["action"] as String,
            targetId = e["targetId"] as String,
            targetKind = e["targetKind"] as String,
            targetType = e["targetType"] as String,
            targetLabel = e["targetLabel"] as String,
            revision = (e["revision"] as Number).toLong(),
            changes = changes,
            refs = refs,
            note = e["note"] as String?,
        )

    companion object {
        /** changes 에서 값이 노드 ID 인 키. Claim 이 아닌 노드(Company, Security, Sector, Document)를 가리킨다 */
        val NODE_REF_KEYS = setOf("subjectId", "objectId", "documentIds", "fromId", "toId")

        /** changes 에서 값이 사용자 ID 인 키. 검토된 주장을 고치면 검토 정보를 비운 기록으로 남는다 */
        val USER_REF_KEYS = setOf("reviewedBy")

        /**
         * changes 에 나오는 키 가운데 온톨로지 속성이 아닌 것 전부. 온톨로지의 changeFields 가 이 키의 표시 이름을 둔다.
         * 이력에 새 키를 남기는 코드를 더하면 여기에도 더한다. OntologyLabelsTest 가 YAML 과 대조한다.
         */
        val CHANGE_FIELD_KEYS = NODE_REF_KEYS + USER_REF_KEYS +
            setOf("reviewStatus", "reviewedAt", "reviewNote", "archived", "email", "displayName", "role", "enabled")
    }
}
