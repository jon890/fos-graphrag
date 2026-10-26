package dev.fos.workbench.ontology

import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.race
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.net.URLEncoder

/**
 * 온톨로지 미리보기, 저장, 되돌리기. 다른 테스트 클래스와 컨텍스트와 Neo4j 를 함께 쓰므로 버전 번호를 상수로 단언하지 않는다.
 * 정의를 바꾼 테스트는 끝에 시작 번호의 내용으로 되돌린다. 타입과 관계 키에는 테스트마다 다른 영문 접미사를 붙인다.
 */
class OntologyEditIntegrationTest : IntegrationTest() {

    @Autowired lateinit var holder: OntologyHolder
    @Autowired lateinit var versions: OntologyVersionStore

    private var start = 0
    private val sfx = (1..6).map { ('A'..'Z').random() }.joinToString("")

    @BeforeEach
    fun syncHolder() {
        holder.replace(versions.latest()!!)
        start = versions.latestNumber()
    }

    @AfterEach
    fun restoreStartDefinition() {
        val latest = versions.latestNumber()
        if (latest == start) return
        val restored = loggedIn(ADMIN).post(
            "/api/ontology/versions/$start/restore",
            mapOf("baseVersion" to latest, "confirm" to true, "note" to "테스트가 바꾼 정의를 되돌림"),
        )
        // 테스트가 스스로 시작 번호로 되돌렸으면 바뀐 점이 없어 400 이다
        val unchanged = restored.status == 400 && restored.body["details"]["errors"].toString().contains("바뀐 점이 없습니다.")
        assertThat(restored.status == 201 || unchanged).describedAs(restored.body.toString()).isTrue()
    }

    @Test
    fun `EDITOR 는 미리보기와 저장을 부르지 못한다`() {
        val alice = loggedIn(ALICE)
        val body = mapOf("baseVersion" to start, "yaml" to OntologyLoader.toYaml(current()))
        listOf("/api/ontology/preview", "/api/ontology/versions").forEach { path ->
            val response = alice.post(path, body)
            assertThat(response.status).describedAs(path).isEqualTo(403)
            assertThat(response.code).describedAs(path).isEqualTo("FORBIDDEN")
        }
        assertThat(versions.latestNumber()).isEqualTo(start)
    }

    @Test
    fun `새 노드 타입을 저장하면 다음 요청부터 그 타입으로 만들고 이력이 남는다`() {
        val admin = loggedIn(ADMIN)
        val type = "Book$sfx"

        val saved = save(admin, withType(current(), type))

        assertThat(saved.status).describedAs(saved.body.toString()).isEqualTo(201)
        val version = saved.body["version"].asInt()
        assertThat(version).isEqualTo(start + 1).isEqualTo(versions.latestNumber())
        assertThat(saved.header("X-Ontology-Version")).isEqualTo(version.toString())
        assertThat(saved.headers.entries.first { it.key.equals("X-Ontology-Version", ignoreCase = true) }.value).hasSize(1)

        val alice = loggedIn(ALICE)
        val created = alice.post("/api/nodes", mapOf("type" to type, "properties" to mapOf("title" to "제목-$sfx")))
        assertThat(created.status).describedAs(created.body.toString()).isEqualTo(201)

        val event = admin.get("/api/changes?targetId=$version").body["items"].single()
        assertThat(event["targetKind"].asString()).isEqualTo("ONTOLOGY")
        assertThat(event["action"].asString()).isEqualTo("UPDATE")
        assertThat(event["changes"]["added"]["after"].toList().map { it.asString() }).containsExactly("nodeTypes.$type")
    }

    @Test
    fun `예전 baseVersion 이나 동시에 저장하면 하나만 저장된다`() {
        val admin = loggedIn(ADMIN)

        val stale = save(admin, withType(current(), "Stale$sfx"), base = start - 1)
        assertThat(stale.status).isEqualTo(409)
        assertThat(stale.code).isEqualTo("REVISION_CONFLICT")

        val first = withType(current(), "RaceA$sfx")
        val second = withType(current(), "RaceB$sfx")
        val results = race({ save(admin, first) }, { save(admin, second) })

        assertThat(results.map { it.status }.sorted()).describedAs(results.map { it.body }.toString()).containsExactly(201, 409)
        assertThat(versions.latestNumber()).isEqualTo(start + 1)
    }

    @Test
    fun `바뀐 점이 없는 정의는 저장하지 않는다`() {
        val admin = loggedIn(ADMIN)
        val preview = preview(admin, current())
        assertThat(preview.status).isEqualTo(200)
        assertThat(preview.body["valid"].asBoolean()).isTrue()
        listOf("added", "removed", "changed").forEach { assertThat(preview.body[it].isEmpty).describedAs(it).isTrue() }

        val saved = save(admin, current())

        assertThat(saved.status).isEqualTo(400)
        assertThat(saved.code).isEqualTo("ONTOLOGY_INVALID")
        assertThat(saved.body["details"]["errors"].toList().map { it.asString() }).containsExactly("바뀐 점이 없습니다.")
        assertThat(versions.latestNumber()).isEqualTo(start)
    }

    @Test
    fun `기존 타입에 필수 속성을 더하면 그 타입의 노드 수만큼 영향이 있다`() {
        val admin = loggedIn(ADMIN)
        Fixtures(loggedIn(ALICE)).node("Concept", mapOf("name" to "개념-$sfx", "summary" to "테스트"))
        val o = current()
        val concept = o.nodeTypes.getValue("Concept")
        val prop = "extra$sfx"
        val edited = o.copy(
            nodeTypes = o.nodeTypes + ("Concept" to concept.copy(properties = concept.properties + (prop to PropertyDef(PropertyType.STRING, label = "추가", required = true)))),
        )
        val concepts = count("MATCH (n:Knowledge) WHERE n.type = 'Concept' RETURN count(n) AS c")

        val preview = preview(admin, edited)

        assertThat(preview.status).isEqualTo(200)
        assertThat(impacts(preview)).contains(Triple("nodeTypes.Concept.properties.$prop", "NOW_REQUIRED", concepts))
    }

    @Test
    fun `주장 종류를 빼도 저장할 수 있고 남은 주장은 내용을 고칠 수 없지만 검토는 된다`() {
        val admin = loggedIn(ADMIN)
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val predicate = "TEST_$sfx"
        val o = current()
        val withPredicate = o.copy(
            claimPredicates = o.claimPredicates +
                (predicate to ClaimPredicateDef(label = "테스트 관계", description = "x", subjectTypes = listOf("Company"), objectTypes = listOf("Company"))),
        )
        assertThat(save(admin, withPredicate, confirm = true).status).isEqualTo(201)
        val claim = fx.claim(predicate, fx.company("주체").id, fx.company("대상").id, listOf(fx.document("근거").id))
        assertThat(claim.status).describedAs(claim.body.toString()).isEqualTo(201)

        val removed = current().let { it.copy(claimPredicates = it.claimPredicates - predicate) }
        val preview = preview(admin, removed)
        assertThat(preview.body["valid"].asBoolean()).describedAs(preview.body.toString()).isTrue()
        assertThat(impacts(preview)).contains(Triple("claimPredicates.$predicate", "REMOVED_CLAIM_PREDICATE", 1L))
        assertThat(save(admin, removed, confirm = true).status).isEqualTo(201)

        val patched = alice.patch("/api/claims/${claim.body.id}", mapOf("expectedRevision" to 1, "description" to "고친 설명"))
        assertThat(patched.status).isEqualTo(400)
        assertThat(patched.code).isEqualTo("ONTOLOGY_VIOLATION")
        val reviewed = loggedIn(BOB).post("/api/claims/${claim.body.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED"))
        assertThat(reviewed.status).describedAs(reviewed.body.toString()).isEqualTo(200)
    }

    @Test
    fun `값이 있는 속성을 빼면 확인해야 저장되고 그 속성은 응답과 수정에서 빠진다`() {
        val admin = loggedIn(ADMIN)
        val alice = loggedIn(ALICE)
        val prop = "memo$sfx"
        val o = current()
        val concept = o.nodeTypes.getValue("Concept")
        val withProp = o.copy(
            nodeTypes = o.nodeTypes + ("Concept" to concept.copy(properties = concept.properties + (prop to PropertyDef(PropertyType.STRING, label = "메모")))),
        )
        assertThat(save(admin, withProp).status).isEqualTo(201)
        val node = Fixtures(alice).node("Concept", mapOf("name" to "메모개념-$sfx", "summary" to "테스트", prop to "남는 값"))

        val removed = current().let { latest ->
            val c = latest.nodeTypes.getValue("Concept")
            latest.copy(nodeTypes = latest.nodeTypes + ("Concept" to c.copy(properties = c.properties - prop)))
        }
        assertThat(impacts(preview(admin, removed))).contains(Triple("nodeTypes.Concept.properties.$prop", "REMOVED_PROPERTY", 1L))

        val unconfirmed = save(admin, removed)
        assertThat(unconfirmed.status).isEqualTo(409)
        assertThat(unconfirmed.code).isEqualTo("ONTOLOGY_IMPACT_UNCONFIRMED")
        assertThat(unconfirmed.body["details"]["impacts"].toList().map { it["kind"].asString() }).contains("REMOVED_PROPERTY")
        assertThat(save(admin, removed, confirm = true).status).isEqualTo(201)

        val detail = alice.get("/api/nodes/${node.id}").body["node"]
        assertThat(detail["properties"].has(prop)).describedAs(detail.toString()).isFalse()
        val patched = alice.patch("/api/nodes/${node.id}", mapOf("expectedRevision" to 1, "properties" to mapOf(prop to "새 값")))
        assertThat(patched.status).isEqualTo(400)
        assertThat(patched.code).isEqualTo("ONTOLOGY_VIOLATION")
    }

    @Test
    fun `코드가 읽는 속성을 빼면 미리보기가 거짓이고 저장되지 않는다`() {
        val admin = loggedIn(ADMIN)
        val o = current()
        val document = o.nodeTypes.getValue("Document")
        val edited = o.copy(nodeTypes = o.nodeTypes + ("Document" to document.copy(properties = document.properties - "url")))

        val preview = preview(admin, edited)
        assertThat(preview.body["valid"].asBoolean()).isFalse()
        assertThat(preview.body["errors"].toString()).contains("Document.url")

        val saved = save(admin, edited, confirm = true)
        assertThat(saved.status).isEqualTo(400)
        assertThat(saved.code).isEqualTo("ONTOLOGY_INVALID")
        assertThat(versions.latestNumber()).isEqualTo(start)
    }

    @Test
    fun `코드가 소유하는 부분은 무시하고 저장소 값을 쓴다`() {
        val admin = loggedIn(ADMIN)
        val o = current()
        val draftOnly = o.copy(reviewStatuses = o.reviewStatuses + ("DRAFT" to LabelDef("바꾼 초안")))

        val preview = preview(admin, draftOnly)
        assertThat(preview.body["codeOwnedIgnored"].toList().map { it.asString() }).contains("reviewStatuses.DRAFT")
        listOf("added", "removed", "changed").forEach { assertThat(preview.body[it].isEmpty).describedAs(it).isTrue() }
        val unchanged = save(admin, draftOnly)
        assertThat(unchanged.status).isEqualTo(400)
        assertThat(unchanged.body["details"]["errors"].toList().map { it.asString() }).containsExactly("바뀐 점이 없습니다.")
        assertThat(versions.latestNumber()).isEqualTo(start)

        val companyLabel = "바꾼 기업-$sfx"
        val withCompany = draftOnly.copy(
            nodeTypes = draftOnly.nodeTypes + ("Company" to draftOnly.nodeTypes.getValue("Company").copy(label = companyLabel)),
        )
        assertThat(save(admin, withCompany).status).isEqualTo(201)
        val ontology = admin.get("/api/ontology").body
        assertThat(ontology["reviewStatuses"]["DRAFT"]["label"].asString()).isEqualTo(OntologyLoader.loadDefault().reviewStatuses.getValue("DRAFT").label)
        assertThat(ontology["nodeTypes"]["Company"]["label"].asString()).isEqualTo(companyLabel)
    }

    @Test
    fun `미리보기의 definition 을 다시 보내면 바뀐 점이 없다`() {
        val admin = loggedIn(ADMIN)
        val first = preview(admin, current())
        assertThat(first.body["definition"].isObject).isTrue()

        val again = admin.post("/api/ontology/preview", mapOf("baseVersion" to start, "definition" to first.body["definition"]))

        assertThat(again.status).describedAs(again.body.toString()).isEqualTo(200)
        assertThat(again.body["valid"].asBoolean()).describedAs(again.body["errors"].toString()).isTrue()
        listOf("added", "removed", "changed").forEach { assertThat(again.body[it].isEmpty).describedAs(it).isTrue() }
    }

    @Test
    fun `예전 버전으로 되돌리면 그 내용으로 새 버전을 만든다`() {
        val admin = loggedIn(ADMIN)
        assertThat(save(admin, withType(current(), "Undo$sfx")).status).isEqualTo(201)

        val restored = admin.post("/api/ontology/versions/$start/restore", mapOf("baseVersion" to versions.latestNumber(), "confirm" to true))

        assertThat(restored.status).describedAs(restored.body.toString()).isEqualTo(201)
        val version = restored.body["version"].asInt()
        assertThat(restored.body["restoredFrom"].asInt()).isEqualTo(start)
        assertThat(admin.get("/api/ontology/versions/$version").body["restoredFrom"].asInt()).isEqualTo(start)
        assertThat(admin.get("/api/changes?targetId=$version").body["items"].single()["action"].asString()).isEqualTo("RESTORE")
        assertThat(holder.current().nodeTypes).doesNotContainKey("Undo$sfx")
    }

    @Test
    fun `새 관계 종류를 저장하면 그 관계의 id 인덱스가 생긴다`() {
        val admin = loggedIn(ADMIN)
        val rel = "LINKS_$sfx"

        assertThat(save(admin, withRelationship(current(), rel)).status).isEqualTo(201)

        val names = neo4j.query("SHOW INDEXES YIELD name RETURN name").fetch().all().map { it["name"] as String }
        assertThat(names).contains("rel_${rel.lowercase()}_id")
    }

    @Test
    fun `타입을 빼도 그 타입의 노드는 읽히고 보관되지만 고칠 수 없다`() {
        val admin = loggedIn(ADMIN)
        val alice = loggedIn(ALICE)
        val type = "Item$sfx"
        val o = current()
        val item = NodeTypeDef(
            label = "항목", description = "x", labelProperty = "title",
            properties = mapOf(
                "title" to PropertyDef(PropertyType.STRING, label = "제목", required = true),
                "name" to PropertyDef(PropertyType.STRING, label = "이름"),
            ),
        )
        val withItem = o.copy(nodeTypes = o.nodeTypes + (type to item))
        assertThat(save(admin, withItem).status).isEqualTo(201)
        val title = "Title$sfx"
        val name = "이름-$sfx"
        val node = Fixtures(alice).node(type, mapOf("title" to title, "name" to name))

        val saved = save(admin, current().let { it.copy(nodeTypes = it.nodeTypes - type) }, confirm = true)
        assertThat(saved.status).describedAs(saved.body.toString()).isEqualTo(201)

        val detail = alice.get("/api/nodes/${node.id}")
        assertThat(detail.status).describedAs(detail.body.toString()).isEqualTo(200)
        assertThat(detail.body["node"]["label"].asString()).describedAs("정의가 없어 labelProperty 대신 name 이다").isEqualTo(name)
        assertThat(detail.body["node"]["properties"]["title"].asString()).isEqualTo(title)
        assertThat(detail.body["node"]["properties"]["name"].asString()).isEqualTo(name)
        val searched = alice.get("/api/nodes?q=${URLEncoder.encode(title, Charsets.UTF_8)}")
        assertThat(searched.status).describedAs(searched.body.toString()).isEqualTo(200)
        assertThat(searched.body["totalItems"].asLong()).isGreaterThanOrEqualTo(1)
        val filtered = alice.get("/api/nodes?types=$type")
        assertThat(filtered.status).describedAs(filtered.body.toString()).isEqualTo(200)
        assertThat(filtered.body["items"].toList().map { it.id }).contains(node.id)

        val patched = alice.patch("/api/nodes/${node.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("name" to "새 이름")))
        assertThat(patched.status).isEqualTo(400)
        assertThat(patched.code).isEqualTo("ONTOLOGY_VIOLATION")
        assertThat(patched.body["details"]["rule"].asString()).isEqualTo("unknown-node-type")
        val archived = alice.post("/api/nodes/${node.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(archived.status).describedAs(archived.body.toString()).isEqualTo(200)
    }

    @Test
    fun `관계 종류를 빼도 그 관계는 상세에 남고 보관할 수 없다`() {
        val admin = loggedIn(ADMIN)
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val rel = "LINKS_$sfx"
        assertThat(save(admin, withRelationship(current(), rel)).status).isEqualTo(201)
        val from = fx.node("Concept", mapOf("name" to "시작-$sfx", "summary" to "테스트"))
        val to = fx.node("Concept", mapOf("name" to "끝-$sfx", "summary" to "테스트"))
        val created = alice.post("/api/relationships", mapOf("type" to rel, "fromId" to from.id, "toId" to to.id))
        assertThat(created.status).describedAs(created.body.toString()).isEqualTo(201)

        val saved = save(admin, current().let { it.copy(relationshipTypes = it.relationshipTypes - rel) }, confirm = true)
        assertThat(saved.status).describedAs(saved.body.toString()).isEqualTo(201)

        val relationships = alice.get("/api/nodes/${from.id}").body["relationships"].toList()
        assertThat(relationships.map { it.id }).contains(created.body.id)
        val archived = alice.post("/api/relationships/${created.body.id}/archive", mapOf("expectedRevision" to 1))
        assertThat(archived.status).isEqualTo(404)
        assertThat(archived.code).isEqualTo("NOT_FOUND")
    }

    @Test
    fun `관계에 문장 틀을 더하면 바뀐 점에 나오고 저장하면 정의 응답에 있다`() {
        val admin = loggedIn(ADMIN)
        val o = current()
        val (rel, def) = o.relationshipTypes.entries.first()
        val sentence = "{from}이(가) {to}을(를) 잇는다 $sfx"
        val edited = o.copy(relationshipTypes = o.relationshipTypes + (rel to def.copy(sentence = sentence)))

        val preview = preview(admin, edited)

        assertThat(preview.body["valid"].asBoolean()).describedAs(preview.body.toString()).isTrue()
        assertThat(preview.body["changed"].toList().map { it.asString() }).contains("relationshipTypes.$rel.sentence")
        assertThat(save(admin, edited).status).isEqualTo(201)
        assertThat(admin.get("/api/ontology").body["relationshipTypes"][rel]["sentence"].asString()).isEqualTo(sentence)
    }

    @Test
    fun `관계 문장 틀에 시작 자리가 빠지면 미리보기가 거짓이다`() {
        val admin = loggedIn(ADMIN)
        val o = current()
        val (rel, def) = o.relationshipTypes.entries.first()
        val edited = o.copy(relationshipTypes = o.relationshipTypes + (rel to def.copy(sentence = "{to}을(를) 잇는다")))

        val preview = preview(admin, edited)

        assertThat(preview.status).isEqualTo(200)
        assertThat(preview.body["valid"].asBoolean()).isFalse()
        assertThat(preview.body["errors"].toList().map { it.asString() }).contains("$rel 의 sentence 는 {from} 과 {to} 를 한 번씩 담아야 한다")
        assertThat(versions.latestNumber()).isEqualTo(start)
    }

    @Test
    fun `온톨로지 본문은 512KiB 까지 받는다`() {
        val admin = loggedIn(ADMIN)
        val yaml = OntologyLoader.toYaml(current())
        fun padded(kib: Int) = yaml + "\n" + "# ${"x".repeat(1021)}\n".repeat(kib)

        val ok = admin.post("/api/ontology/preview", mapOf("baseVersion" to start, "yaml" to padded(100)))
        assertThat(ok.status).describedAs(ok.body.toString()).isEqualTo(200)

        val tooLarge = admin.post("/api/ontology/preview", mapOf("baseVersion" to start, "yaml" to padded(600)))
        assertThat(tooLarge.status).isEqualTo(413)
        assertThat(tooLarge.code).isEqualTo("PAYLOAD_TOO_LARGE")
    }

    private fun current(): Ontology = holder.current()

    private fun withType(o: Ontology, type: String): Ontology {
        val def = NodeTypeDef(
            label = "테스트 타입", description = "x", labelProperty = "title",
            properties = mapOf("title" to PropertyDef(PropertyType.STRING, label = "제목", required = true)),
        )
        return o.copy(nodeTypes = o.nodeTypes + (type to def))
    }

    private fun withRelationship(o: Ontology, rel: String): Ontology = o.copy(
        relationshipTypes = o.relationshipTypes +
            (rel to RelationshipTypeDef(label = "잇는다", description = "x", from = listOf("Concept"), to = listOf("Concept"))),
    )

    private fun preview(client: ApiClient, o: Ontology): ApiClient.Response =
        client.post("/api/ontology/preview", mapOf("baseVersion" to versions.latestNumber(), "yaml" to OntologyLoader.toYaml(o)))

    private fun save(client: ApiClient, o: Ontology, confirm: Boolean = false, base: Int = versions.latestNumber()): ApiClient.Response =
        client.post("/api/ontology/versions", mapOf("baseVersion" to base, "yaml" to OntologyLoader.toYaml(o), "confirm" to confirm))

    private fun impacts(response: ApiClient.Response): List<Triple<String, String, Long>> =
        response.body["impacts"].toList().map { Triple(it["path"].asString(), it["kind"].asString(), it["count"].asLong()) }

    private fun count(cypher: String): Long = neo4j.query(cypher).fetch().one().map { (it["c"] as Number).toLong() }.orElse(0L)
}
