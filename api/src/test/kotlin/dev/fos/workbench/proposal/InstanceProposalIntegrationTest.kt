package dev.fos.workbench.proposal

import dev.fos.workbench.auth.Role
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import dev.fos.workbench.web.ApiException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import tools.jackson.databind.JsonNode

/** 항목 고치기, 항목과 관계 보관, 주장 만들기 제안을 실제 Neo4j 로 확인한다 */
class InstanceProposalIntegrationTest : IntegrationTest() {

    @Autowired lateinit var proposals: ProposalService

    private val path = "/api/me/proposals"

    private fun userId(email: String): String = users.findByEmail(email)!!.id

    private fun item(kind: String, payload: Any?): Map<String, Any?> =
        mapOf("kind" to kind, "payload" to payload, "rationale" to "합성 근거 문장")

    private fun submitOne(ownerId: String, item: Map<String, Any?>): StoredProposal =
        proposals.submit(ownerId, "tok-1", "Hermes", listOf(item)).single().proposal

    private fun failure(block: () -> Any?): ApiException {
        val error = runCatching(block).exceptionOrNull()
        assertThat(error).describedAs("ApiException 이 나야 한다").isInstanceOf(ApiException::class.java)
        return error as ApiException
    }

    @Suppress("UNCHECKED_CAST")
    private fun fieldErrors(e: ApiException): Map<String, String> = e.details["fieldErrors"] as Map<String, String>

    private fun accept(client: ApiClient, id: String): ApiClient.Response = client.post("$path/$id/accept", null)

    private fun read(client: ApiClient, id: String): JsonNode {
        val response = client.get("$path?size=100")
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        return response.body["items"].toList().single { it["id"].asString() == id }
    }

    private fun editor(): Triple<String, ApiClient, String> {
        val email = newUser(Role.EDITOR)
        return Triple(email, loggedIn(email), userId(email))
    }

    private fun relationship(client: ApiClient, type: String, fromId: String, toId: String): JsonNode {
        val response = client.post("/api/relationships", mapOf("type" to type, "fromId" to fromId, "toId" to toId))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return response.body
    }

    private fun claimPayload(subjectId: String, objectId: String, documentIds: List<String>): Map<String, Any?> = mapOf(
        "predicate" to "BELONGS_TO_SECTOR", "subjectId" to subjectId, "objectId" to objectId, "documentIds" to documentIds,
        "description" to "에이전트가 읽은 주장", "evidenceText" to "당사는 해당 업종에 속한다.",
    )

    @Test
    fun `항목 고치기를 승인하면 속성이 바뀌고 revision 이 오르며 승인한 사람이 이력에 남는다`() {
        val fixtures = Fixtures(loggedIn(ALICE))
        val (ownerEmail, owner, ownerId) = editor()
        val company = fixtures.company("고칠 기업")
        val name = "고친 이름-${fixtures.suffix}"

        val proposal = submitOne(
            ownerId, item("UPDATE_NODE", mapOf("nodeId" to company.id, "expectedRevision" to company.revision, "properties" to mapOf("name" to name))),
        )
        val pending = read(owner, proposal.id)
        assertThat(pending["requiredRole"].asString()).isEqualTo("EDITOR")
        assertThat(pending["refs"]["nodes"][company.id]["type"].asString()).isEqualTo("Company")

        val accepted = accept(owner, proposal.id)
        assertThat(accepted.status).describedAs(accepted.body.toString()).isEqualTo(200)
        assertThat(accepted.body["result"]["nodeIds"].toList().map { it.asString() }).containsExactly(company.id)
        val node = owner.get("/api/nodes/${company.id}").body["node"]
        assertThat(node["properties"]["name"].asString()).isEqualTo(name)
        assertThat(node["revision"].asLong()).isEqualTo(company.revision + 1)
        val update = owner.get("/api/changes?targetId=${company.id}").body["items"].toList().single { it["action"].asString() == "UPDATE" }
        assertThat(update["actor"]["email"].asString()).isEqualTo(ownerEmail)
    }

    @Test
    fun `올린 뒤 사람이 그 항목을 고치면 고치기 승인은 REVISION_CONFLICT 이고 마지막 오류가 남는다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val (_, owner, ownerId) = editor()
        val company = fixtures.company("경합 기업")
        val proposal = submitOne(
            ownerId,
            item("UPDATE_NODE", mapOf("nodeId" to company.id, "expectedRevision" to company.revision, "properties" to mapOf("name" to "에이전트-${fixtures.suffix}"))),
        )
        val humanName = "사람-${fixtures.suffix}"
        val patched = alice.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to company.revision, "properties" to mapOf("name" to humanName)))
        assertThat(patched.status).describedAs(patched.body.toString()).isEqualTo(200)

        val conflict = accept(owner, proposal.id)
        assertThat(conflict.status).describedAs(conflict.body.toString()).isEqualTo(409)
        assertThat(conflict.code).isEqualTo("REVISION_CONFLICT")
        val reread = read(owner, proposal.id)
        assertThat(reread["status"].asString()).isEqualTo("PENDING")
        assertThat(reread["lastError"]["code"].asString()).isEqualTo("REVISION_CONFLICT")
        assertThat(owner.get("/api/nodes/${company.id}").body["node"]["properties"]["name"].asString())
            .describedAs("사람이 고친 값을 덮어쓰지 않는다").isEqualTo(humanName)
    }

    @Test
    fun `항목 고치기는 Claim 과 알 수 없는 속성과 틀린 값을 올릴 때 거절한다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val (_, _, ownerId) = editor()
        val company = fixtures.company("주장 주체")
        val sector = fixtures.sector("주장 업종")
        val document = fixtures.document("주장 근거")
        val claim = fixtures.claim("BELONGS_TO_SECTOR", company.id, sector.id, listOf(document.id))
        assertThat(claim.status).describedAs(claim.body.toString()).isEqualTo(201)

        fun update(nodeId: String, revision: Long, properties: Map<String, Any?>) =
            item("UPDATE_NODE", mapOf("nodeId" to nodeId, "expectedRevision" to revision, "properties" to properties))

        val onClaim = failure { submitOne(ownerId, update(claim.body.id, claim.body.revision, mapOf("description" to "고침"))) }
        assertThat(onClaim.status.value()).isEqualTo(400)
        assertThat(onClaim.code).isEqualTo("ONTOLOGY_VIOLATION")
        assertThat(onClaim.details["rule"]).isEqualTo("claim-via-claims-api")

        // PATCH /api/nodes/{id} 와 같이 정의에 없는 속성은 온톨로지 위반이다
        val unknown = failure { submitOne(ownerId, update(company.id, company.revision, mapOf("nickname" to "x"))) }
        assertThat(unknown.code).isEqualTo("ONTOLOGY_VIOLATION")
        assertThat(unknown.details["rule"]).isEqualTo("unknown-property")

        val wrongType = failure { submitOne(ownerId, update(company.id, company.revision, mapOf("name" to 123))) }
        assertThat(wrongType.status.value()).isEqualTo(400)
        assertThat(wrongType.code).isEqualTo("VALIDATION_FAILED")
        assertThat(fieldErrors(wrongType)).containsKey("proposals[0].payload.properties.name")

        val empty = failure { submitOne(ownerId, update(company.id, company.revision, emptyMap())) }
        assertThat(fieldErrors(empty)).containsKey("proposals[0].payload.properties")

        val stale = failure { submitOne(ownerId, update(company.id, company.revision + 1, mapOf("name" to "x"))) }
        assertThat(stale.code).isEqualTo("REVISION_CONFLICT")
    }

    @Test
    fun `같은 시장과 종목 코드로 바꾸는 고치기는 올릴 때 DUPLICATE 이고 자기 값은 그대로 둘 수 있다`() {
        val fixtures = Fixtures(loggedIn(ALICE))
        val (_, _, ownerId) = editor()
        val first = fixtures.security("첫 종목", ticker = "A${fixtures.suffix}")
        val second = fixtures.security("둘째 종목", ticker = "B${fixtures.suffix}")

        val duplicate = failure {
            submitOne(
                ownerId,
                item("UPDATE_NODE", mapOf("nodeId" to second.id, "expectedRevision" to second.revision, "properties" to mapOf("ticker" to "A${fixtures.suffix}"))),
            )
        }
        assertThat(duplicate.code).isEqualTo("DUPLICATE")

        val same = submitOne(
            ownerId,
            item("UPDATE_NODE", mapOf("nodeId" to first.id, "expectedRevision" to first.revision, "properties" to mapOf("ticker" to "A${fixtures.suffix}"))),
        )
        assertThat(same.status).isEqualTo("PENDING")
    }

    @Test
    fun `항목 보관을 승인하면 보관되고 이미 보관된 항목은 지금 revision 으로 올려도 ARCHIVED 다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val (_, owner, ownerId) = editor()
        val company = fixtures.company("보관할 기업")

        val proposal = submitOne(
            ownerId, item("ARCHIVE_NODE", mapOf("nodeId" to company.id, "expectedRevision" to company.revision, "reason" to "중복 항목")),
        )
        val accepted = accept(owner, proposal.id)
        assertThat(accepted.status).describedAs(accepted.body.toString()).isEqualTo(200)
        assertThat(accepted.body["result"]["nodeIds"].toList().map { it.asString() }).containsExactly(company.id)
        val node = owner.get("/api/nodes/${company.id}").body["node"]
        assertThat(node["archived"].asBoolean()).isTrue()
        val archive = owner.get("/api/changes?targetId=${company.id}").body["items"].toList().single { it["action"].asString() == "ARCHIVE" }
        assertThat(archive["note"].asString()).isEqualTo("중복 항목")

        val again = failure {
            submitOne(ownerId, item("ARCHIVE_NODE", mapOf("nodeId" to company.id, "expectedRevision" to node["revision"].asLong())))
        }
        assertThat(again.status.value()).isEqualTo(409)
        assertThat(again.code).isEqualTo("ARCHIVED")

        val tooLong = failure {
            submitOne(ownerId, item("ARCHIVE_NODE", mapOf("nodeId" to company.id, "expectedRevision" to 1, "reason" to "가".repeat(1001))))
        }
        assertThat(fieldErrors(tooLong)).containsKey("proposals[0].payload.reason")
        val negative = failure { submitOne(ownerId, item("ARCHIVE_NODE", mapOf("nodeId" to company.id, "expectedRevision" to -1))) }
        assertThat(fieldErrors(negative)).containsKey("proposals[0].payload.expectedRevision")
    }

    @Test
    fun `관계 보관을 승인하면 관계가 보관되고 refs 에 그 관계와 양 끝 항목이 있다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val (_, owner, ownerId) = editor()
        val company = fixtures.company("발행 기업")
        val security = fixtures.security("발행 종목")
        val issues = relationship(alice, "ISSUES", company.id, security.id)

        val proposal = submitOne(ownerId, item("ARCHIVE_RELATIONSHIP", mapOf("relationshipId" to issues.id)))
        val pending = read(owner, proposal.id)
        assertThat(pending["refs"]["relationships"][issues.id]["type"].asString()).isEqualTo("ISSUES")
        assertThat(pending["refs"]["nodes"][company.id]["type"].asString()).isEqualTo("Company")
        assertThat(pending["refs"]["nodes"][security.id]["type"].asString()).isEqualTo("Security")

        val accepted = accept(owner, proposal.id)
        assertThat(accepted.status).describedAs(accepted.body.toString()).isEqualTo(200)
        assertThat(accepted.body["result"]["relationshipIds"].toList().map { it.asString() }).containsExactly(issues.id)
        assertThat(accepted.body["refs"]["relationships"][issues.id]["archived"].asBoolean()).isTrue()
        val active = owner.get("/api/nodes/${company.id}").body["relationships"].toList()
            .filter { it["id"].asString() == issues.id && !it["archived"].asBoolean() }
        assertThat(active).describedAs("보관한 관계는 활성으로 남지 않는다").isEmpty()
    }

    @Test
    fun `주장 관계를 보관하는 제안은 올릴 때 claim-relationship 으로 거절한다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val (_, _, ownerId) = editor()
        val company = fixtures.company("주장 관계 기업")
        val sector = fixtures.sector("주장 관계 업종")
        val document = fixtures.document("주장 관계 근거")
        val claim = fixtures.claim("BELONGS_TO_SECTOR", company.id, sector.id, listOf(document.id))
        assertThat(claim.status).describedAs(claim.body.toString()).isEqualTo(201)
        val subjectId = neo4j.query("MATCH (:Knowledge:Claim {id: \$id})-[r:SUBJECT]->() RETURN r.id AS id")
            .bind(claim.body.id).to("id").fetch().one().get()["id"] as String

        val rejected = failure { submitOne(ownerId, item("ARCHIVE_RELATIONSHIP", mapOf("relationshipId" to subjectId))) }
        assertThat(rejected.status.value()).isEqualTo(400)
        assertThat(rejected.code).isEqualTo("ONTOLOGY_VIOLATION")
        assertThat(rejected.details["rule"]).isEqualTo("claim-relationship")

        val missing = failure { submitOne(ownerId, item("ARCHIVE_RELATIONSHIP", mapOf("relationshipId" to "no-such-relationship"))) }
        assertThat(missing.code).isEqualTo("NOT_FOUND")
    }

    @Test
    fun `주장 만들기를 승인하면 AI 가 쓴 DRAFT 주장이 생기고 작성자는 승인한 사람이다`() {
        val fixtures = Fixtures(loggedIn(ALICE))
        val (ownerEmail, owner, ownerId) = editor()
        val company = fixtures.company("제안 주장 기업")
        val sector = fixtures.sector("제안 주장 업종")
        val document = fixtures.document("제안 주장 근거")

        val proposal = submitOne(ownerId, item("CREATE_CLAIM", claimPayload(company.id, sector.id, listOf(document.id))))
        val pending = read(owner, proposal.id)
        assertThat(pending["refs"]["nodes"][document.id]["type"].asString()).isEqualTo("Document")
        assertThat(pending["refs"]["nodes"][sector.id]["type"].asString()).isEqualTo("Sector")

        val accepted = accept(owner, proposal.id)
        assertThat(accepted.status).describedAs(accepted.body.toString()).isEqualTo(200)
        val claimId = accepted.body["result"]["nodeIds"].single().asString()
        val claim = owner.get("/api/claims/$claimId").body
        assertThat(claim["reviewStatus"].asString()).isEqualTo("DRAFT")
        assertThat(claim["properties"]["authoringMethod"].asString()).isEqualTo("AI")
        assertThat(claim["createdBy"]["email"].asString()).isEqualTo(ownerEmail)
        assertThat(claim["subject"]["id"].asString()).isEqualTo(company.id)
        assertThat(claim["documents"].toList().map { it["id"].asString() }).containsExactly(document.id)
    }

    @Test
    fun `주장 만들기는 근거 문서가 없거나 Document 가 아니거나 기간이 거꾸로면 올릴 때 거절한다`() {
        val fixtures = Fixtures(loggedIn(ALICE))
        val (_, _, ownerId) = editor()
        val company = fixtures.company("거절 주장 기업")
        val sector = fixtures.sector("거절 주장 업종")
        val document = fixtures.document("거절 주장 근거")

        val noDocument = failure { submitOne(ownerId, item("CREATE_CLAIM", claimPayload(company.id, sector.id, emptyList()))) }
        assertThat(noDocument.status.value()).isEqualTo(400)
        assertThat(noDocument.code).isEqualTo("VALIDATION_FAILED")
        assertThat(fieldErrors(noDocument)).containsKey("proposals[0].payload.documentIds")

        val notDocument = failure { submitOne(ownerId, item("CREATE_CLAIM", claimPayload(company.id, sector.id, listOf(company.id)))) }
        assertThat(notDocument.code).isEqualTo("ONTOLOGY_VIOLATION")
        assertThat(notDocument.details["rule"]).isEqualTo("claim-evidence-type")

        val reversed = failure {
            submitOne(
                ownerId,
                item("CREATE_CLAIM", claimPayload(company.id, sector.id, listOf(document.id)) + mapOf("validFrom" to "2026-10-01", "validTo" to "2026-09-01")),
            )
        }
        assertThat(reversed.code).isEqualTo("VALIDATION_FAILED")
        assertThat(fieldErrors(reversed)).containsKey("proposals[0].payload.validTo")
    }

    @Test
    fun `열람자는 고치기, 보관, 주장 만들기 제안을 승인하지 못한다`() {
        val alice = loggedIn(ALICE)
        val fixtures = Fixtures(alice)
        val viewerEmail = newUser(Role.VIEWER)
        val viewer = loggedIn(viewerEmail)
        val viewerId = userId(viewerEmail)
        val company = fixtures.company("열람자 기업")
        val security = fixtures.security("열람자 종목")
        val sector = fixtures.sector("열람자 업종")
        val document = fixtures.document("열람자 근거")
        val issues = relationship(alice, "ISSUES", company.id, security.id)

        val items = listOf(
            item("UPDATE_NODE", mapOf("nodeId" to company.id, "expectedRevision" to company.revision, "properties" to mapOf("name" to "열람자 고침"))),
            item("ARCHIVE_NODE", mapOf("nodeId" to security.id, "expectedRevision" to security.revision)),
            item("ARCHIVE_RELATIONSHIP", mapOf("relationshipId" to issues.id)),
            item("CREATE_CLAIM", claimPayload(company.id, sector.id, listOf(document.id))),
        )
        items.forEach { proposalItem ->
            val proposal = submitOne(viewerId, proposalItem)
            val forbidden = accept(viewer, proposal.id)
            assertThat(forbidden.status).describedAs("${proposalItem["kind"]}: ${forbidden.body}").isEqualTo(403)
            assertThat(forbidden.code).isEqualTo("FORBIDDEN")
            val reread = read(viewer, proposal.id)
            assertThat(reread["status"].asString()).isEqualTo("PENDING")
            assertThat(reread["requiredRole"].asString()).describedAs(proposalItem["kind"].toString()).isEqualTo("EDITOR")
        }
        assertThat(viewer.get("/api/nodes/${security.id}").body["node"]["archived"].asBoolean()).isFalse()
    }
}
