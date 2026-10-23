package dev.fos.workbench.ontology

import dev.fos.workbench.config.Limits
import dev.fos.workbench.history.ChangeAction
import dev.fos.workbench.history.ChangeEventDraft
import dev.fos.workbench.history.ChangeEventRecorder
import dev.fos.workbench.history.FieldChange
import dev.fos.workbench.history.TargetKind
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.OntologyImpactUnconfirmedException
import dev.fos.workbench.web.OntologyInvalidException
import dev.fos.workbench.web.RevisionConflictException
import dev.fos.workbench.web.ValidationFailedException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.JsonNode

/** 편집기가 보낸 정의. YAML 이나 JSON 정의 가운데 하나만 있다 */
data class EditInput(val yaml: String?, val definition: JsonNode?)

/** docs/api-contract.md 의 `OntologyPreview` */
data class OntologyPreview(
    val valid: Boolean,
    val errors: List<String>,
    val added: List<String>,
    val removed: List<String>,
    val changed: List<String>,
    val impacts: List<OntologyImpact>,
    val codeOwnedIgnored: List<String>,
    val yaml: String?,
    val definition: Ontology?,
)

/** 저장한 버전과, 그 버전에서 새로 생겨 id 인덱스를 만들어야 하는 관계 종류 */
data class SaveResult(val summary: OntologyVersionSummary, val newRelationshipTypes: List<String>)

/**
 * 온톨로지 미리보기, 저장, 되돌리기. docs/data-schema.md 의 「온톨로지 버전」, docs/flow.md 의 「미리보기와 저장」.
 * 저장은 미리보기를 트랜잭션 안에서 다시 계산한다. 미리보기 뒤에 데이터가 바뀌어 영향이 새로 생겨도 확인 없이 저장되지 않게 하기 위해서다.
 * 새 관계 종류의 인덱스는 호출한 쪽이 트랜잭션 밖에서 만든다. Neo4j 는 한 트랜잭션에서 스키마와 데이터를 함께 바꾸지 못한다.
 */
@Service
class OntologyEditService(
    private val holder: OntologyHolder,
    private val versions: OntologyVersionStore,
    private val counter: OntologyImpactCounter,
    private val recorder: ChangeEventRecorder,
) {

    /** 저장하지 않고 바뀐 점과 영향을 돌려준다. 요청의 baseVersion 이 최신이 아니어도 답하므로 받지 않는다. 비교는 언제나 최신 버전과 한다 */
    @Transactional(readOnly = true)
    fun preview(input: EditInput): OntologyPreview {
        val latest = latestOntology(versions.latestNumber())
        val read = read(input, latest)
        val (ontology, errors) = when (read) {
            is EditRead.Valid -> read.ontology to emptyList()
            is EditRead.Invalid -> read.ontology to read.errors
        }
        if (ontology == null) {
            return OntologyPreview(false, errors, emptyList(), emptyList(), emptyList(), emptyList(), read.codeOwnedIgnored, null, null)
        }
        val diff = OntologyDiff.diff(latest, ontology)
        return OntologyPreview(
            valid = read is EditRead.Valid,
            errors = errors,
            added = diff.added,
            removed = diff.removed,
            changed = diff.changed,
            impacts = counter.count(latest, ontology),
            codeOwnedIgnored = read.codeOwnedIgnored,
            yaml = OntologyLoader.toYaml(ontology),
            definition = ontology,
        )
    }

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun save(baseVersion: Int, input: EditInput, note: String?, confirm: Boolean, actorId: String): SaveResult =
        saveInTransaction(baseVersion, input, note, confirm, actorId, restoredFrom = null)

    /** 그 버전의 YAML 로 새 버전을 만든다. 검사와 영향 확인은 저장과 같다 */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun restore(version: Int, baseVersion: Int, note: String?, confirm: Boolean, actorId: String): SaveResult {
        val found = versions.get(version) ?: throw NotFoundException(version.toString())
        return saveInTransaction(baseVersion, EditInput(found.yaml, null), note, confirm, actorId, restoredFrom = version)
    }

    /** [save] 와 [restore] 가 연 트랜잭션 안에서 부른다. 같은 클래스 안의 호출은 Spring 프록시를 거치지 않기 때문이다 */
    private fun saveInTransaction(
        baseVersion: Int,
        input: EditInput,
        note: String?,
        confirm: Boolean,
        actorId: String,
        restoredFrom: Int?,
    ): SaveResult {
        if (note != null && note.length > MAX_NOTE_LENGTH) throw ValidationFailedException(mapOf("note" to "${MAX_NOTE_LENGTH}자까지 적습니다."))
        val current = versions.latestNumber()
        val latest = latestOntology(current)
        val edited = when (val read = read(input, latest)) {
            is EditRead.Valid -> read.ontology
            is EditRead.Invalid -> throw OntologyInvalidException(read.errors)
        }
        val diff = OntologyDiff.diff(latest, edited)
        if (diff.isEmpty()) throw OntologyInvalidException(listOf("바뀐 점이 없습니다."))
        // append 도 OntologyHead 를 잠근 뒤 다시 확인한다. 여기서 먼저 보는 것은 영향을 세기 전에 낡은 요청을 돌려보내기 위해서다
        if (current != baseVersion) throw RevisionConflictException(baseVersion.toLong(), current.toLong())
        val impacts = counter.count(latest, edited)
        if (impacts.isNotEmpty() && !confirm) throw OntologyImpactUnconfirmedException(impacts)

        val snapshot = versions.append(edited, actorId, note, restoredFrom, baseVersion)
        val changes = buildMap {
            if (diff.added.isNotEmpty()) put("added", FieldChange(null, diff.added))
            if (diff.removed.isNotEmpty()) put("removed", FieldChange(diff.removed, null))
            if (diff.changed.isNotEmpty()) put("changed", FieldChange(null, diff.changed))
        }
        recorder.record(
            ChangeEventDraft(
                actorId, if (restoredFrom != null) ChangeAction.RESTORE else ChangeAction.UPDATE, snapshot.version.toString(),
                TargetKind.ONTOLOGY, TARGET_TYPE, "버전 ${snapshot.version}", snapshot.version.toLong(), changes, note,
            ),
        )
        return SaveResult(
            OntologyVersionSummary(snapshot.version, snapshot.createdAt, snapshot.createdBy, snapshot.note, snapshot.restoredFrom),
            (snapshot.ontology.allRelationshipTypes - latest.allRelationshipTypes).sorted(),
        )
    }

    private fun read(input: EditInput, latest: Ontology): EditRead = when {
        input.yaml != null && input.definition == null -> OntologyLoader.readEdited(input.yaml, latest)
        input.definition != null && input.yaml == null -> OntologyLoader.readEdited(input.definition, latest)
        else -> throw ValidationFailedException(mapOf("yaml" to "yaml 이나 definition 가운데 하나만 보냅니다."))
    }

    /** holder 가 그 번호를 들고 있으면 그것을, 커밋 직후라 아직 바뀌기 전이면 DB 에서 읽는다 */
    private fun latestOntology(number: Int): Ontology {
        val held = holder.snapshot()
        if (held.version == number) return held.ontology
        return (versions.latest() ?: throw IllegalStateException("온톨로지 버전이 없다")).ontology
    }

    companion object {
        const val MAX_NOTE_LENGTH = 1000
        const val TARGET_TYPE = "Ontology"
    }
}
