package dev.fos.workbench.ontology

import dev.fos.workbench.auth.BootstrapAdmin
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.support.IntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

/**
 * 다른 테스트 클래스와 Neo4j 를 함께 쓰므로 버전 번호를 상수로 단언하지 않고, 시작할 때의 최신 번호와 비교한다.
 * 버전을 바꾼 테스트는 끝에 저장소 YAML 로 새 버전을 만들어 최신 정의를 되돌린다.
 */
class OntologyVersionIntegrationTest : IntegrationTest() {

    @Autowired lateinit var holder: OntologyHolder
    @Autowired lateinit var versions: OntologyVersionStore
    @Autowired lateinit var transactionManager: PlatformTransactionManager

    private val repo = OntologyLoader.loadDefault()
    private var changed = false

    @BeforeEach
    fun syncHolder() {
        holder.replace(versions.latest()!!)
    }

    @AfterEach
    fun restoreRepoDefinition() {
        if (changed) append(repo, "테스트가 바꾼 정의를 저장소 YAML 로 되돌림")
    }

    @Test
    fun `시작 작업을 다시 불러도 버전이 늘지 않는다`() {
        versions.bootstrap(repo)
        val before = versions.latestNumber()

        versions.bootstrap(repo)

        assertThat(versions.latestNumber()).isEqualTo(before)
    }

    @Test
    fun `저장소에만 있는 주장 종류가 있어도 시작이 멈추지 않고 편집한 쪽이 이긴다`() {
        val current = holder.current()
        append(current.copy(claimPredicates = current.claimPredicates - "CRITICIZES"), "주장 종류 빼기")
        val edited = versions.latestNumber()

        versions.bootstrap(repo)

        assertThat(versions.latestNumber()).describedAs("코드 소유 부분은 그대로라 새 버전이 없다").isEqualTo(edited)
        val predicate = versions.latest()!!.ontology.nodeTypes.getValue("Claim").properties.getValue("predicate")
        assertThat(predicate.values).doesNotContain("CRITICIZES").contains("BELONGS_TO_SECTOR")
        assertThat(holder.current().claimPredicates).doesNotContainKey("CRITICIZES")
    }

    @Test
    fun `읽지 못하는 최신 버전이 있으면 저장소 YAML 로 새 버전을 만들고 읽지 못한 버전은 남긴다`() {
        changed = true
        val broken = versions.latestNumber() + 1
        val brokenYaml = OntologyLoader.toYaml(repo) + "\nunknownTopLevelKey: 1\n"
        neo4j.query(
            """
            MATCH (h:OntologyHead {key: 'ontology'})
            SET h.version = ${'$'}version
            CREATE (:OntologyVersion {version: ${'$'}version, yaml: ${'$'}yaml, createdAt: ${'$'}now, createdBy: 'system'})
            """,
        ).bindAll(mapOf("version" to broken.toLong(), "yaml" to brokenYaml, "now" to Timestamps.now())).run()

        versions.bootstrap(repo)

        assertThat(versions.latestNumber()).isEqualTo(broken + 1)
        assertThat(versions.get(broken + 1)?.summary?.note).isEqualTo(OntologyVersionStore.NOTE_UNREADABLE)
        assertThat(holder.snapshot().version).isEqualTo(broken + 1)
        val kept = loggedIn(ADMIN).get("/api/ontology/versions/$broken")
        assertThat(kept.status).describedAs(kept.body.toString()).isEqualTo(200)
        assertThat(kept.body["yaml"].asString()).isEqualTo(brokenYaml)
    }

    @Test
    fun `최신 버전의 코드 소유 부분이 저장소와 다르면 그 부분만 바꾼 버전을 만든다`() {
        val current = holder.current()
        append(current.copy(reviewStatuses = current.reviewStatuses + ("DRAFT" to LabelDef("바꾼 초안"))), "검토 상태 이름 바꾸기")
        val edited = versions.latestNumber()

        versions.bootstrap(repo)

        assertThat(versions.latestNumber()).isEqualTo(edited + 1)
        assertThat(versions.get(edited + 1)?.summary?.note).isEqualTo(OntologyVersionStore.NOTE_CODE_OWNED)
        assertThat(holder.current().reviewStatuses.getValue("DRAFT").label).isEqualTo(repo.reviewStatuses.getValue("DRAFT").label)
    }

    @Test
    fun `온톨로지 응답과 헤더에 최신 버전 번호가 있다`() {
        val response = loggedIn(VIEWER).get("/api/ontology")

        assertThat(response.status).isEqualTo(200)
        val version = response.body["version"]
        assertThat(version.isInt).describedAs("version 은 정수다: $version").isTrue()
        assertThat(version.asInt()).isEqualTo(versions.latestNumber())
        assertThat(response.body["schemaVersion"].asString()).isEqualTo(version.asInt().toString())
        assertThat(response.header("X-Ontology-Version")).isEqualTo(version.asInt().toString())
        assertThat(response.body.has("versionCreatedAt")).isTrue()

        val anonymous = anonymous().get("/api/ontology")
        assertThat(anonymous.status).isEqualTo(401)
        assertThat(anonymous.header("X-Ontology-Version")).isEqualTo(version.asInt().toString())
    }

    @Test
    fun `ADMIN 은 버전 목록과 YAML 을 읽고 내보낸다`() {
        val admin = loggedIn(ADMIN)
        val latest = versions.latestNumber()

        val list = admin.get("/api/ontology/versions?size=5")
        assertThat(list.status).describedAs(list.body.toString()).isEqualTo(200)
        assertThat(list.body["items"][0]["version"].asInt()).isEqualTo(latest)

        val detail = admin.get("/api/ontology/versions/$latest")
        assertThat(detail.status).isEqualTo(200)
        assertThat(OntologyLoader.parse(detail.body["yaml"].asString()).schemaVersion).isEqualTo(latest.toString())

        val export = admin.get("/api/ontology/export")
        assertThat(export.status).isEqualTo(200)
        assertThat(export.header("Content-Disposition")).contains("financial-ontology-v$latest.yaml")
        assertThat(export.header("Content-Type")).startsWith("application/yaml")

        assertThat(admin.get("/api/ontology/versions/999999").status).isEqualTo(404)
    }

    @Test
    fun `EDITOR 는 버전 목록과 내보내기를 읽지 못하고 VIEWER 도 최신 온톨로지는 읽는다`() {
        val alice = loggedIn(ALICE)
        listOf("/api/ontology/versions", "/api/ontology/export").forEach { path ->
            val response = alice.get(path)
            assertThat(response.status).describedAs(path).isEqualTo(403)
            assertThat(response.code).describedAs(path).isEqualTo("FORBIDDEN")
        }
        assertThat(loggedIn(VIEWER).get("/api/ontology").status).isEqualTo(200)
    }

    private fun append(o: Ontology, note: String) {
        changed = true
        TransactionTemplate(transactionManager).executeWithoutResult {
            versions.append(o, BootstrapAdmin.SYSTEM_ACTOR, note, null, versions.latestNumber())
        }
    }
}
