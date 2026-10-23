package dev.fos.workbench.ontology

import dev.fos.workbench.auth.BootstrapAdmin
import dev.fos.workbench.config.Limits
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.config.params
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import dev.fos.workbench.web.RevisionConflictException
import org.slf4j.LoggerFactory
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.core.exc.StreamReadException
import tools.jackson.databind.DatabindException

/** 버전 목록의 한 줄. yaml 을 읽지 않고 저장된 값을 그대로 담는다 */
data class OntologyVersionSummary(
    val version: Int,
    val createdAt: String,
    val createdBy: String,
    val note: String?,
    val restoredFrom: Int?,
)

data class OntologyVersionDetail(val summary: OntologyVersionSummary, val yaml: String)

/**
 * `:OntologyVersion` 의 저장과 조회. docs/data-schema.md 의 「온톨로지 버전」, ADR-008.
 * 버전은 지우거나 고치지 않는다. 새 버전은 `(:OntologyHead {key: 'ontology'})` 를 잠근 뒤 만든다.
 */
@Component
class OntologyVersionStore(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    transactionManager: PlatformTransactionManager,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    private val write = TransactionTemplate(transactionManager).apply {
        timeout = Limits.WRITE_TIMEOUT_SECONDS
    }

    /** 최신 버전 번호. 버전이 없으면 0 이다. yaml 을 읽지 않는다 */
    fun latestNumber(): Int =
        client.query("MATCH (h:OntologyHead {key: \$key}) RETURN h.version AS version").bind(HEAD_KEY).to("key")
            .fetch().one().map { (it["version"] as Number).toInt() }.orElse(0)

    /** 최신 버전을 지금 코드의 로더로 읽는다. 읽지 못하면 로더의 예외가 그대로 나간다 */
    fun latest(): OntologySnapshot? = latestRow()?.let(::toSnapshot)

    fun list(page: PageQuery): Page<OntologyVersionSummary> {
        val total = client.query("MATCH (v:OntologyVersion) RETURN count(v) AS total")
            .fetch().one().map { (it["total"] as Number).toLong() }.orElse(0L)
        val items = client.query(
            "MATCH (v:OntologyVersion) RETURN v.version AS version, v.createdAt AS createdAt, v.createdBy AS createdBy, v.note AS note, " +
                "v.restoredFrom AS restoredFrom ORDER BY v.version DESC SKIP \$skip LIMIT \$limit",
        ).bindAll(mapOf("skip" to page.skip, "limit" to page.size)).fetch().all()
            .map { toSummary(it) }
        return page.of(items, total)
    }

    /** 그 번호의 버전. yaml 은 저장된 문자열 그대로다. 없으면 null */
    @Suppress("UNCHECKED_CAST")
    fun get(version: Int): OntologyVersionDetail? =
        client.query("MATCH (v:OntologyVersion {version: \$version}) RETURN properties(v) AS v").bind(version.toLong()).to("version")
            .fetch().one().map { it["v"] as Map<String, Any?> }
            .map { OntologyVersionDetail(toSummary(it), it["yaml"] as String) }.orElse(null)

    /**
     * 새 버전을 만든다. 호출한 쪽의 쓰기 트랜잭션 안에서 부른다. 최신 번호가 [expectedVersion] 이 아니면 `RevisionConflictException` 이다.
     * 저장하는 `schemaVersion` 은 새 번호의 문자열이다. [OntologyHolder] 는 트랜잭션이 커밋된 뒤에 바뀐다.
     */
    fun append(edited: Ontology, actorId: String, note: String?, restoredFrom: Int?, expectedVersion: Int): OntologySnapshot {
        check(TransactionSynchronizationManager.isActualTransactionActive() && TransactionSynchronizationManager.isSynchronizationActive()) {
            "온톨로지 버전은 쓰기 트랜잭션 안에서 만든다"
        }
        check(!TransactionSynchronizationManager.isCurrentTransactionReadOnly()) { "온톨로지 버전은 읽기 전용 트랜잭션에서 만들 수 없다" }
        // 다음 시작에서 로더가 읽을 모양(Claim predicate 선택지를 만든 뒤)으로 검사한다. 검사하지 않은 정의가 저장돼 읽지 못하는 일을 막는다
        val normalized = OntologyLoader.withDerivedClaimPredicate(edited)
        val errors = OntologyLoader.consistencyErrors(normalized)
        require(errors.isEmpty()) { errors.joinToString("\n") }

        val current = client.query(
            "MERGE (h:OntologyHead {key: \$key}) ON CREATE SET h.version = 0 SET h._lock = true RETURN h.version AS version",
        ).bind(HEAD_KEY).to("key").fetch().one().map { (it["version"] as Number).toInt() }.orElseThrow()
        if (current != expectedVersion) throw RevisionConflictException(expectedVersion.toLong(), current.toLong())

        val next = current + 1
        val yaml = OntologyLoader.toYaml(normalized.copy(schemaVersion = next.toString()))
        // 다음 시작에서 읽을 값과 같도록 저장한 yaml 을 다시 읽어 holder 에 넣는다
        val snapshot = OntologySnapshot(next, OntologyLoader.parse(yaml), Timestamps.now(), actorId, note, restoredFrom)
        client.query(
            """
            MATCH (h:OntologyHead {key: ${'$'}key})
            CREATE (:OntologyVersion {
              version: ${'$'}version, yaml: ${'$'}yaml, createdAt: ${'$'}createdAt, createdBy: ${'$'}createdBy,
              note: ${'$'}note, restoredFrom: ${'$'}restoredFrom
            })
            SET h.version = ${'$'}version
            REMOVE h._lock
            """,
        ).bindAll(
            params(
                "key" to HEAD_KEY, "version" to next.toLong(), "yaml" to yaml, "createdAt" to snapshot.createdAt,
                "createdBy" to actorId, "note" to note, "restoredFrom" to restoredFrom?.toLong(),
            ),
        ).run()
        TransactionSynchronizationManager.registerSynchronization(
            object : TransactionSynchronization {
                override fun afterCommit() = holder.replace(snapshot)
            },
        )
        return snapshot
    }

    /**
     * 시작 작업. 버전이 없으면 저장소 YAML 로 첫 버전을 만들고, 최신 버전의 코드 소유 부분을 저장소 값으로 맞춘 뒤 holder 를 채운다.
     * 최신 버전을 로더가 읽지 못하면 저장소 YAML 로 새 버전을 만든다. Neo4j 의 시간 초과나 연결 오류는 잡지 않고 시작을 멈춘다.
     * 일시적인 장애로 ADMIN 이 고친 정의를 저장소 YAML 로 밀어내지 않기 위해서다.
     */
    fun bootstrap(repo: Ontology) {
        write.executeWithoutResult {
            if (latestNumber() == 0) append(repo, BootstrapAdmin.SYSTEM_ACTOR, NOTE_FIRST, null, expectedVersion = 0)
            val row = latestRow() ?: error("온톨로지 버전을 만든 뒤에도 최신 버전이 없다")
            val latest = readOrNull(row)
            val effective = if (latest == null) {
                append(repo, BootstrapAdmin.SYSTEM_ACTOR, NOTE_UNREADABLE, null, latestNumber())
            } else {
                syncCodeOwned(latest, repo)
            }
            val repoOnly = (repo.nodeTypes.keys - effective.ontology.nodeTypes.keys).map { "nodeTypes.$it" } +
                (repo.relationshipTypes.keys - effective.ontology.relationshipTypes.keys).map { "relationshipTypes.$it" } +
                (repo.claimPredicates.keys - effective.ontology.claimPredicates.keys).map { "claimPredicates.$it" }
            if (repoOnly.isNotEmpty()) log.warn("저장소 YAML 에만 있는 온톨로지 항목: {}", repoOnly)
        }
        holder.replace(latest() ?: error("온톨로지 버전이 없다"))
    }

    private fun readOrNull(row: Map<String, Any?>): OntologySnapshot? = try {
        toSnapshot(row)
    } catch (e: IllegalArgumentException) {
        logUnreadable(row, e)
    } catch (e: DatabindException) {
        logUnreadable(row, e)
    } catch (e: StreamReadException) {
        logUnreadable(row, e)
    }

    private fun logUnreadable(row: Map<String, Any?>, e: Exception): OntologySnapshot? {
        log.error("저장된 최신 온톨로지 버전을 읽지 못해 저장소 YAML 로 새 버전을 만든다. 읽지 못한 버전: {}, 사유: {}", row["version"], e.message)
        return null
    }

    /** 코드가 소유하는 부분이 저장소와 다르면 그 부분만 바꾼 버전을 만든다. 합친 정의가 검사를 통과하지 못하면 최신 버전을 그대로 쓴다 */
    private fun syncCodeOwned(latest: OntologySnapshot, repo: Ontology): OntologySnapshot {
        val merged = CodeOwned.merge(latest.ontology, repo)
        if (merged == latest.ontology) return latest
        val errors = OntologyLoader.consistencyErrors(merged)
        if (errors.isNotEmpty()) {
            log.error("코드가 소유하는 항목을 갱신한 온톨로지가 검사를 통과하지 못해 최신 버전으로 시작한다. 최신 버전: {}, 오류: {}", latest.version, errors)
            return latest
        }
        return append(merged, BootstrapAdmin.SYSTEM_ACTOR, NOTE_CODE_OWNED, null, latest.version)
    }

    @Suppress("UNCHECKED_CAST")
    private fun latestRow(): Map<String, Any?>? =
        client.query("MATCH (v:OntologyVersion) RETURN properties(v) AS v ORDER BY v.version DESC LIMIT 1")
            .fetch().one().map { it["v"] as Map<String, Any?> }.orElse(null)

    private fun toSnapshot(row: Map<String, Any?>): OntologySnapshot {
        val s = toSummary(row)
        return OntologySnapshot(s.version, OntologyLoader.parse(row["yaml"] as String), s.createdAt, s.createdBy, s.note, s.restoredFrom)
    }

    private fun toSummary(row: Map<String, Any?>) = OntologyVersionSummary(
        version = (row["version"] as Number).toInt(),
        createdAt = row["createdAt"] as String,
        createdBy = row["createdBy"] as String,
        note = row["note"] as String?,
        restoredFrom = (row["restoredFrom"] as Number?)?.toInt(),
    )

    companion object {
        const val HEAD_KEY = "ontology"
        const val NOTE_FIRST = "저장소 YAML 로 만든 첫 버전"
        const val NOTE_UNREADABLE = "저장된 최신 버전을 읽지 못해 저장소 YAML 로 만든 버전"
        const val NOTE_CODE_OWNED = "코드가 소유하는 항목을 갱신"
    }
}
