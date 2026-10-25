package dev.fos.workbench.agent

import dev.fos.workbench.auth.Role
import dev.fos.workbench.ontology.OntologyLoader
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode
import java.net.URLEncoder

class AgentReadIntegrationTest : IntegrationTest() {

    /** 조회 전용 사용자의 연동 토큰. 토큰마다 요청 한도가 따로라 테스트마다 새로 발급한다 */
    private fun viewerToken(): String {
        val response = loggedIn(newUser(Role.VIEWER)).post("/api/me/tokens", mapOf("name" to "Hermes"))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return response.body["token"].asString()
    }

    private fun get(token: String, path: String): ApiClient.Response = anonymous().bearer("GET", path, token)

    private fun ok(token: String, path: String): JsonNode {
        val response = get(token, path)
        assertThat(response.status).describedAs("$path: ${response.body}").isEqualTo(200)
        return response.body
    }

    private fun archive(session: ApiClient, id: String) {
        val revision = session.get("/api/nodes/$id").body["node"]["revision"].asLong()
        val response = session.post("/api/nodes/$id/archive", mapOf("expectedRevision" to revision))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
    }

    private fun relate(session: ApiClient, type: String, fromId: String, toId: String): JsonNode {
        val response = session.post("/api/relationships", mapOf("type" to type, "fromId" to fromId, "toId" to toId))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return response.body
    }

    /** 기업이 종목을 발행하고, 그 기업이 산업에 속한다는 주장을 설명 600자로 만든다 */
    private class Scene(val company: JsonNode, val security: JsonNode, val claimId: String, val description: String)

    private fun scene(alice: ApiClient): Scene {
        val fx = Fixtures(alice)
        val company = fx.company("가상전자")
        val security = fx.security("가상전자 보통주")
        relate(alice, "ISSUES", company.id, security.id)
        val sector = fx.sector("메모리 반도체")
        val document = fx.document("2026 사업보고서")
        val description = "가".repeat(600)
        val claim = alice.post(
            "/api/claims",
            mapOf(
                "predicate" to "BELONGS_TO_SECTOR", "subjectId" to company.id, "objectId" to sector.id, "documentIds" to listOf(document.id),
                "description" to description, "evidenceText" to "당사는 D램과 낸드 플래시를 주력으로 생산한다.",
            ),
        )
        assertThat(claim.status).describedAs(claim.body.toString()).isEqualTo(201)
        return Scene(company, security, claim.body.id, description)
    }

    private fun enc(s: String) = URLEncoder.encode(s, Charsets.UTF_8)

    @Test
    fun `검색은 속성 없이 요약만 담고 보관한 노드를 뺀다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("검색기업")
        val name = company["properties"]["name"].asString()
        val token = viewerToken()

        val item = ok(token, "/api/v1/nodes?q=${enc(name)}")["items"][0]
        assertThat(item["id"].asString()).isEqualTo(company.id)
        assertThat(item["type"].asString()).isEqualTo("Company")
        assertThat(item["typeLabel"].asString()).isEqualTo("기업")
        assertThat(item["label"].asString()).isEqualTo(name)
        assertThat(item["revision"].asLong()).isEqualTo(company["revision"].asLong())
        assertThat(item["updatedAt"].asString()).isEqualTo(company["updatedAt"].asString())
        assertThat(item.has("reviewStatus")).describedAs(item.toString()).isTrue()
        assertThat(item.has("properties")).describedAs(item.toString()).isFalse()

        archive(alice, company.id)
        val after = ok(token, "/api/v1/nodes?q=${enc(name)}")["items"].toList().map { it["id"].asString() }
        assertThat(after).doesNotContain(company.id)
    }

    @Test
    fun `검색 페이지 크기는 50 까지 받고 51 은 400 이다`() {
        val token = viewerToken()

        val over = get(token, "/api/v1/nodes?size=51")
        assertThat(over.status).describedAs(over.body.toString()).isEqualTo(400)
        assertThat(over.code).isEqualTo("VALIDATION_FAILED")
        assertThat(over.body["details"]["fieldErrors"].has("size")).describedAs(over.body.toString()).isTrue()

        assertThat(ok(token, "/api/v1/nodes?size=50")["size"].asInt()).isEqualTo(50)
    }

    @Test
    fun `상세는 속성의 표시 이름과 관계 문장을 담고 끼워 넣은 주장의 글은 500자에서 자른다`() {
        val alice = loggedIn(ALICE)
        val s = scene(alice)
        val companyName = s.company["properties"]["name"].asString()
        val securityName = s.security["properties"]["name"].asString()
        val token = viewerToken()

        val detail = ok(token, "/api/v1/nodes/${s.company.id}")
        assertThat(detail["node"]["typeLabel"].asString()).isEqualTo("기업")
        assertThat(detail["node"]["createdBy"].asString()).isEqualTo("Alice")
        assertThat(detail["claim"].isNull).describedAs(detail["claim"].toString()).isTrue()

        val country = detail["properties"].toList().single { it["key"].asString() == "country" }
        val krLabel = OntologyLoader.loadDefault().nodeTypes.getValue("Company").properties.getValue("country").valueLabels!!.getValue("KR")
        assertThat(country["type"].asString()).isEqualTo("enum")
        assertThat(country["value"].asString()).isEqualTo("KR")
        assertThat(country["valueLabel"].asString()).isEqualTo(krLabel)

        val issues = detail["relations"].toList().single { it["type"].asString() == "ISSUES" }
        assertThat(issues["direction"].asString()).isEqualTo("OUT")
        assertThat(issues["other"]["id"].asString()).isEqualTo(s.security.id)
        assertThat(issues["other"]["type"].asString()).isEqualTo("Security")
        assertThat(issues["sentence"].asString()).isEqualTo("${companyName}이(가) ${securityName}을(를) 발행한다")

        val embedded = detail["claims"][0]
        assertThat(embedded["id"].asString()).isEqualTo(s.claimId)
        assertThat(embedded["subject"]["id"].asString()).isEqualTo(s.company.id)
        assertThat(embedded["documents"].size()).isEqualTo(1)
        val cut = embedded["description"].asString()
        assertThat(cut).hasSize(501).endsWith("…").startsWith(s.description.take(500))

        val claimDetail = ok(token, "/api/v1/nodes/${s.claimId}")
        assertThat(claimDetail["claim"]["description"].asString()).isEqualTo(s.description)
        assertThat(claimDetail["claim"]["predicate"].asString()).isEqualTo("BELONGS_TO_SECTOR")

        assertThat(detail.toString()).doesNotContain(ALICE)
        assertThat(claimDetail.toString()).doesNotContain(ALICE)
    }

    @Test
    fun `지금 온톨로지에 없는 종류의 관계는 상세의 relations 에서 빠진다`() {
        val alice = loggedIn(ALICE)
        val s = scene(alice)
        val token = viewerToken()
        // 정의에서 빠진 관계 종류는 API 로 만들 수 없어 Neo4j 에 직접 만든다
        val legacyId = java.util.UUID.randomUUID().toString()
        neo4j.query(
            """
            MATCH (a:Knowledge {id: ${'$'}from}), (b:Knowledge {id: ${'$'}to})
            CREATE (a)-[:LEGACY_LINK {id: ${'$'}id, revision: 1, archived: false, createdAt: '2026-10-25T00:00:00Z', createdBy: 'system'}]->(b)
            """,
        ).bindAll(mapOf("from" to s.company.id, "to" to s.security.id, "id" to legacyId)).run()
        assertThat(alice.get("/api/nodes/${s.company.id}").body["relationships"].toList().map { it["id"].asString() })
            .describedAs("화면용 상세에는 남아 있어야 v1 이 뺐음을 확인할 수 있다").contains(legacyId)

        val relations = ok(token, "/api/v1/nodes/${s.company.id}")["relations"].toList()
        assertThat(relations.map { it["relationshipId"].asString() }).doesNotContain(legacyId)
        assertThat(relations.map { it["type"].asString() }).containsExactly("ISSUES")
    }

    @Test
    fun `상대 끝이 보관된 관계는 상세에서 빠지고 보관한 노드의 상세는 404 다`() {
        val alice = loggedIn(ALICE)
        val s = scene(alice)
        val token = viewerToken()

        archive(alice, s.security.id)

        val relations = ok(token, "/api/v1/nodes/${s.company.id}")["relations"].toList().map { it["other"]["id"].asString() }
        assertThat(relations).doesNotContain(s.security.id)

        val archived = get(token, "/api/v1/nodes/${s.security.id}")
        assertThat(archived.status).describedAs(archived.body.toString()).isEqualTo(404)
        assertThat(archived.code).isEqualTo("NOT_FOUND")
    }

    @Test
    fun `주변 그래프는 중심을 담고 일반 관계 선에만 문장을 만든다`() {
        val alice = loggedIn(ALICE)
        val s = scene(alice)
        val token = viewerToken()

        val graph = ok(token, "/api/v1/graph/neighborhood?id=${s.company.id}&hops=1")
        assertThat(graph["center"]["id"].asString()).isEqualTo(s.company.id)
        assertThat(graph["center"]["typeLabel"].asString()).isEqualTo("기업")
        assertThat(graph["hops"].asInt()).isEqualTo(1)
        assertThat(graph["nodes"].toList().map { it["id"].asString() }).contains(s.company.id, s.security.id, s.claimId)
        val claimNode = graph["nodes"].toList().single { it["id"].asString() == s.claimId }
        assertThat(claimNode["reviewStatus"].asString()).isEqualTo("DRAFT")

        val edges = graph["edges"].toList()
        val issues = edges.single { it["type"].asString() == "ISSUES" }
        assertThat(issues["from"].asString()).isEqualTo(s.company.id)
        assertThat(issues["to"].asString()).isEqualTo(s.security.id)
        assertThat(issues["sentence"].isString).describedAs(issues.toString()).isTrue()
        val subject = edges.single { it["type"].asString() == "SUBJECT" }
        assertThat(subject.has("sentence")).describedAs(subject.toString()).isTrue()
        assertThat(subject["sentence"].isNull).describedAs(subject.toString()).isTrue()

        val tooFar = get(token, "/api/v1/graph/neighborhood?id=${s.company.id}&hops=3")
        assertThat(tooFar.status).describedAs(tooFar.body.toString()).isEqualTo(400)
        assertThat(tooFar.code).isEqualTo("VALIDATION_FAILED")
    }
}
