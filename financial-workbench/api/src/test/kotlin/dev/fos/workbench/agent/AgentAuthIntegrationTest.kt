package dev.fos.workbench.agent

import dev.fos.workbench.auth.Role
import dev.fos.workbench.ontology.OntologyLoader
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.IntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AgentAuthIntegrationTest : IntegrationTest() {

    private val unauthenticatedMessage = "연동 토큰이 없거나 올바르지 않습니다."

    /** 세션으로 로그인한 사람이 토큰을 발급하고 원문과 id 를 돌려준다 */
    private fun issue(session: ApiClient, name: String = "Hermes"): Pair<String, String> {
        val response = session.post("/api/me/tokens", mapOf("name" to name))
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return response.body["token"].asString() to response.body["id"].asString()
    }

    private fun assertUnauthenticated(response: ApiClient.Response, case: String) {
        assertThat(response.status).describedAs("$case: ${response.body}").isEqualTo(401)
        assertThat(response.code).describedAs(case).isEqualTo("UNAUTHENTICATED")
        assertThat(response.body["message"].asString()).describedAs(case).isEqualTo(unauthenticatedMessage)
    }

    @Test
    fun `토큰으로 온톨로지를 읽으면 에이전트에 필요한 값만 담긴다`() {
        val (token, _) = issue(loggedIn(newUser(Role.VIEWER)))

        val response = anonymous().bearer("GET", "/api/v1/ontology", token)
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        val body = response.body
        assertThat(body["version"].isIntegralNumber).describedAs(body["version"].toString()).isTrue()

        val decision = body["nodeTypes"].toList().single { it["key"].asString() == "Decision" }
        val action = decision["properties"].toList().single { it["key"].asString() == "action" }
        assertThat(action["type"].asString()).isEqualTo("enum")
        val values = action["values"].toList().map { it["value"].asString() to it["label"].asString() }
        assertThat(values).contains("BUY" to "매수")
        val decidedAt = decision["properties"].toList().single { it["key"].asString() == "decidedAt" }
        assertThat(decidedAt.has("values")).isTrue()
        assertThat(decidedAt["values"].isNull).isTrue()

        val hasDecision = body["relationshipTypes"].toList().single { it["key"].asString() == "HAS_DECISION" }
        val expectedSentence = OntologyLoader.loadDefault().relationshipTypes.getValue("HAS_DECISION").sentence
        assertThat(hasDecision["sentence"].asString()).isEqualTo(expectedSentence)

        val text = body.toString()
        for (key in listOf("display", "createPicker", "valueAliases")) {
            assertThat(text).describedAs("응답에 $key 키가 없어야 한다").doesNotContain("\"$key\"")
        }
    }

    @Test
    fun `me 는 토큰 주인과 토큰과 요청 한도를 알려 주고 마지막 사용 시각이 남는다`() {
        val session = loggedIn(newUser(Role.EDITOR, name = "에이전트주인"))
        val (token, id) = issue(session, "Hermes")

        val me = anonymous().bearer("GET", "/api/v1/me", token)
        assertThat(me.status).describedAs(me.body.toString()).isEqualTo(200)
        assertThat(me.body["user"]["displayName"].asString()).isEqualTo("에이전트주인")
        assertThat(me.body["user"]["role"].asString()).isEqualTo("EDITOR")
        assertThat(me.body["user"].has("email")).isFalse()
        assertThat(me.body["token"]["id"].asString()).isEqualTo(id)
        assertThat(me.body["token"]["name"].asString()).isEqualTo("Hermes")
        assertThat(me.body["token"]["last4"].asString()).isEqualTo(token.takeLast(4))
        assertThat(me.body["rateLimitPerMinute"].asInt()).isEqualTo(60)

        val list = session.get("/api/me/tokens")
        val item = list.body.toList().single { it["id"].asString() == id }
        assertThat(item["lastUsedAt"].isNull).describedAs(item.toString()).isFalse()
    }

    @Test
    fun `헤더가 없거나 틀리거나 없는 토큰이면 모두 같은 401 이다`() {
        val client = anonymous()
        val path = "/api/v1/me"

        assertUnauthenticated(client.bearer("GET", path, null), "헤더 없음")
        assertUnauthenticated(client.bearer("GET", path, ""), "Bearer 뒤 빈 값")
        assertUnauthenticated(client.send("GET", path, null, withCsrf = false, headers = mapOf("Authorization" to "Basic abc")), "Basic")
        assertUnauthenticated(client.bearer("GET", path, "fwb_short"), "형식이 틀린 값")
        assertUnauthenticated(client.bearer("GET", path, "fwb_" + "A".repeat(43)), "없는 토큰")
    }

    @Test
    fun `폐기한 토큰은 401 이다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val (token, id) = issue(session)
        assertThat(anonymous().bearer("GET", "/api/v1/me", token).status).isEqualTo(200)

        assertThat(session.send("DELETE", "/api/me/tokens/$id", null).status).isEqualTo(204)
        assertUnauthenticated(anonymous().bearer("GET", "/api/v1/me", token), "폐기한 토큰")
    }

    @Test
    fun `주인이 비활성화되면 401 이고 다시 활성화하면 200 이다`() {
        val email = newUser(Role.VIEWER)
        val (token, _) = issue(loggedIn(email))
        val admin = loggedIn(ADMIN)
        val userId = users.findByEmail(email)!!.id

        val disable = admin.patch("/api/users/$userId", mapOf("expectedRevision" to users.findByEmail(email)!!.revision, "enabled" to false))
        assertThat(disable.status).describedAs(disable.body.toString()).isEqualTo(200)
        assertUnauthenticated(anonymous().bearer("GET", "/api/v1/me", token), "비활성 주인")

        val enable = admin.patch("/api/users/$userId", mapOf("expectedRevision" to users.findByEmail(email)!!.revision, "enabled" to true))
        assertThat(enable.status).describedAs(enable.body.toString()).isEqualTo(200)
        val again = anonymous().bearer("GET", "/api/v1/me", token)
        assertThat(again.status).describedAs(again.body.toString()).isEqualTo(200)
    }

    @Test
    fun `세션 쿠키만 담은 요청은 v1 에서 401 이다`() {
        val session = loggedIn(newUser(Role.ADMIN))
        assertUnauthenticated(session.get("/api/v1/ontology"), "세션 쿠키만")
    }

    @Test
    fun `토큰으로는 세션 API 를 부르지 못한다`() {
        val (token, _) = issue(loggedIn(newUser(Role.ADMIN)))
        val client = anonymous()

        for (path in listOf("/api/nodes", "/api/me/tokens")) {
            val response = client.bearer("GET", path, token)
            assertThat(response.status).describedAs("$path: ${response.body}").isEqualTo(401)
            assertThat(response.code).isEqualTo("UNAUTHENTICATED")
        }
    }

    @Test
    fun `v1 의 쓰기 메서드는 CSRF 없이도 405 이고 없는 경로는 404 다`() {
        val (token, _) = issue(loggedIn(newUser(Role.ADMIN)))
        val client = anonymous()

        val post = client.bearer("POST", "/api/v1/ontology", token, emptyMap<String, Any>())
        assertThat(post.status).describedAs(post.body.toString()).isEqualTo(405)
        assertThat(post.code).isEqualTo("METHOD_NOT_ALLOWED")
        val delete = client.bearer("DELETE", "/api/v1/me", token)
        assertThat(delete.status).describedAs(delete.body.toString()).isEqualTo(405)
        assertThat(delete.code).isEqualTo("METHOD_NOT_ALLOWED")
        val unknown = client.bearer("POST", "/api/v1/unknown", token, emptyMap<String, Any>())
        assertThat(unknown.status).describedAs(unknown.body.toString()).isEqualTo(404)
        assertThat(unknown.code).isEqualTo("NOT_FOUND")
    }

    @Test
    fun `토큰 하나로 1분에 60번을 넘기면 429 이고 같은 주인의 다른 토큰은 따로 센다`() {
        val session = loggedIn(newUser(Role.VIEWER))
        val (token, _) = issue(session, "첫째")
        val (other, _) = issue(session, "둘째")
        val client = anonymous()

        repeat(60) {
            val response = client.bearer("GET", "/api/v1/me", token)
            assertThat(response.status).describedAs("${it + 1}번째: ${response.body}").isEqualTo(200)
        }
        val limited = client.bearer("GET", "/api/v1/me", token)
        assertThat(limited.status).describedAs(limited.body.toString()).isEqualTo(429)
        assertThat(limited.code).isEqualTo("RATE_LIMITED")
        val retryAfter = limited.header("Retry-After")?.toLongOrNull()
        assertThat(retryAfter).describedAs("Retry-After=${limited.header("Retry-After")}").isNotNull().isBetween(1L, 60L)
        assertThat(limited.body["details"]["retryAfterSeconds"].asLong()).isEqualTo(retryAfter)

        val second = client.bearer("GET", "/api/v1/me", other)
        assertThat(second.status).describedAs(second.body.toString()).isEqualTo(200)
    }
}
