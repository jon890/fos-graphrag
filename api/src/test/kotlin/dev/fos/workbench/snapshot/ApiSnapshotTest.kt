package dev.fos.workbench.snapshot

import dev.fos.workbench.auth.UserRepository
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.EmbeddedServers
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.OAuthFlow
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.core.env.Environment
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import tools.jackson.databind.JsonNode
import tools.jackson.databind.json.JsonMapper
import tools.jackson.databind.node.ObjectNode
import java.io.File
import java.net.URLEncoder

/**
 * 화면 테스트의 가짜 API 가 줄 응답을 실제 서버에서 받아 `web/e2e/fixtures/<이름>.json` 으로 쓴다.
 * 돌 때마다 다시 쓰고, 바뀜은 git diff 로 본다. 정규화 규칙은 [SnapshotNormalizer] 가 소유한다.
 * 새 데이터와 새 저장은 흐름의 끝에 붙인다. 중간에 끼우면 뒤의 자리표시가 모두 바뀐다.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "NEO4J_PASSWORD=unused-auth-disabled",
        "workbench.oauth.register-rate-limit-per-minute=10000",
        "workbench.oauth.token-rate-limit-per-minute=10000",
        // OAuth 주소에 실행마다 다른 포트가 들어가지 않게 가짜 API 의 origin 으로 고정한다
        "workbench.oauth.public-url=http://127.0.0.1:5180",
        // 초기 데이터의 적용 시간(트랜잭션 시간 초과)과 파일 내용에 스냅샷이 흔들리지 않게 넣지 않는다
        "workbench.seeds.enabled=false",
    ],
)
@ActiveProfiles("mockoidc")
class ApiSnapshotTest {

    @Autowired lateinit var environment: Environment
    @Autowired lateinit var users: UserRepository
    @Autowired lateinit var mapper: JsonMapper

    private val saved = mutableListOf<Snapshot>()

    private fun anonymous(): ApiClient = ApiClient("http://localhost:${environment.getProperty("local.server.port")}", mapper)

    private fun loggedIn(email: String): ApiClient = anonymous().also {
        val location = it.oidcLogin("sub-$email", email)
        check(location.endsWith("/") && !location.contains("denied")) { "로그인 실패: $location" }
    }

    fun save(name: String, method: String, pathAndQuery: String, response: ApiClient.Response) {
        val path = pathAndQuery.substringBefore('?')
        val query = pathAndQuery.substringAfter('?', "")
        saved += Snapshot(name, method, path, query, response.status, response.body)
    }

    /** 응답이 기대한 상태인지 확인하고 본문을 돌려준다 */
    private fun expect(status: Int, response: ApiClient.Response): JsonNode {
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(status)
        return response.body
    }

    private fun getAndSave(client: ApiClient, name: String, pathAndQuery: String, status: Int = 200): JsonNode {
        val response = client.get(pathAndQuery)
        expect(status, response)
        save(name, "GET", pathAndQuery, response)
        return response.body
    }

    private fun node(client: ApiClient, type: String, properties: Map<String, Any?>): JsonNode =
        expect(201, client.post("/api/nodes", mapOf("type" to type, "properties" to properties)))

    private fun relate(client: ApiClient, type: String, fromId: String, toId: String): JsonNode =
        expect(201, client.post("/api/relationships", mapOf("type" to type, "fromId" to fromId, "toId" to toId)))

    /** 화면의 buildQuery(URLSearchParams)와 같은 인코딩. 공백은 `+`, 쉼표는 `%2C` 다 */
    private fun query(vararg params: Pair<String, Any>): String =
        params.joinToString("&") { (k, v) -> "${enc(k)}=${enc(v.toString())}" }

    private fun enc(s: String) = URLEncoder.encode(s, Charsets.UTF_8)

    @Test
    fun `writes api snapshots`() {
        val dir = File(FIXTURES_DIR)
        dir.mkdirs()
        dir.listFiles { f -> f.name.endsWith(".json") }?.forEach { it.delete() }

        IntegrationTest.USERS.forEach { (email, name, role) -> users.create(email, name, role, "system") }
        val viewer = loggedIn(IntegrationTest.VIEWER)
        val alice = loggedIn(IntegrationTest.ALICE)
        val bob = loggedIn(IntegrationTest.BOB)
        val admin = loggedIn(IntegrationTest.ADMIN)
        // 화면은 guideDoneAt 이 null 이면 가이드를 연다. 가이드를 보는 화면 테스트가 null 로 덮어쓴다
        listOf(viewer, alice, bob, admin).forEach { expect(200, it.post("/api/auth/me/guide-done")) }

        getAndSave(viewer, "auth-me-viewer", "/api/auth/me")
        getAndSave(alice, "auth-me-editor", "/api/auth/me")
        getAndSave(admin, "auth-me-admin", "/api/auth/me")
        getAndSave(anonymous(), "auth-me-anonymous", "/api/auth/me", status = 401)

        // 편집자 A 가 변화에서 투자 결정까지 잇는 사슬을 만든다
        val change = node(alice, "Change", mapOf("title" to "AI 서버가 늘면서 고성능 메모리 수요가 커진다", "category" to "TECHNOLOGY"))
        val bottleneck = node(alice, "Bottleneck", mapOf("title" to "HBM 생산과 고적층 패키징", "status" to "HYPOTHESIS"))
        val sector = node(alice, "Sector", mapOf("name" to "가상 메모리 반도체", "scheme" to "GICS"))
        val company = node(alice, "Company", mapOf("name" to COMPANY_NAME, "country" to "KR"))
        val security = node(
            alice, "Security",
            mapOf("market" to "KRX_KOSPI", "ticker" to TICKER, "name" to "가상전자 보통주", "securityType" to "COMMON", "currency" to "KRW"),
        )
        val valuation = node(alice, "Valuation", mapOf("title" to "가상전자 2026-10-20", "currentPrice" to 50000, "currency" to "KRW", "method" to "PER"))
        val scenario = node(alice, "Scenario", mapOf("title" to "가상전자 기준", "kind" to "BASE", "valuePerShare" to 65000))
        val decision = node(alice, "Decision", mapOf("title" to "가상전자 첫 매수", "action" to "BUY", "decidedAt" to "2026-10-24"))
        relate(alice, "CREATES", change.id, bottleneck.id)
        relate(alice, "HAS_BOTTLENECK", sector.id, bottleneck.id)
        relate(alice, "BENEFITS", bottleneck.id, company.id)
        relate(alice, "ISSUES", company.id, security.id)
        relate(alice, "HAS_VALUATION", company.id, valuation.id)
        relate(alice, "HAS_SCENARIO", valuation.id, scenario.id)
        relate(alice, "HAS_DECISION", security.id, decision.id)
        relate(alice, "BASED_ON", valuation.id, decision.id)

        // 근거 문서와 그 문서를 근거로 한 주장. B 가 검토를 끝낸다
        val document = node(
            alice, "Document",
            mapOf(
                "title" to "가상전자 2026 사업보고서", "url" to "https://example.com/virtual-electronics-2026", "publisher" to "가상공시",
                "documentType" to "FILING", "publishedAt" to "2026-03-15", "collectedAt" to "2026-10-20T03:00:00Z",
            ),
        )
        relate(alice, "EVIDENCED_BY", bottleneck.id, document.id)
        val reviewed = expect(
            201,
            alice.post(
                "/api/claims",
                mapOf(
                    "predicate" to "BELONGS_TO_SECTOR", "subjectId" to company.id, "objectId" to sector.id, "documentIds" to listOf(document.id),
                    "description" to "가상전자는 메모리 반도체 산업에 속한다.", "evidenceText" to "당사는 D램과 낸드 플래시를 주력으로 생산한다.",
                ),
            ),
        )
        expect(
            200,
            bob.post("/api/claims/${reviewed.id}/review", mapOf("expectedRevision" to reviewed.revision, "status" to "REVIEWED", "note" to "사업보고서와 맞다")),
        )
        // 검토 대기 주장
        expect(
            201,
            alice.post(
                "/api/claims",
                mapOf(
                    "predicate" to "BELONGS_TO_SECTOR", "subjectId" to security.id, "objectId" to sector.id, "documentIds" to listOf(document.id),
                    "description" to "가상전자 보통주는 메모리 반도체 산업에 속한다.", "evidenceText" to "당사는 D램과 낸드 플래시를 주력으로 생산한다.",
                ),
            ),
        )

        // A 의 이해 표시
        expect(200, alice.send("PUT", "/api/me/knowledge/${bottleneck.id}", mapOf("level" to "UNSURE", "note" to "고적층이 왜 어려운지 모르겠다")))

        // 보관한 노드
        val archived = node(alice, "Company", mapOf("name" to "보관한 가상기업", "country" to "KR"))
        expect(200, alice.post("/api/nodes/${archived.id}/archive", mapOf("expectedRevision" to archived.revision, "reason" to "중복 등록")))

        // A 의 기록 연동 토큰. 이 토큰으로 체결 하나와 대기 제안 하나를 넣는다
        val issued = alice.post("/api/me/tokens", mapOf("name" to "Hermes", "scope" to "READ_WRITE"))
        expect(201, issued)
        save("token-issued", "POST", "/api/me/tokens", issued)
        val token = issued.body["token"].asString()
        val trades = expect(
            200,
            anonymous().bearer(
                "POST", "/api/v1/trades", token,
                mapOf(
                    "trades" to listOf(
                        mapOf(
                            "broker" to "TOSS", "externalId" to "20261024-000001", "side" to "BUY", "market" to "KR", "ticker" to TICKER,
                            "name" to "가상전자 보통주", "quantity" to 10, "price" to 50000, "currency" to "KRW", "amount" to 500000, "fee" to 100,
                            "executedAt" to "2026-10-24T10:00:00+09:00",
                        ),
                    ),
                ),
            ),
        )
        val trade = trades["results"][0]["trade"]
        expect(
            200,
            anonymous().bearer(
                "POST", "/api/v1/proposals", token,
                mapOf(
                    "proposals" to listOf(
                        mapOf(
                            "kind" to "LINK_TRADE_DECISION",
                            "payload" to mapOf("tradeIds" to listOf(trade.id), "decisionId" to decision.id),
                            "rationale" to "10월 24일 가상전자 매수 체결은 「가상전자 첫 매수」 결정을 실행한 것이다.",
                            "evidence" to mapOf("nodeIds" to listOf(decision.id), "tradeIds" to listOf(trade.id), "urls" to emptyList<String>()),
                            "dedupeKey" to "link:20261024-000001",
                        ),
                    ),
                ),
            ),
        )

        // A 의 OAuth 연결. 동의 화면의 query 가 실행마다 같도록 PKCE 검증값을 고정한다
        val flow = OAuthFlow(anonymous())
        val clientId = flow.register(name = "Claude Code")
        val authorize = flow.request(clientId, PKCE_VERIFIER).filterValues { it != null }.map { (k, v) -> k to v!! }
        getAndSave(alice, "oauth-authorize-preview", "/api/oauth/authorize?" + query(*authorize.toTypedArray()))
        val decided = alice.post("/api/oauth/authorize", authorize.toMap() + mapOf("decision" to "ALLOW", "grantedScope" to "READ_WRITE"))
        expect(200, decided)
        save("oauth-authorize-decide", "POST", "/api/oauth/authorize", decided)
        val code = OAuthFlow.query(decided.body["redirectUrl"].asString())["code"] ?: error("redirectUrl 에 code 가 없다: ${decided.body}")
        expect(200, flow.exchange(clientId, code, PKCE_VERIFIER))

        getAndSave(alice, "ontology", "/api/ontology")
        // 온톨로지 버전 목록은 관리자 화면이다
        getAndSave(admin, "ontology-versions", "/api/ontology/versions?" + query("page" to 0, "size" to 20))
        getAndSave(alice, "nodes-counts", "/api/nodes/counts")
        // 개념 지도의 타입 칸(TypePanel)이 부르는 최근 항목
        getAndSave(alice, "nodes-recent", "/api/nodes?" + query("types" to "Company", "sort" to "recent", "size" to 5))
        // 검색 칸(SearchPanel)의 검색
        getAndSave(alice, "nodes-search", "/api/nodes?" + query("q" to COMPANY_NAME, "page" to 0, "size" to 20))
        getAndSave(alice, "node-company", "/api/nodes/${company.id}")
        getAndSave(alice, "node-security", "/api/nodes/${security.id}")
        getAndSave(alice, "node-decision", "/api/nodes/${decision.id}")
        getAndSave(alice, "node-document", "/api/nodes/${document.id}")
        getAndSave(alice, "node-archived", "/api/nodes/${archived.id}")
        getAndSave(alice, "node-decision-trace", "/api/nodes/${decision.id}/trace")
        getAndSave(alice, "graph-company", "/api/graph/neighborhood?" + query("id" to company.id, "hops" to 1))
        // 검토 탭(ReviewTab)의 두 목록. 검토할 사람은 B, 작성자는 A 다
        getAndSave(bob, "claims-pending-review", "/api/claims?" + query("reviewStatus" to "DRAFT", "scope" to "reviewable", "page" to 0, "size" to 20))
        getAndSave(alice, "claims-mine", "/api/claims?" + query("reviewStatus" to "DRAFT", "scope" to "mine", "page" to 0, "size" to 20))
        getAndSave(alice, "claim-reviewed", "/api/claims/${reviewed.id}")
        getAndSave(alice, "changes", "/api/changes?" + query("page" to 0, "size" to 20))
        getAndSave(alice, "changes-actors", "/api/changes/actors")
        getAndSave(admin, "users", "/api/users")
        getAndSave(alice, "knowledge-mark", "/api/me/knowledge/${bottleneck.id}")
        // 공부 탭(StudyTab)은 수준을 고르지 않으면 UNSURE 와 LEARNING 을 함께 부른다
        getAndSave(alice, "knowledge-study", "/api/me/knowledge?" + query("level" to "UNSURE,LEARNING", "page" to 0, "size" to 20))
        getAndSave(alice, "knowledge-summary", "/api/me/knowledge/summary")
        getAndSave(alice, "tokens", "/api/me/tokens")
        getAndSave(alice, "connections", "/api/me/connections")
        getAndSave(alice, "proposals-pending", "/api/me/proposals?" + query("status" to "PENDING", "page" to 0, "size" to 20))
        getAndSave(alice, "proposals-summary", "/api/me/proposals/summary")
        getAndSave(alice, "trades", "/api/me/trades?" + query("page" to 0, "size" to 20))

        val agent = { name: String, pathAndQuery: String ->
            val response = anonymous().bearer("GET", pathAndQuery, token)
            expect(200, response)
            save(name, "GET", pathAndQuery, response)
        }
        agent("v1-me", "/api/v1/me")
        agent("v1-nodes-search", "/api/v1/nodes?" + query("q" to COMPANY_NAME))
        agent("v1-node", "/api/v1/nodes/${company.id}")
        agent("v1-node-trace", "/api/v1/nodes/${decision.id}/trace")

        getAndSave(anonymous(), "oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp")
        getAndSave(anonymous(), "oauth-authorization-server", "/.well-known/oauth-authorization-server")

        // 사용법 따라하기(GuideProvider)가 주장의 대상으로 고를 산업을 찾는 요청
        getAndSave(alice, "nodes-first-sector", "/api/nodes?" + query("types" to "Sector", "size" to 1))
        getAndSave(alice, "graph-decision", "/api/graph/neighborhood?" + query("id" to decision.id, "hops" to 1))
        // 상세(KnowledgeMarkControls)가 부르는 내 표시. 표시가 없는 노드다
        getAndSave(alice, "knowledge-mark-none", "/api/me/knowledge/${company.id}")
        // 종목과 결정 상세의 내 체결(TradeList). 결정과 이은 체결은 아직 없다
        getAndSave(alice, "trades-security", "/api/me/trades?" + query("securityId" to security.id, "size" to 20))
        getAndSave(alice, "trades-decision", "/api/me/trades?" + query("decisionId" to decision.id, "size" to 20))

        // 화면 이동과 지식 편집 화면 테스트가 여는 상세, 그래프, 목록, 이력.
        // 위 저장에 없던 예전 시각(산업 상세의 관계, 앞 쪽에 없던 이력)을 담으면 시각 자리표시가 밀리므로 그런 응답은 남기지 않는다
        getAndSave(alice, "node-claim", "/api/nodes/${reviewed.id}")
        getAndSave(alice, "graph-claim", "/api/graph/neighborhood?" + query("id" to reviewed.id, "hops" to 1))
        getAndSave(alice, "graph-bottleneck", "/api/graph/neighborhood?" + query("id" to bottleneck.id, "hops" to 1))
        getAndSave(alice, "graph-company-2hops", "/api/graph/neighborhood?" + query("id" to company.id, "hops" to 2))
        // 목록 탭(ListTab)의 타입과 검색어 조건
        getAndSave(alice, "nodes-list-company", "/api/nodes?" + query("q" to COMPANY_NAME, "types" to "Company", "page" to 0, "size" to 20))
        getAndSave(alice, "changes-actor-bob", "/api/changes?" + query("actor" to IntegrationTest.BOB, "page" to 0, "size" to 20))
        getAndSave(alice, "changes-company", "/api/changes?" + query("targetId" to company.id, "page" to 0, "size" to 20))
        getAndSave(alice, "changes-claim", "/api/changes?" + query("targetId" to reviewed.id, "page" to 0, "size" to 20))

        // 근거 문서가 그 문서뿐인 주장이 있으면 보관하지 못한다
        val lastEvidence = alice.post("/api/nodes/${document.id}/archive", mapOf("expectedRevision" to document.revision, "reason" to null))
        expect(409, lastEvidence)
        save("node-archive-last-evidence", "POST", "/api/nodes/${document.id}/archive", lastEvidence)

        // 동시 수정. B 가 먼저 고친 뒤 A 가 예전 revision 으로 저장하면 409 다
        val companyProps = mapOf("name" to COMPANY_NAME, "country" to "KR")
        expect(
            200,
            bob.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to company.revision, "properties" to companyProps + ("description" to "B 가 먼저 고친 메모"))),
        )
        val conflict = alice.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to company.revision, "properties" to companyProps + ("description" to "A 가 고친 메모")))
        expect(409, conflict)
        save("node-patch-conflict", "PATCH", "/api/nodes/${company.id}", conflict)

        // 보관하고 복원한 노드와 그 이력
        val toArchive = node(alice, "Company", mapOf("name" to "보관 연습 기업", "country" to "KR"))
        getAndSave(alice, "node-archive-target", "/api/nodes/${toArchive.id}")
        val archivedNow = alice.post("/api/nodes/${toArchive.id}/archive", mapOf("expectedRevision" to toArchive.revision, "reason" to "화면 테스트 보관"))
        expect(200, archivedNow)
        save("node-archive", "POST", "/api/nodes/${toArchive.id}/archive", archivedNow)
        val restored = alice.post("/api/nodes/${toArchive.id}/restore", mapOf("expectedRevision" to archivedNow.body.revision))
        expect(200, restored)
        save("node-restore", "POST", "/api/nodes/${toArchive.id}/restore", restored)
        getAndSave(alice, "changes-archive-target", "/api/changes?" + query("targetId" to toArchive.id, "page" to 0, "size" to 20))

        // 책을 근거로 인물이 개념을 강조한다는 주장
        val person = node(alice, "Person", mapOf("name" to "가상 투자자", "englishName" to "Virtual Investor"))
        val concept = node(alice, "Concept", mapOf("name" to "안전마진", "summary" to "투자 판단에서 손실 가능성을 줄이는 여유다."))
        val book = node(
            alice, "Document",
            mapOf("title" to "안전마진 해설서", "url" to "https://example.com/margin-of-safety", "documentType" to "BOOK", "collectedAt" to "2026-10-20T03:00:00Z"),
        )
        relate(alice, "AUTHORED", person.id, book.id)
        val advocates = expect(
            201,
            alice.post(
                "/api/claims",
                mapOf(
                    "predicate" to "ADVOCATES", "subjectId" to person.id, "objectId" to concept.id, "documentIds" to listOf(book.id),
                    "description" to "가상 투자자는 안전마진을 투자의 핵심으로 본다.", "evidenceText" to "안전마진은 투자의 핵심이다.",
                ),
            ),
        )
        getAndSave(alice, "node-person", "/api/nodes/${person.id}")
        getAndSave(alice, "graph-person", "/api/graph/neighborhood?" + query("id" to person.id, "hops" to 1))
        getAndSave(alice, "node-book", "/api/nodes/${book.id}")
        getAndSave(alice, "claim-advocates", "/api/claims/${advocates.id}")
        // 주장 폼의 대상 고르기(NodePicker)가 개념을 찾는 요청
        getAndSave(alice, "nodes-pick-concept", "/api/nodes?" + query("q" to "안전마진", "types" to "Concept", "size" to 10))

        SnapshotNormalizer().normalize(saved.map { if (it.name.startsWith("graph-")) sortGraph(it) else it })
            .forEach { File(dir, "${it.name}.json").writeText(render(it)) }
    }

    /**
     * 그래프 응답은 노드(중심 다음)와 관계를 실제 id 순서로 준다. 실제 id 는 무작위라, 정규화 전에 id 가 아닌 값으로 정렬해
     * 자리표시를 매기는 순서까지 고정한다. 노드는 중심 다음 (type, label), 관계는 (type, 시작 노드 키, 끝 노드 키) 순서다
     */
    private fun sortGraph(s: Snapshot): Snapshot {
        val body = s.body.deepCopy() as ObjectNode
        val nodes = body["nodes"].values().toList()
        val keyOf = nodes.associate { it.id to "${it["type"].asString()}\u0000${it["label"].asString()}" }
        val edges = body["edges"].values().sortedWith(
            compareBy({ it["type"].asString() }, { keyOf[it["source"].asString()] }, { keyOf[it["target"].asString()] }),
        )
        val rest = nodes.drop(1).sortedWith(compareBy({ it["type"].asString() }, { it["label"].asString() }))
        body.putArray("nodes").addAll(listOf(nodes.first()) + rest)
        body.putArray("edges").addAll(edges)
        return s.copy(body = body)
    }

    /** 키 순서를 고정하고 2칸 들여쓰기, 끝 줄바꿈으로 쓴다(JSON.stringify(value, null, 2) 와 같은 모양) */
    private fun render(s: Snapshot): String {
        val file = mapper.createObjectNode()
        file.putObject("request").put("method", s.method).put("path", s.path).put("query", s.query)
        file.put("status", s.status)
        file.set("body", s.body)
        return pretty(file, "") + "\n"
    }

    private fun pretty(node: JsonNode, indent: String): String {
        val inner = "$indent  "
        return when {
            node.isObject && node.size() == 0 -> "{}"
            node.isObject -> node.properties().joinToString(",\n", "{\n", "\n$indent}") { (k, v) ->
                inner + mapper.writeValueAsString(k) + ": " + pretty(v, inner)
            }
            node.isArray && node.size() == 0 -> "[]"
            node.isArray -> node.values().joinToString(",\n", "[\n", "\n$indent]") { inner + pretty(it, inner) }
            else -> mapper.writeValueAsString(node)
        }
    }

    companion object {
        private const val FIXTURES_DIR = "../web/e2e/fixtures"
        private const val COMPANY_NAME = "가상전자"
        private const val TICKER = "900100"

        /** base64url 43자. 무작위 값이면 동의 화면 query 의 code_challenge 가 실행마다 바뀐다 */
        private const val PKCE_VERIFIER = "snapshot-pkce-verifier-0123456789abcdefghij"

        /** 다른 테스트의 데이터가 섞이지 않게 자기 Neo4j 를 띄운다. Spring 이 supplier 를 여러 번 부르므로 한 번만 띄운다 */
        private val neo4jUri by lazy { EmbeddedServers.startNeo4j() }

        @JvmStatic
        @DynamicPropertySource
        fun embeddedServers(registry: DynamicPropertyRegistry) {
            registry.add("spring.neo4j.uri") { neo4jUri }
            registry.add("MOCK_OIDC_BROWSER_URL") { EmbeddedServers.mockOidcUrl() }
            registry.add("MOCK_OIDC_INTERNAL_URL") { EmbeddedServers.mockOidcUrl() }
        }
    }
}
