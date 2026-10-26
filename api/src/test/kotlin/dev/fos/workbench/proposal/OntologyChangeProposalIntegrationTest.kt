package dev.fos.workbench.proposal

import dev.fos.workbench.auth.Role
import dev.fos.workbench.ontology.NodeTypeDef
import dev.fos.workbench.ontology.Ontology
import dev.fos.workbench.ontology.OntologyHolder
import dev.fos.workbench.ontology.OntologyLoader
import dev.fos.workbench.ontology.OntologyVersionStore
import dev.fos.workbench.ontology.PropertyDef
import dev.fos.workbench.ontology.PropertyType
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.web.ApiException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import tools.jackson.databind.JsonNode

/**
 * 온톨로지 변경 제안(`ONTOLOGY_CHANGE`)의 올리기와 승인. 다른 테스트 클래스와 Neo4j 를 함께 쓰므로 버전 번호를 상수로 단언하지 않는다.
 * 정의를 바꾼 테스트는 끝에 시작 번호의 내용으로 되돌린다. 타입 키에는 테스트마다 다른 영문 접미사를 붙이고, 테스트가 더한 타입과 속성만 지운다.
 */
class OntologyChangeProposalIntegrationTest : IntegrationTest() {

    @Autowired lateinit var proposals: ProposalService
    @Autowired lateinit var holder: OntologyHolder
    @Autowired lateinit var versions: OntologyVersionStore

    private val path = "/api/me/proposals"
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
        val unchanged = restored.status == 400 && restored.body["details"]["errors"].toString().contains("바뀐 점이 없습니다.")
        assertThat(restored.status == 201 || unchanged).describedAs(restored.body.toString()).isTrue()
    }

    private fun userId(email: String): String = users.findByEmail(email)!!.id

    private fun current(): Ontology = holder.current()

    private fun withType(o: Ontology, type: String, extra: Map<String, PropertyDef> = emptyMap()): Ontology {
        val def = NodeTypeDef(
            label = "테스트 타입", description = "x", labelProperty = "title",
            properties = mapOf("title" to PropertyDef(PropertyType.STRING, label = "제목", required = true)) + extra,
        )
        return o.copy(nodeTypes = o.nodeTypes + (type to def))
    }

    private fun change(yaml: String, base: Int = versions.latestNumber(), note: String? = null): Map<String, Any?> = buildMap {
        put("kind", "ONTOLOGY_CHANGE")
        put("payload", mapOf("baseVersion" to base, "yaml" to yaml, "note" to note))
        put("rationale", "합성 근거 문장")
    }

    private fun submitOne(ownerId: String, item: Map<String, Any?>): StoredProposal =
        proposals.submit(ownerId, "tok-1", "Hermes", listOf(item)).single().proposal

    private fun failure(block: () -> Any?): ApiException {
        val error = runCatching(block).exceptionOrNull()
        assertThat(error).describedAs("ApiException 이 나야 한다").isInstanceOf(ApiException::class.java)
        return error as ApiException
    }

    private fun accept(client: ApiClient, id: String, body: Map<String, Any?>? = null): ApiClient.Response = client.post("$path/$id/accept", body)

    private fun read(client: ApiClient, id: String): JsonNode {
        val response = client.get("$path?size=100")
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        return response.body["items"].toList().single { it["id"].asString() == id }
    }

    private fun proposalCount(ownerId: String): Long =
        neo4j.query("MATCH (p:Proposal {ownerId: \$id}) RETURN count(p) AS n").bind(ownerId).to("id").fetch().one().get()["n"] as Long

    @Suppress("UNCHECKED_CAST")
    private fun errorsOf(e: ApiException): List<String> = e.details["errors"] as List<String>

    @Test
    fun `틀린 정의, 바뀐 점이 없는 정의, 낡은 기준 버전은 올리지 않는다`() {
        val ownerId = userId(newUser(Role.EDITOR))

        val unknownKey = failure { submitOne(ownerId, change(OntologyLoader.toYaml(current()) + "\nunknownTopLevelKey: 1\n")) }
        assertThat(unknownKey.status.value()).isEqualTo(400)
        assertThat(unknownKey.code).isEqualTo("ONTOLOGY_INVALID")
        assertThat(errorsOf(unknownKey)).describedAs("줄 번호가 있어야 한다").anyMatch { it.contains("(줄 ") }

        val unchanged = failure { submitOne(ownerId, change(versions.get(start)!!.yaml)) }
        assertThat(unchanged.status.value()).isEqualTo(400)
        assertThat(unchanged.code).isEqualTo("ONTOLOGY_INVALID")
        assertThat(errorsOf(unchanged)).containsExactly("바뀐 점이 없습니다.")

        val stale = failure { submitOne(ownerId, change(OntologyLoader.toYaml(withType(current(), "Stale$sfx")), base = start - 1)) }
        assertThat(stale.status.value()).isEqualTo(409)
        assertThat(stale.code).isEqualTo("REVISION_CONFLICT")
        assertThat(stale.details["expectedRevision"]).isEqualTo((start - 1).toLong())
        assertThat(stale.details["currentRevision"]).isEqualTo(start.toLong())

        assertThat(proposalCount(ownerId)).describedAs("어느 경우에도 제안이 생기지 않는다").isZero()
        assertThat(versions.latestNumber()).isEqualTo(start)
    }

    @Test
    fun `yaml 과 definition 은 하나만 받고 definition 으로 올려도 정규화한 yaml 로 둔다`() {
        val ownerId = userId(newUser(Role.EDITOR))
        val edited = withType(current(), "Def$sfx")
        val definition = mapper.convertValue(edited, Map::class.java)

        val both = failure {
            submitOne(
                ownerId,
                mapOf(
                    "kind" to "ONTOLOGY_CHANGE", "rationale" to "합성 근거 문장",
                    "payload" to mapOf("baseVersion" to start, "yaml" to OntologyLoader.toYaml(edited), "definition" to definition),
                ),
            )
        }
        assertThat(both.code).isEqualTo("VALIDATION_FAILED")
        @Suppress("UNCHECKED_CAST")
        val fieldErrors = both.details["fieldErrors"] as Map<String, String>
        assertThat(fieldErrors).containsKey("proposals[0].payload.yaml")

        val created = submitOne(
            ownerId,
            mapOf("kind" to "ONTOLOGY_CHANGE", "rationale" to "합성 근거 문장", "payload" to mapOf("baseVersion" to start, "definition" to definition)),
        )

        assertThat(created.payload.keys).containsExactlyInAnyOrder("baseVersion", "yaml", "note")
        assertThat(OntologyLoader.parse(created.payload["yaml"] as String).nodeTypes).containsKey("Def$sfx")
    }

    @Test
    fun `EDITOR 는 온톨로지 변경 제안을 승인하지 못하고 오류를 남기지 않는다`() {
        val editorEmail = newUser(Role.EDITOR)
        val editor = loggedIn(editorEmail)
        val proposal = submitOne(userId(editorEmail), change(OntologyLoader.toYaml(withType(current(), "Editor$sfx"))))

        val forbidden = accept(editor, proposal.id)

        assertThat(forbidden.status).describedAs(forbidden.body.toString()).isEqualTo(403)
        assertThat(forbidden.code).isEqualTo("FORBIDDEN")
        assertThat(forbidden.body["message"].asString()).isEqualTo("관리자만 승인할 수 있습니다.")
        val after = read(editor, proposal.id)
        assertThat(after["status"].asString()).isEqualTo("PENDING")
        assertThat(after["lastError"].isNull).describedAs("권한 오류는 기록하지 않는다").isTrue()
        assertThat(after["requiredRole"].asString()).isEqualTo("ADMIN")
        assertThat(after["requiresEditor"].asBoolean()).isTrue()
        assertThat(versions.latestNumber()).isEqualTo(start)
    }

    @Test
    fun `올린 뒤 기준 버전이 바뀌면 승인하지 않고 덮어쓰지 않는다`() {
        val adminEmail = newUser(Role.ADMIN)
        val admin = loggedIn(adminEmail)
        val proposal = submitOne(userId(adminEmail), change(OntologyLoader.toYaml(withType(current(), "Late$sfx"))))
        val saved = admin.post(
            "/api/ontology/versions",
            mapOf("baseVersion" to start, "yaml" to OntologyLoader.toYaml(withType(current(), "First$sfx"))),
        )
        assertThat(saved.status).describedAs(saved.body.toString()).isEqualTo(201)

        val conflict = accept(admin, proposal.id)

        assertThat(conflict.status).describedAs(conflict.body.toString()).isEqualTo(409)
        assertThat(conflict.code).isEqualTo("REVISION_CONFLICT")
        assertThat(versions.latestNumber()).describedAs("버전 수가 그대로다").isEqualTo(start + 1)
        val after = read(admin, proposal.id)
        assertThat(after["status"].asString()).isEqualTo("PENDING")
        assertThat(after["lastError"]["code"].asString()).isEqualTo("REVISION_CONFLICT")
    }

    @Test
    fun `승인하면 새 버전이 생기고 메모와 승인한 사람이 이력에 남으며 새 타입으로 노드를 만든다`() {
        val adminEmail = newUser(Role.ADMIN)
        val admin = loggedIn(adminEmail)
        val type = "Book$sfx"
        val note = "제안 메모-$sfx"
        val proposal = submitOne(userId(adminEmail), change(OntologyLoader.toYaml(withType(current(), type)), note = note))

        val accepted = accept(admin, proposal.id)

        assertThat(accepted.status).describedAs(accepted.body.toString()).isEqualTo(200)
        assertThat(accepted.body["status"].asString()).isEqualTo("ACCEPTED")
        val version = accepted.body["result"]["ontologyVersion"].asInt()
        assertThat(version).isEqualTo(start + 1).isEqualTo(versions.latestNumber())
        assertThat(accepted.body["result"]["nodeIds"].isEmpty).isTrue()
        val header = accepted.headers.entries.first { it.key.equals("X-Ontology-Version", ignoreCase = true) }.value
        assertThat(header).describedAs("헤더 값이 하나다").containsExactly(version.toString())

        val latest = admin.get("/api/ontology/versions").body["items"][0]
        assertThat(latest["version"].asInt()).isEqualTo(version)
        assertThat(latest["note"].asString()).isEqualTo(note)
        val event = admin.get("/api/changes?targetId=$version").body["items"].toList().single { it["targetKind"].asString() == "ONTOLOGY" }
        assertThat(event["actor"]["email"].asString()).isEqualTo(adminEmail)

        val created = loggedIn(ALICE).post("/api/nodes", mapOf("type" to type, "properties" to mapOf("title" to "제목-$sfx")))
        assertThat(created.status).describedAs(created.body.toString()).isEqualTo(201)
    }

    @Test
    fun `노드가 쓰는 속성을 지우는 제안은 영향을 확인해야 승인한다`() {
        val adminEmail = newUser(Role.ADMIN)
        val admin = loggedIn(adminEmail)
        val type = "Memo$sfx"
        val withMemo = withType(current(), type, mapOf("memo" to PropertyDef(PropertyType.STRING, label = "메모")))
        val saved = admin.post("/api/ontology/versions", mapOf("baseVersion" to start, "yaml" to OntologyLoader.toYaml(withMemo)))
        assertThat(saved.status).describedAs(saved.body.toString()).isEqualTo(201)
        holder.replace(versions.latest()!!)
        val node = loggedIn(ALICE).post("/api/nodes", mapOf("type" to type, "properties" to mapOf("title" to "제목-$sfx", "memo" to "지울 메모")))
        assertThat(node.status).describedAs(node.body.toString()).isEqualTo(201)
        val proposal = submitOne(userId(adminEmail), change(OntologyLoader.toYaml(withType(current(), type))))

        val unconfirmed = accept(admin, proposal.id)
        assertThat(unconfirmed.status).describedAs(unconfirmed.body.toString()).isEqualTo(409)
        assertThat(unconfirmed.code).isEqualTo("ONTOLOGY_IMPACT_UNCONFIRMED")
        assertThat(versions.latestNumber()).isEqualTo(start + 1)

        val confirmed = accept(admin, proposal.id, mapOf("confirm" to true))
        assertThat(confirmed.status).describedAs(confirmed.body.toString()).isEqualTo(200)
        assertThat(confirmed.body["result"]["ontologyVersion"].asInt()).isEqualTo(start + 2)
    }

    @Test
    fun `온톨로지 변경 제안은 고쳐서 승인할 수 없다`() {
        val adminEmail = newUser(Role.ADMIN)
        val admin = loggedIn(adminEmail)
        val yaml = OntologyLoader.toYaml(withType(current(), "Edit$sfx"))
        val proposal = submitOne(userId(adminEmail), change(yaml))

        val edited = accept(admin, proposal.id, mapOf("payload" to mapOf("baseVersion" to start, "yaml" to yaml)))

        assertThat(edited.status).describedAs(edited.body.toString()).isEqualTo(400)
        assertThat(edited.code).isEqualTo("VALIDATION_FAILED")
        assertThat(edited.body["details"]["fieldErrors"].has("payload")).isTrue()
        val after = read(admin, proposal.id)
        assertThat(after["status"].asString()).isEqualTo("PENDING")
        assertThat(after["lastError"].isNull).isTrue()
        assertThat(versions.latestNumber()).isEqualTo(start)
    }
}
