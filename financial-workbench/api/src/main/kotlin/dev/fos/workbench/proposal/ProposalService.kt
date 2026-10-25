package dev.fos.workbench.proposal

import dev.fos.workbench.auth.Role
import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.knowledge.CreateNodeRequest
import dev.fos.workbench.knowledge.CreateRelationshipRequest
import dev.fos.workbench.knowledge.KnowledgeReader
import dev.fos.workbench.knowledge.NodeRef
import dev.fos.workbench.knowledge.NodeService
import dev.fos.workbench.knowledge.RelationshipService
import dev.fos.workbench.learning.KnowledgeMarkService
import dev.fos.workbench.learning.PutKnowledgeRequest
import dev.fos.workbench.trade.TradeRepository
import dev.fos.workbench.web.ApiException
import dev.fos.workbench.web.ForbiddenException
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import dev.fos.workbench.web.ProposalLimitException
import dev.fos.workbench.web.ProposalNotPendingException
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.readValue
import java.net.URI
import java.net.URISyntaxException
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/** 올리기 요청의 항목 하나의 결과. `status` 는 `created`(새로 저장) 또는 `existing`(같은 dedupeKey 의 제안이 있음)이다 */
data class ProposalSaveResult(val index: Int, val status: String, val proposal: StoredProposal)

/** 마지막 승인 실패 */
data class ProposalError(val code: String, val message: String, val at: String)

/** 저장된 제안을 읽은 값. JSON 문자열로 둔 payload, evidence, result 는 맵으로 푼다 */
data class StoredProposal(
    val id: String,
    val kind: ProposalKind,
    val status: String,
    val payload: Map<String, Any?>,
    val rationale: String,
    val evidence: Map<String, Any?>,
    val dedupeKey: String?,
    val createdAt: String,
    val createdVia: String,
    val tokenId: String?,
    val tokenName: String?,
    val decidedAt: String?,
    val decisionNote: String?,
    val result: Map<String, Any?>?,
    val lastError: ProposalError?,
)

/**
 * 에이전트가 해석해 올린 쓰기(`:Proposal`)를 받고, 주인이 승인하면 기존 서비스로 실행한다(docs/adr/013-owner-trades-and-agent-proposals.md).
 * 제안 자체는 변경 이력에 남기지 않는다. 승인으로 생긴 노드와 관계만 NodeService, RelationshipService 가 남긴다.
 */
@Service
class ProposalService(
    private val proposals: ProposalRepository,
    private val payloads: ProposalPayloads,
    private val trades: TradeRepository,
    private val reader: KnowledgeReader,
    private val nodes: NodeService,
    private val relationships: RelationshipService,
    private val knowledgeMarks: KnowledgeMarkService,
    private val mapper: JsonMapper,
    transactionManager: PlatformTransactionManager,
) {
    // 승인은 실행 트랜잭션과 실패 기록 트랜잭션을 따로 연다. 실패 기록이 실행과 함께 롤백되지 않게 하려는 것이다
    private val write = TransactionTemplate(transactionManager).apply { timeout = Limits.WRITE_TIMEOUT_SECONDS }
    private val errorWrite = TransactionTemplate(transactionManager).apply { timeout = Limits.WRITE_TIMEOUT_SECONDS }

    /**
     * 모든 항목을 먼저 검사하고, 하나라도 틀리면 아무것도 저장하지 않는다.
     * 주인 노드를 잠근 뒤 대기 수를 세고, 새로 만들 수를 더해 상한을 넘으면 만들기 전에 거절한다.
     * 같은 dedupeKey 는 같은 요청의 앞 항목을 포함해 있던 제안을 돌려준다. 같은 트랜잭션에서 오래된 결정한 제안을 지운다.
     */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun submit(ownerId: String, tokenId: String?, tokenName: String?, items: List<Map<String, Any?>>?): List<ProposalSaveResult> {
        val inputs = parseInputs(items)
        val checked = inputs.mapIndexed { i, input ->
            withIndex(i) {
                val payload = payloads.check(ownerId, input.kind, input.payload, "proposals[$i].payload")
                requireEvidence(ownerId, input.evidence)
                payload
            }
        }
        // 토큰 인증이 지운 사용자를 먼저 막으므로 정상 흐름에서는 나오지 않는다
        val pending = proposals.lockOwnerAndCountPending(ownerId) ?: throw IllegalStateException("사용자를 찾을 수 없다: $ownerId")
        val firstIndexByKey = mutableMapOf<String, Int>()
        val existing = inputs.mapIndexed { i, input ->
            val key = input.dedupeKey ?: return@mapIndexed null
            firstIndexByKey[key]?.let { return@mapIndexed Existing.SameRequest(it) }
            firstIndexByKey[key] = i
            proposals.findByDedupeKey(ownerId, key)?.let { Existing.Stored(it) }
        }
        val toCreate = existing.count { it == null }
        if (pending + toCreate > Limits.MAX_PENDING_PROPOSALS) throw ProposalLimitException(Limits.MAX_PENDING_PROPOSALS, pending)

        val now = Timestamps.now()
        val saved = arrayOfNulls<Pair<String, StoredProposal>>(inputs.size)
        inputs.forEachIndexed { i, input ->
            saved[i] = when (val found = existing[i]) {
                is Existing.Stored -> EXISTING to stored(found.props)
                is Existing.SameRequest -> EXISTING to saved[found.index]!!.second
                null -> {
                    val id = proposals.create(ownerId, newProps(ownerId, tokenId, tokenName, input, checked[i], now))
                    CREATED to stored(proposals.find(ownerId, id) ?: throw IllegalStateException("저장한 제안을 읽지 못했다: $id"))
                }
            }
        }
        val before = Timestamps.system(Instant.now().minus(Limits.DECIDED_PROPOSAL_RETENTION_DAYS, ChronoUnit.DAYS))
        proposals.deleteDecidedBefore(ownerId, before)
        proposals.unlockOwner(ownerId)
        return saved.mapIndexed { i, s -> ProposalSaveResult(i, s!!.first, s.second) }
    }

    /**
     * 실행과 상태 변경은 한 트랜잭션이다. 실행 단계(내용 다시 검사부터 서비스 실행까지)가 실패하면 그 트랜잭션을 롤백하고,
     * 별도 트랜잭션으로 lastError 를 쓴 뒤 같은 오류를 던진다. 존재, 상태, 권한 확인의 오류는 기록하지 않는다.
     * 이 메서드에 @Transactional 을 붙이면 실패 기록이 실행과 함께 롤백된다.
     */
    fun accept(ownerId: String, role: Role, id: String, editedPayload: Any?): StoredProposal {
        try {
            return write.execute { acceptInTransaction(ownerId, role, id, editedPayload) }!!
        } catch (e: ExecutionFailed) {
            val failure = e.failure
            errorWrite.executeWithoutResult { proposals.recordError(ownerId, id, failure.code, failure.message, Timestamps.now()) }
            throw failure
        }
    }

    private fun acceptInTransaction(ownerId: String, role: Role, id: String, editedPayload: Any?): StoredProposal {
        val proposal = stored(lockPending(ownerId, id))
        if (proposal.kind.requiresEditor && role != Role.EDITOR && role != Role.ADMIN) {
            throw ForbiddenException("편집 권한이 있어야 승인할 수 있습니다.")
        }
        val (payload, result) = try {
            val payload = payloads.check(ownerId, proposal.kind, editedPayload ?: proposal.payload, "payload")
            payload to execute(ownerId, id, payload)
        } catch (e: ApiException) {
            throw ExecutionFailed(e)
        }
        val props = mapOf(
            "status" to ACCEPTED, "decidedAt" to Timestamps.now(),
            "payload" to mapper.writeValueAsString(payload.toMap()), "result" to mapper.writeValueAsString(result),
        )
        return stored(proposals.finish(ownerId, id, props))
    }

    private fun execute(ownerId: String, proposalId: String, payload: ProposalPayload): Map<String, Any?> = when (payload) {
        is ProposalPayload.CreateNode -> {
            val nodeId = nodes.create(CreateNodeRequest(payload.type, payload.properties), ownerId, NOTE).id
            val relationshipIds = payload.links.map { link ->
                relationships.create(CreateRelationshipRequest(link.type, link.fromId ?: nodeId, link.toId ?: nodeId), ownerId, NOTE).id
            }
            if (payload.tradeIds.isNotEmpty()) trades.linkDecision(ownerId, payload.tradeIds, nodeId, proposalId)
            result(listOf(nodeId), relationshipIds, payload.tradeIds)
        }
        is ProposalPayload.CreateRelationship -> {
            val relationshipId = relationships.create(CreateRelationshipRequest(payload.type, payload.fromId, payload.toId), ownerId, NOTE).id
            result(emptyList(), listOf(relationshipId), emptyList())
        }
        is ProposalPayload.LinkTradeDecision -> {
            trades.linkDecision(ownerId, payload.tradeIds, payload.decisionId, proposalId)
            result(listOf(payload.decisionId), emptyList(), payload.tradeIds)
        }
        is ProposalPayload.StudyNote -> {
            knowledgeMarks.put(ownerId, payload.nodeId, PutKnowledgeRequest(payload.level, payload.note))
            result(listOf(payload.nodeId), emptyList(), emptyList())
        }
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun reject(ownerId: String, id: String, reason: String?): StoredProposal {
        lockPending(ownerId, id)
        val note = reason?.trim()?.takeIf { it.isNotEmpty() }
        if (note != null && note.length > MAX_REASON) throw ValidationFailedException(mapOf("reason" to "${MAX_REASON}자 이하여야 합니다."))
        return stored(proposals.finish(ownerId, id, mapOf("status" to REJECTED, "decidedAt" to Timestamps.now(), "decisionNote" to note)))
    }

    @Transactional(readOnly = true)
    fun list(ownerId: String, status: String?, page: PageQuery): Page<StoredProposal> {
        val filter = status?.trim()?.takeIf { it.isNotEmpty() }
        if (filter != null && filter !in STATUSES) {
            throw ValidationFailedException(mapOf("status" to "${STATUSES.joinToString()} 가운데 하나여야 합니다."))
        }
        val rows = proposals.page(ownerId, filter, page)
        return page.of(rows.items.map(::stored), rows.totalItems)
    }

    @Transactional(readOnly = true)
    fun pendingCount(ownerId: String): Long = proposals.countPending(ownerId)

    /** 화면용 표현. 가리키는 노드와 내 체결은 제안 전체에서 모아 한 번씩 읽는다 */
    @Transactional(readOnly = true)
    fun views(ownerId: String, items: List<StoredProposal>): List<ProposalView> {
        val nodeIds = items.flatMap(::nodeIdsOf).distinct()
        val tradeIds = items.flatMap(::tradeIdsOf).distinct()
        val nodeProps = proposals.nodes(nodeIds)
        val claimNames = reader.claimLabels(nodeProps.map { it["id"] as String })
        val nodeRefs = nodeProps.associate { p ->
            val ref = reader.ref(p)
            ref.id to (claimNames[ref.id]?.let { ref.copy(label = it) } ?: ref)
        }
        val tradeViews = trades.views(ownerId, tradeIds).associateBy { it.id }
        return items.map { item ->
            ProposalView(
                id = item.id,
                kind = item.kind.name,
                status = item.status,
                payload = item.payload,
                rationale = item.rationale,
                evidence = item.evidence,
                createdAt = item.createdAt,
                createdVia = item.createdVia,
                token = if (item.tokenId == null && item.tokenName == null) null else ProposalToken(item.tokenId, item.tokenName),
                decidedAt = item.decidedAt,
                decisionNote = item.decisionNote,
                result = item.result,
                lastError = item.lastError,
                requiresEditor = item.kind.requiresEditor,
                refs = ProposalRefs(
                    nodes = nodeIdsOf(item).mapNotNull { id -> nodeRefs[id]?.let { id to it } }.toMap(),
                    trades = tradeIdsOf(item).mapNotNull { id -> tradeViews[id]?.let { id to it } }.toMap(),
                ),
            )
        }
    }

    fun view(ownerId: String, item: StoredProposal): ProposalView = views(ownerId, listOf(item)).single()

    private fun lockPending(ownerId: String, id: String): Map<String, Any?> {
        val props = proposals.lock(ownerId, id) ?: throw NotFoundException(id)
        val status = props["status"] as String
        if (status != PENDING) throw ProposalNotPendingException(status)
        return props
    }

    /** 항목의 검사에서 난 오류에 항목 번호를 붙인다. 칸 오류는 키에 이미 `proposals[i]` 가 있다 */
    private fun <T> withIndex(index: Int, block: () -> T): T = try {
        block()
    } catch (e: ValidationFailedException) {
        throw e
    } catch (e: ApiException) {
        throw ApiException(e.status, e.code, e.message, e.details + ("index" to index))
    }

    private fun requireEvidence(ownerId: String, evidence: Evidence) {
        val found = proposals.nodes(evidence.nodeIds).map { it["id"] as String }.toSet()
        evidence.nodeIds.firstOrNull { it !in found }?.let { throw NotFoundException(it) }
        payloads.requireOwnedTrades(ownerId, evidence.tradeIds)
    }

    private fun newProps(
        ownerId: String, tokenId: String?, tokenName: String?, input: ProposalInput, payload: ProposalPayload, now: String,
    ): Map<String, Any?> = buildMap {
        put("id", UUID.randomUUID().toString())
        put("ownerId", ownerId)
        put("kind", input.kind.name)
        put("status", PENDING)
        put("payload", mapper.writeValueAsString(payload.toMap()))
        put("rationale", input.rationale)
        put("evidence", mapper.writeValueAsString(input.evidence.toMap()))
        input.dedupeKey?.let { put("dedupeKey", it) }
        put("createdAt", now)
        put("createdVia", CREATED_VIA_AGENT)
        tokenId?.let { put("tokenId", it) }
        tokenName?.let { put("tokenName", it) }
    }

    private fun stored(p: Map<String, Any?>): StoredProposal = StoredProposal(
        id = p["id"] as String,
        kind = ProposalKind.valueOf(p["kind"] as String),
        status = p["status"] as String,
        payload = json(p["payload"]) ?: emptyMap(),
        rationale = p["rationale"] as String,
        evidence = json(p["evidence"]) ?: Evidence(emptyList(), emptyList(), emptyList()).toMap(),
        dedupeKey = p["dedupeKey"] as String?,
        createdAt = p["createdAt"] as String,
        createdVia = p["createdVia"] as String,
        tokenId = p["tokenId"] as String?,
        tokenName = p["tokenName"] as String?,
        decidedAt = p["decidedAt"] as String?,
        decisionNote = p["decisionNote"] as String?,
        result = json(p["result"]),
        lastError = (p["lastErrorCode"] as String?)?.let { ProposalError(it, p["lastErrorMessage"] as String? ?: "", p["lastErrorAt"] as String? ?: "") },
    )

    private fun json(value: Any?): Map<String, Any?>? = (value as String?)?.let { mapper.readValue<Map<String, Any?>>(it) }

    /** 항목마다 칸을 검사한다. 틀린 칸은 모든 항목에서 `proposals[i].칸` 키로 모아 한 번에 던진다 */
    private fun parseInputs(items: List<Map<String, Any?>>?): List<ProposalInput> {
        if (items.isNullOrEmpty() || items.size > Limits.MAX_PROPOSALS_PER_REQUEST) {
            throw ValidationFailedException(mapOf("proposals" to "1개 이상 ${Limits.MAX_PROPOSALS_PER_REQUEST}개 이하여야 합니다."))
        }
        val errors = linkedMapOf<String, String>()
        val parsed = items.mapIndexed { i, item ->
            val fail = { field: String, message: String -> errors.putIfAbsent("proposals[$i].$field", message) }
            item.keys.filterNot { it in INPUT_FIELDS }.forEach { fail(it, "알 수 없는 필드입니다.") }
            val kind = when (val raw = item["kind"]) {
                null -> null.also { fail("kind", "필수입니다.") }
                else -> ProposalKind.parse(raw as? String) ?: null.also { fail("kind", "${ProposalKind.entries.joinToString()} 가운데 하나여야 합니다.") }
            }
            if (item["payload"] == null) fail("payload", "필수입니다.")
            val rationale = (item["rationale"] as? String)?.trim()
            if (rationale.isNullOrEmpty() || rationale.length > MAX_RATIONALE) fail("rationale", "1자 이상 ${MAX_RATIONALE}자 이하여야 합니다.")
            val dedupeKey = when (val raw = item["dedupeKey"]) {
                null -> null
                is String -> raw.trim().takeIf { it.isNotEmpty() && it.length <= MAX_DEDUPE_KEY }
                    ?: null.also { fail("dedupeKey", "1자 이상 ${MAX_DEDUPE_KEY}자 이하여야 합니다.") }
                else -> null.also { fail("dedupeKey", "문자열이어야 합니다.") }
            }
            val evidence = evidence(item["evidence"]) { field, message -> fail("evidence$field", message) }
            if (kind == null || rationale == null || evidence == null) null
            else ProposalInput(kind, item["payload"], rationale, evidence, dedupeKey)
        }
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        return parsed.map { it!! }
    }

    /** 근거 참조. 없으면 셋 다 빈 목록이다. report 의 칸 이름은 `.nodeIds` 처럼 점으로 시작한다 */
    private fun evidence(raw: Any?, report: (String, String) -> Unit): Evidence? {
        if (raw == null) return Evidence(emptyList(), emptyList(), emptyList())
        val map = raw as? Map<*, *> ?: return null.also { report("", "객체여야 합니다.") }
        map.keys.filterNot { it in EVIDENCE_FIELDS }.forEach { report(".$it", "알 수 없는 필드입니다.") }
        var failed = false
        fun list(field: String, max: Int): List<String> {
            val value = map[field] ?: return emptyList()
            val items = (value as? List<*>)?.takeIf { it.size <= max && it.all { v -> v is String && v.isNotBlank() } }
            if (items == null) {
                failed = true
                report(".$field", "문자열 ${max}개 이하여야 합니다.")
                return emptyList()
            }
            return items.map { (it as String).trim() }
        }
        val nodeIds = list("nodeIds", MAX_EVIDENCE_NODES)
        val tradeIds = list("tradeIds", MAX_EVIDENCE_TRADES)
        val urls = list("urls", MAX_EVIDENCE_URLS)
        urls.forEachIndexed { i, url ->
            if (!isHttpUrl(url)) {
                failed = true
                report(".urls[$i]", "http, https 절대 주소 ${MAX_URL}자 이하여야 합니다.")
            }
        }
        return if (failed) null else Evidence(nodeIds, tradeIds, urls)
    }

    private fun isHttpUrl(value: String): Boolean {
        if (value.length > MAX_URL) return false
        return try {
            val uri = URI(value)
            uri.isAbsolute && uri.scheme.lowercase() in setOf("http", "https") && !uri.host.isNullOrEmpty()
        } catch (_: URISyntaxException) {
            false
        }
    }

    private fun nodeIdsOf(item: StoredProposal): List<String> {
        val p = item.payload
        val fromPayload = listOfNotNull(p["fromId"], p["toId"], p["decisionId"], p["nodeId"]) +
            (p["links"] as? List<*>).orEmpty().flatMap { (it as? Map<*, *>)?.let { l -> listOfNotNull(l["fromId"], l["toId"]) }.orEmpty() }
        return (fromPayload + idsIn(item.evidence["nodeIds"]) + idsIn(item.result?.get("nodeIds"))).filterIsInstance<String>().distinct()
    }

    private fun tradeIdsOf(item: StoredProposal): List<String> =
        (idsIn(item.payload["tradeIds"]) + idsIn(item.evidence["tradeIds"]) + idsIn(item.result?.get("tradeIds"))).distinct()

    private fun idsIn(value: Any?): List<String> = (value as? List<*>).orEmpty().filterIsInstance<String>()

    private fun result(nodeIds: List<String>, relationshipIds: List<String>, tradeIds: List<String>) =
        mapOf("nodeIds" to nodeIds, "relationshipIds" to relationshipIds, "tradeIds" to tradeIds)

    /** 검사한 올리기 항목 하나 */
    private data class ProposalInput(
        val kind: ProposalKind, val payload: Any?, val rationale: String, val evidence: Evidence, val dedupeKey: String?,
    )

    private data class Evidence(val nodeIds: List<String>, val tradeIds: List<String>, val urls: List<String>) {
        fun toMap(): Map<String, Any?> = mapOf("nodeIds" to nodeIds, "tradeIds" to tradeIds, "urls" to urls)
    }

    private sealed interface Existing {
        data class Stored(val props: Map<String, Any?>) : Existing
        data class SameRequest(val index: Int) : Existing
    }

    /** 실행 단계의 실패. 바깥에서 실패를 기록한 뒤 원래 오류를 던진다 */
    private class ExecutionFailed(val failure: ApiException) : RuntimeException(failure)

    companion object {
        const val PENDING = "PENDING"
        const val ACCEPTED = "ACCEPTED"
        const val REJECTED = "REJECTED"
        val STATUSES = listOf(PENDING, ACCEPTED, REJECTED)
        const val CREATED = "created"
        const val EXISTING = "existing"
        const val CREATED_VIA_AGENT = "AGENT"
        const val NOTE = "에이전트 제안을 승인했다"
        const val MAX_RATIONALE = 2000
        const val MAX_DEDUPE_KEY = 100
        const val MAX_REASON = 1000
        const val MAX_EVIDENCE_NODES = 20
        const val MAX_EVIDENCE_TRADES = 50
        const val MAX_EVIDENCE_URLS = 10
        const val MAX_URL = 2000

        private val INPUT_FIELDS = setOf("kind", "payload", "rationale", "evidence", "dedupeKey")
        private val EVIDENCE_FIELDS = setOf("nodeIds", "tradeIds", "urls")
    }
}
