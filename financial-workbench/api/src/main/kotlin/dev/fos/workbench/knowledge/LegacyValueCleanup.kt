package dev.fos.workbench.knowledge

import dev.fos.workbench.auth.BootstrapAdmin
import dev.fos.workbench.config.Limits
import dev.fos.workbench.history.ChangeAction
import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.TargetKind
import dev.fos.workbench.history.diff
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.ontology.PropertyDef
import dev.fos.workbench.ontology.PropertyType
import org.slf4j.LoggerFactory
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

/**
 * 목록 밖 enum 값을 온톨로지의 values 와 valueAliases 로 고친다. docs/data-schema.md 의 「예전 값 정리」.
 * 보관된 노드와 managedBy 가 있는 타입은 건드리지 않는다. 고친 노드마다 system 작업자로 UPDATE 이력을 남긴다.
 */
@Component
class LegacyValueCleanup(
    private val client: Neo4jClient,
    private val holder: OntologyHolder,
    private val guard: RevisionGuard,
    private val recorder: ChangeEventRecorder,
    transactionManager: PlatformTransactionManager,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    private val readOnly = TransactionTemplate(transactionManager).apply {
        isReadOnly = true
        timeout = Limits.WRITE_TIMEOUT_SECONDS
    }

    /** 대상이 많아도 시간 제한에 걸려 전체가 롤백되지 않게 노드마다 따로 커밋한다 */
    private val perNode = TransactionTemplate(transactionManager).apply {
        timeout = Limits.WRITE_TIMEOUT_SECONDS
    }

    /** 고친 노드 수를 돌려준다. 여러 번 불러도 결과가 같다. 노드마다 트랜잭션 하나다 */
    fun run(): Int {
        val ontology = holder.current()
        // 처음부터 enum 이던 속성(market 등)은 대상이 아니다. valueAliases 가 있는 속성만 고친다.
        // market 을 고치면 (market, ticker) 유일성 제약에 걸려 시작이 멈출 수 있다.
        // 시작 작업이 holder 를 채운 뒤에 불리므로 빈을 만들 때가 아니라 여기서 계산한다
        val targets: Map<String, Map<String, PropertyDef>> = ontology.nodeTypes
            .filterValues { it.managedBy == null }
            .mapValues { (_, def) -> def.properties.filterValues { it.type == PropertyType.ENUM && it.valueAliases != null } }
            .filterValues { it.isNotEmpty() }
        val candidates = readOnly.execute { targets.map { (type, props) -> type to candidateIds(type, props) } }
        var fixed = 0
        candidates.forEach { (type, ids) ->
            val props = targets.getValue(type)
            ids.forEach { id -> if (perNode.execute { fix(ontology, id, type, props) } == true) fixed++ }
        }
        if (fixed > 0) log.info("온톨로지 목록 밖 값을 고친 노드: {}개", fixed)
        return fixed
    }

    // 타입 이름은 ontology.nodeTypes 의 키라 허용 목록 안이고, 속성 이름과 값 목록은 매개변수로 넘긴다
    private fun candidateIds(type: String, props: Map<String, PropertyDef>): List<String> =
        client.query(
            """
            MATCH (n:Knowledge)
            WHERE n.type = ${'$'}type AND n.archived = false
              AND any(p IN ${'$'}props WHERE n[p] IS NOT NULL AND NOT n[p] IN ${'$'}allowed[p])
            RETURN n.id AS id ORDER BY id
            """,
        ).bindAll(
            mapOf(
                "type" to type,
                "props" to props.keys.toList(),
                "allowed" to props.mapValues { (_, p) -> p.values.orEmpty() },
            ),
        ).fetch().all().map { it["id"] as String }

    /** 잠근 뒤 다시 읽은 값으로 판정한다. 고쳤으면 true */
    private fun fix(ontology: Ontology, id: String, type: String, props: Map<String, PropertyDef>): Boolean {
        val before = guard.lockNode(id)
        if (before["archived"] == true) {
            guard.unlockNode(id)
            return false
        }
        val changes = mutableMapOf<String, Any?>()
        props.forEach { (name, def) ->
            val raw = before[name] as? String ?: return@forEach
            if (raw in def.values.orEmpty()) return@forEach
            val canonical = def.canonicalEnumValue(raw)
            if (canonical != raw) changes[name] = canonical
        }
        if (changes.isEmpty()) {
            guard.unlockNode(id)
            return false
        }
        val after = guard.updateNode(id, changes, BootstrapAdmin.SYSTEM_ACTOR)
        recorder.record(
            ChangeEventDraft(
                BootstrapAdmin.SYSTEM_ACTOR, ChangeAction.UPDATE, id, TargetKind.NODE, type, ontology.labelOf(type, after),
                (after["revision"] as Number).toLong(), diff(before, changes), NOTE,
            ),
        )
        return true
    }

    companion object {
        const val NOTE = "온톨로지 목록에 맞춰 예전 값을 고쳤다"
    }
}
