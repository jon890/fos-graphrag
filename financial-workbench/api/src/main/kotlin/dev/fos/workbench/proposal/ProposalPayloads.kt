package dev.fos.workbench.proposal

import dev.fos.workbench.config.params
import dev.fos.workbench.knowledge.KnowledgeReader
import dev.fos.workbench.learning.KnowledgeMarkService
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.ontology.OntologyValidator
import dev.fos.workbench.trade.TradeRepository
import dev.fos.workbench.web.ArchivedException
import dev.fos.workbench.web.DuplicateException
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.OntologyViolationException
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component

/** 제안의 종류. `requiresEditor` 면 공유 지식을 만들어 EDITOR 이상만 승인한다 */
enum class ProposalKind(val requiresEditor: Boolean) {
    CREATE_NODE(true),
    CREATE_RELATIONSHIP(true),
    LINK_TRADE_DECISION(false),
    STUDY_NOTE(false),
    ;

    companion object {
        fun parse(value: String?): ProposalKind? = entries.firstOrNull { it.name == value }
    }
}

/** 검사한 내용. 실행과 저장에 쓴다 */
sealed interface ProposalPayload {
    data class CreateNode(val type: String, val properties: Map<String, Any?>, val links: List<Link>, val tradeIds: List<String>) : ProposalPayload {
        override fun toMap(): Map<String, Any?> =
            mapOf("type" to type, "properties" to properties, "links" to links.map { it.toMap() }, "tradeIds" to tradeIds)
    }

    /** `fromId` 를 주면 그 노드에서 새 노드로, `toId` 를 주면 새 노드에서 그 노드로 잇는다. 둘 가운데 하나만 있다 */
    data class Link(val type: String, val fromId: String?, val toId: String?) {
        fun toMap(): Map<String, Any?> = buildMap {
            put("type", type)
            fromId?.let { put("fromId", it) }
            toId?.let { put("toId", it) }
        }
    }

    data class CreateRelationship(val type: String, val fromId: String, val toId: String) : ProposalPayload {
        override fun toMap(): Map<String, Any?> = mapOf("type" to type, "fromId" to fromId, "toId" to toId)
    }

    data class LinkTradeDecision(val tradeIds: List<String>, val decisionId: String) : ProposalPayload {
        override fun toMap(): Map<String, Any?> = mapOf("tradeIds" to tradeIds, "decisionId" to decisionId)
    }

    data class StudyNote(val nodeId: String, val level: String, val note: String?) : ProposalPayload {
        override fun toMap(): Map<String, Any?> = mapOf("nodeId" to nodeId, "level" to level, "note" to note)
    }

    /** 계약(docs/api-contract.md 「제안 내용」)의 payload 모양 */
    fun toMap(): Map<String, Any?>
}

/**
 * 제안 내용을 종류별로 검사한다. 올릴 때와 승인할 때 같은 규칙이다(docs/api-contract.md 「제안 내용」).
 * 노드 존재와 내 체결까지 확인하므로 그 사이 노드가 보관되거나 온톨로지가 바뀌면 승인할 때 실패한다.
 */
@Component
class ProposalPayloads(
    private val holder: OntologyHolder,
    private val validator: OntologyValidator,
    private val reader: KnowledgeReader,
    private val trades: TradeRepository,
    private val client: Neo4jClient,
) {

    /** 모양, 온톨로지, 노드 존재, 내 체결을 확인한다. prefix 는 fieldErrors 키 앞부분(`proposals[0].payload`, 승인에서는 `payload`) */
    fun check(ownerId: String, kind: ProposalKind, raw: Any?, prefix: String): ProposalPayload {
        val fields = Fields(raw, prefix, FIELDS.getValue(kind))
        val payload = when (kind) {
            ProposalKind.CREATE_NODE -> createNodeShape(fields)
            ProposalKind.CREATE_RELATIONSHIP -> {
                val type = fields.text("type")
                val fromId = fields.text("fromId")
                val toId = fields.text("toId")
                fields.done { ProposalPayload.CreateRelationship(type!!, fromId!!, toId!!) }
            }
            ProposalKind.LINK_TRADE_DECISION -> {
                val tradeIds = fields.ids("tradeIds", MAX_TRADE_IDS, required = true)
                val decisionId = fields.text("decisionId")
                fields.done { ProposalPayload.LinkTradeDecision(tradeIds!!, decisionId!!) }
            }
            ProposalKind.STUDY_NOTE -> studyNoteShape(fields)
        }
        return when (payload) {
            is ProposalPayload.CreateNode -> checkCreateNode(ownerId, payload, prefix)
            is ProposalPayload.CreateRelationship -> payload.also { checkRelationship(it) }
            is ProposalPayload.LinkTradeDecision -> payload.also {
                requireDecision(it.decisionId)
                requireOwnedTrades(ownerId, it.tradeIds)
            }
            is ProposalPayload.StudyNote -> payload.also { reader.nodeProps(it.nodeId) }
        }
    }

    private fun createNodeShape(fields: Fields): ProposalPayload.CreateNode {
        val type = fields.text("type")
        val properties = fields.objectOrEmpty("properties")
        val links = fields.links()
        val tradeIds = fields.ids("tradeIds", MAX_TRADE_IDS, required = false).orEmpty()
        if (type != null && type != DECISION && tradeIds.isNotEmpty()) fields.fail("tradeIds", "투자 결정(Decision)을 만들 때만 줄 수 있습니다.")
        return fields.done { ProposalPayload.CreateNode(type!!, properties!!, links!!, tradeIds) }
    }

    private fun studyNoteShape(fields: Fields): ProposalPayload.StudyNote {
        val nodeId = fields.text("nodeId")
        val level = fields.text("level")?.also {
            if (it !in KnowledgeMarkService.LEVELS) fields.fail("level", "${KnowledgeMarkService.LEVELS.joinToString()} 가운데 하나여야 합니다.")
        }
        val note = fields.text("note", required = false, maxLength = KnowledgeMarkService.MAX_NOTE)
        return fields.done { ProposalPayload.StudyNote(nodeId!!, level!!, note) }
    }

    /** `POST /api/nodes` 와 같은 규칙. 승인할 때는 실행하는 `NodeService` 가 같은 종목을 다시 막는다 */
    private fun checkCreateNode(ownerId: String, payload: ProposalPayload.CreateNode, prefix: String): ProposalPayload.CreateNode {
        val ontology = holder.current()
        val def = ontology.requireNodeType(payload.type)
        if (def.managedBy != null) {
            throw OntologyViolationException("claim-via-claims-api", "${payload.type} 은(는) 제안으로 만들 수 없습니다. Claim 은 /api/claims 로 만듭니다.")
        }
        val properties = try {
            validator.validateCreate(payload.type, payload.properties)
        } catch (e: ValidationFailedException) {
            throw ValidationFailedException(fieldErrorsOf(e).mapKeys { (k, _) -> "$prefix.properties.$k" })
        }
        payload.links.forEach { link ->
            val rel = ontology.requireRelationshipType(link.type)
            val other = reader.nodeProps(link.fromId ?: link.toId!!)
            val (fromType, toType) = if (link.fromId != null) other["type"] to payload.type else payload.type to other["type"]
            requireEndpoints(link.type, rel.from, rel.to, fromType, toType)
            if (other["archived"] == true) throw ArchivedException()
        }
        if (payload.type == SECURITY) requireUniqueListing(properties)
        requireOwnedTrades(ownerId, payload.tradeIds)
        return payload.copy(properties = properties)
    }

    /** 관계 API 와 같은 규칙. 승인할 때는 실행하는 `RelationshipService` 가 같은 활성 관계를 다시 막는다 */
    private fun checkRelationship(payload: ProposalPayload.CreateRelationship) {
        val rel = holder.current().requireRelationshipType(payload.type)
        val from = reader.nodeProps(payload.fromId)
        val to = reader.nodeProps(payload.toId)
        requireEndpoints(payload.type, rel.from, rel.to, from["type"], to["type"])
        if (from["archived"] == true || to["archived"] == true) throw ArchivedException()
        requireNoActiveRelationship(payload)
    }

    /** 보관된 종목도 센다. 유일 제약 `security_listing_unique` 가 보관된 것에도 걸린다 */
    private fun requireUniqueListing(props: Map<String, Any?>) {
        val exists = client.query("MATCH (s:Knowledge:Security {market: \$market, ticker: \$ticker}) RETURN count(s) > 0 AS exists")
            .bindAll(params("market" to props["market"], "ticker" to props["ticker"]))
            .fetch().one().map { it["exists"] == true }.orElse(false)
        if (exists) throw DuplicateException("같은 시장에 같은 종목 코드가 이미 있습니다. 보관된 종목이면 복원하세요.")
    }

    /** 관계 타입은 requireRelationshipType 으로 허용 목록과 대조한 값이다 */
    private fun requireNoActiveRelationship(payload: ProposalPayload.CreateRelationship) {
        val duplicate = client.query(
            "MATCH (:Knowledge {id: \$from})-[r:`${payload.type}`]->(:Knowledge {id: \$to}) WHERE r.archived = false RETURN count(r) > 0 AS dup",
        ).bindAll(params("from" to payload.fromId, "to" to payload.toId)).fetch().one().map { it["dup"] == true }.orElse(false)
        if (duplicate) throw DuplicateException("같은 관계가 이미 있습니다.")
    }

    private fun requireEndpoints(type: String, allowedFrom: List<String>, allowedTo: List<String>, fromType: Any?, toType: Any?) {
        if (fromType !in allowedFrom || toType !in allowedTo) {
            throw OntologyViolationException(
                "relationship-endpoint",
                "$type 는 ${allowedFrom.joinToString()} → ${allowedTo.joinToString()} 사이에만 만들 수 있습니다. 요청: $fromType → $toType",
            )
        }
    }

    private fun requireDecision(decisionId: String) {
        val decision = reader.nodeProps(decisionId)
        if (decision["type"] != DECISION) throw OntologyViolationException("decision-type", "투자 결정에만 체결을 이을 수 있습니다.")
        if (decision["archived"] == true) throw ArchivedException()
    }

    /** 내 체결이 아니거나 없는 첫 id 로 NOT_FOUND */
    fun requireOwnedTrades(ownerId: String, tradeIds: List<String>) {
        if (tradeIds.isEmpty()) return
        val owned = trades.ownedIds(ownerId, tradeIds)
        tradeIds.firstOrNull { it !in owned }?.let { throw NotFoundException(it) }
    }

    /** payload 객체의 칸을 읽는다. 틀린 칸은 모아 두었다가 `done` 에서 한 번에 던진다 */
    private class Fields(raw: Any?, private val prefix: String, allowed: Set<String>) {
        private val errors = linkedMapOf<String, String>()
        private val map: Map<*, *> = raw as? Map<*, *> ?: emptyMap<String, Any?>().also {
            errors[prefix] = if (raw == null) "필수입니다." else "객체여야 합니다."
        }

        init {
            map.keys.filterNot { it in allowed }.forEach { fail(it.toString(), "알 수 없는 필드입니다.") }
        }

        fun fail(field: String, message: String) {
            errors.putIfAbsent("$prefix.$field", message)
        }

        fun <T> done(build: () -> T): T {
            if (errors.isNotEmpty()) throw ValidationFailedException(errors)
            return build()
        }

        /** 앞뒤 공백을 지운 문자열. 필수가 아니면 비운 값은 없는 것으로 본다 */
        fun text(field: String, required: Boolean = true, maxLength: Int? = null): String? = text(field, map[field], required, maxLength)

        private fun text(field: String, value: Any?, required: Boolean, maxLength: Int?): String? {
            val trimmed = when (value) {
                null -> null
                is String -> value.trim().takeIf { it.isNotEmpty() }
                else -> {
                    fail(field, "문자열이어야 합니다.")
                    return null
                }
            }
            if (trimmed == null) {
                if (required) fail(field, "필수입니다.")
                return null
            }
            if (maxLength != null && trimmed.length > maxLength) {
                fail(field, "${maxLength}자 이하여야 합니다.")
                return null
            }
            return trimmed
        }

        @Suppress("UNCHECKED_CAST")
        fun objectOrEmpty(field: String): Map<String, Any?>? = when (val value = map[field]) {
            null -> emptyMap()
            is Map<*, *> -> value as Map<String, Any?>
            else -> null.also { fail(field, "객체여야 합니다.") }
        }

        /** 문자열 id 목록. 필수면 1개 이상이다 */
        fun ids(field: String, max: Int, required: Boolean): List<String>? {
            val value = map[field]
            if (value == null) {
                if (required) fail(field, "1개 이상 ${max}개 이하여야 합니다.")
                return null
            }
            val list = value as? List<*>
            if (list == null || (required && list.isEmpty()) || list.size > max) {
                fail(field, if (required) "1개 이상 ${max}개 이하여야 합니다." else "${max}개 이하여야 합니다.")
                return null
            }
            val ids = list.mapIndexedNotNull { i, item -> text("$field[$i]", item, required = true, maxLength = null) }
            return ids.takeIf { it.size == list.size }
        }

        fun links(): List<ProposalPayload.Link>? {
            val value = map["links"] ?: return emptyList()
            val list = value as? List<*>
            if (list == null || list.size > MAX_LINKS) {
                fail("links", "${MAX_LINKS}개 이하여야 합니다.")
                return null
            }
            val links = list.mapIndexedNotNull { i, item ->
                val field = "links[$i]"
                val link = item as? Map<*, *>
                if (link == null) {
                    fail(field, "객체여야 합니다.")
                    return@mapIndexedNotNull null
                }
                link.keys.filterNot { it in LINK_FIELDS }.forEach { fail("$field.$it", "알 수 없는 필드입니다.") }
                val type = text("$field.type", link["type"], required = true, maxLength = null)
                val fromId = text("$field.fromId", link["fromId"], required = false, maxLength = null)
                val toId = text("$field.toId", link["toId"], required = false, maxLength = null)
                if ((fromId == null) == (toId == null)) {
                    fail(field, "fromId 와 toId 가운데 하나만 있어야 합니다.")
                    return@mapIndexedNotNull null
                }
                type?.let { ProposalPayload.Link(it, fromId, toId) }
            }
            return links.takeIf { it.size == list.size }
        }
    }

    companion object {
        const val DECISION = "Decision"
        const val SECURITY = "Security"
        const val MAX_LINKS = 10
        const val MAX_TRADE_IDS = 50

        private val LINK_FIELDS = setOf("type", "fromId", "toId")
        private val FIELDS = mapOf(
            ProposalKind.CREATE_NODE to setOf("type", "properties", "links", "tradeIds"),
            ProposalKind.CREATE_RELATIONSHIP to setOf("type", "fromId", "toId"),
            ProposalKind.LINK_TRADE_DECISION to setOf("tradeIds", "decisionId"),
            ProposalKind.STUDY_NOTE to setOf("nodeId", "level", "note"),
        )

        @Suppress("UNCHECKED_CAST")
        fun fieldErrorsOf(e: ValidationFailedException): Map<String, String> = e.details["fieldErrors"] as Map<String, String>
    }
}
