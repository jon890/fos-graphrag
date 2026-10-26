package dev.fos.workbench.ontology

import dev.fos.workbench.auth.BootstrapAdmin
import dev.fos.workbench.auth.WorkbenchPrincipal
import dev.fos.workbench.config.Neo4jSchemaInitializer
import dev.fos.workbench.auth.UserRef
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper

data class OntologyVersionView(
    val version: Int,
    val createdAt: String,
    val createdBy: UserRef?,
    val note: String?,
    val restoredFrom: Int?,
)

data class OntologyVersionDetailView(
    val version: Int,
    val yaml: String,
    val createdAt: String,
    val createdBy: UserRef?,
    val note: String?,
    val restoredFrom: Int?,
)

/** 미리보기와 저장의 본문. `yaml` 과 `definition` 가운데 하나만 보낸다. `note`, `confirm` 은 저장만 읽는다 */
data class OntologyEditRequest(
    val baseVersion: Int,
    val yaml: String? = null,
    val definition: JsonNode? = null,
    val note: String? = null,
    val confirm: Boolean = false,
)

data class OntologyRestoreRequest(val baseVersion: Int, val note: String? = null, val confirm: Boolean = false)

/** 온톨로지 API. 최신 정의 읽기를 뺀 나머지는 ADMIN 만 부른다(SecurityConfig). docs/api-contract.md 의 「온톨로지」 */
@RestController
class OntologyController(
    private val holder: OntologyHolder,
    private val versions: OntologyVersionStore,
    private val edits: OntologyEditService,
    private val schemaInitializer: Neo4jSchemaInitializer,
    private val users: UserRepository,
    private val mapper: JsonMapper,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** 최신 버전의 정의에 version, versionCreatedAt, versionCreatedBy 를 더한다. schemaVersion 은 버전 번호의 문자열이다 */
    @GetMapping("/api/ontology")
    fun get(): Map<String, Any?> {
        val snapshot = holder.snapshot()
        @Suppress("UNCHECKED_CAST")
        val body = mapper.convertValue(snapshot.ontology, LinkedHashMap::class.java) as LinkedHashMap<String, Any?>
        body["version"] = snapshot.version
        body["versionCreatedAt"] = snapshot.createdAt
        body["versionCreatedBy"] = refsOf(listOf(snapshot.createdBy))[snapshot.createdBy]
        return body
    }

    @GetMapping("/api/ontology/versions")
    @Transactional(readOnly = true)
    fun list(@RequestParam(required = false) page: Int?, @RequestParam(required = false) size: Int?): Page<OntologyVersionView> {
        val result = versions.list(PageQuery.of(page, size))
        val refs = refsOf(result.items.map { it.createdBy })
        return Page(
            result.items.map { OntologyVersionView(it.version, it.createdAt, refs[it.createdBy], it.note, it.restoredFrom) },
            result.page, result.size, result.totalItems, result.totalPages,
        )
    }

    @GetMapping("/api/ontology/versions/{version}")
    @Transactional(readOnly = true)
    fun detail(@PathVariable version: Int): OntologyVersionDetailView {
        val found = versions.get(version) ?: throw NotFoundException(version.toString())
        val s = found.summary
        return OntologyVersionDetailView(s.version, found.yaml, s.createdAt, refsOf(listOf(s.createdBy))[s.createdBy], s.note, s.restoredFrom)
    }

    /** 최신 버전의 저장된 YAML 을 파일로 내려 준다 */
    @GetMapping("/api/ontology/export")
    @Transactional(readOnly = true)
    fun export(): ResponseEntity<String> {
        val latest = versions.latestNumber()
        val found = versions.get(latest) ?: throw NotFoundException(latest.toString())
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_TYPE, "application/yaml;charset=UTF-8")
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"financial-ontology-v$latest.yaml\"")
            .body(found.yaml)
    }

    @PostMapping("/api/ontology/preview")
    fun preview(@RequestBody body: OntologyEditRequest): OntologyPreview = edits.preview(EditInput(body.yaml, body.definition))

    @PostMapping("/api/ontology/versions")
    @ResponseStatus(HttpStatus.CREATED)
    fun save(
        @RequestBody body: OntologyEditRequest,
        @AuthenticationPrincipal user: WorkbenchPrincipal,
        response: HttpServletResponse,
    ): OntologyVersionView =
        saved(edits.save(body.baseVersion, EditInput(body.yaml, body.definition), body.note, body.confirm, user.id), response)

    @PostMapping("/api/ontology/versions/{version}/restore")
    @ResponseStatus(HttpStatus.CREATED)
    fun restore(
        @PathVariable version: Int,
        @RequestBody body: OntologyRestoreRequest,
        @AuthenticationPrincipal user: WorkbenchPrincipal,
        response: HttpServletResponse,
    ): OntologyVersionView = saved(edits.restore(version, body.baseVersion, body.note, body.confirm, user.id), response)

    /**
     * 저장 트랜잭션이 커밋된 뒤 새 관계 종류의 id 인덱스를 만든다. 실패해도 버전은 남기고 경고만 남긴다. 다음 시작이 다시 만든다.
     * 응답 헤더의 버전 번호는 필터가 요청 처음에 넣은 값을 새 번호로 바꾼다. 헤더를 더하면 값이 두 개가 된다.
     */
    private fun saved(result: SaveResult, response: HttpServletResponse): OntologyVersionView {
        if (result.newRelationshipTypes.isNotEmpty()) {
            try {
                schemaInitializer.ensureRelationshipIndexes(result.newRelationshipTypes)
            } catch (e: RuntimeException) {
                log.warn("새 관계 종류의 인덱스를 만들지 못했다. 다음 시작에서 다시 만든다. 관계 종류: {}, 사유: {}", result.newRelationshipTypes, e.message)
            }
        }
        val s = result.summary
        response.setHeader(OntologyVersionHeaderFilter.HEADER, s.version.toString())
        return OntologyVersionView(s.version, s.createdAt, refsOf(listOf(s.createdBy))[s.createdBy], s.note, s.restoredFrom)
    }

    /** 서버가 만든 버전의 작업자(system)는 사용자가 아니라 null 이다 */
    private fun refsOf(ids: Collection<String>): Map<String, UserRef> = users.findRefs(ids.filter { it != BootstrapAdmin.SYSTEM_ACTOR })
}
