package dev.fos.workbench.ontology

import dev.fos.workbench.auth.BootstrapAdmin
import dev.fos.workbench.auth.UserRef
import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
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

/** 온톨로지 조회 API. 목록과 상세, 내보내기는 ADMIN 만 부른다(SecurityConfig). docs/api-contract.md 의 「온톨로지」 */
@RestController
class OntologyController(
    private val holder: OntologyHolder,
    private val versions: OntologyVersionStore,
    private val users: UserRepository,
    private val mapper: JsonMapper,
) {

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

    /** 서버가 만든 버전의 작업자(system)는 사용자가 아니라 null 이다 */
    private fun refsOf(ids: Collection<String>): Map<String, UserRef> = users.findRefs(ids.filter { it != BootstrapAdmin.SYSTEM_ACTOR })
}
