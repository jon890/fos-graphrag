package dev.fos.workbench.agent

import dev.fos.workbench.auth.Role
import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.race
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class IntegrationTokenIntegrationTest : IntegrationTest() {

    private val tokensPath = "/api/me/tokens"

    private fun issue(client: ApiClient, name: String = "에이전트"): ApiClient.Response =
        client.post(tokensPath, mapOf("name" to name))

    private fun issued(client: ApiClient, name: String = "에이전트"): String {
        val response = issue(client, name)
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        return response.body["id"].asString()
    }

    private fun revoke(client: ApiClient, id: String): ApiClient.Response = client.send("DELETE", "$tokensPath/$id", null)

    private fun listIds(client: ApiClient): List<String> {
        val response = client.get(tokensPath)
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
        return response.body.toList().map { it["id"].asString() }
    }

    @Suppress("UNCHECKED_CAST")
    private fun storedProps(id: String): Map<String, Any?> =
        neo4j.query("MATCH (t:IntegrationToken {id: \$id}) RETURN properties(t) AS t").bind(id).to("id")
            .fetch().one().map { it["t"] as Map<String, Any?> }.orElseThrow { AssertionError("저장된 토큰이 없다: $id") }

    private fun activeCount(email: String): Long {
        val userId = users.findByEmail(email)!!.id
        return neo4j.query("MATCH (:User {id: \$userId})-[:OWNS]->(t:IntegrationToken) WHERE t.revokedAt IS NULL RETURN count(t) AS n")
            .bind(userId).to("userId").fetch().one().get()["n"] as Long
    }

    @Test
    fun `열람자가 발급하면 원문은 응답에만 있고 저장소에는 해시만 남는다`() {
        val viewer = loggedIn(newUser(Role.VIEWER))

        val response = issue(viewer, "  Hermes  ")
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(201)
        val token = response.body["token"].asString()
        val id = response.body["id"].asString()
        assertThat(response.body["name"].asString()).isEqualTo("Hermes")
        assertThat(token).matches("^fwb_[A-Za-z0-9_-]{43}$")
        assertThat(response.body["last4"].asString()).isEqualTo(token.takeLast(4))
        assertThat(response.body.has("lastUsedAt")).isTrue()
        assertThat(response.body["lastUsedAt"].isNull).isTrue()
        assertThat(response.body["createdAt"].isNull).isFalse()

        val stored = storedProps(id)
        assertThat(stored["hash"]).isEqualTo(IntegrationTokens.hash(token))
        assertThat(stored["hash"] as String).matches("^[0-9a-f]{64}$")
        assertThat(stored.values).describedAs(stored.toString()).doesNotContain(token)

        val list = viewer.get(tokensPath)
        assertThat(list.status).isEqualTo(200)
        val item = list.body.toList().single { it["id"].asString() == id }
        assertThat(item.has("token")).describedAs(item.toString()).isFalse()
        assertThat(item["name"].asString()).isEqualTo("Hermes")
        assertThat(item["last4"].asString()).isEqualTo(token.takeLast(4))
    }

    @Test
    fun `다른 사용자의 토큰은 보이지 않고 폐기할 수 없다`() {
        val owner = loggedIn(newUser(Role.EDITOR))
        val id = issued(owner)
        val other = loggedIn(newUser(Role.EDITOR))

        assertThat(listIds(other)).isEmpty()
        val response = revoke(other, id)
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(404)
        assertThat(response.code).isEqualTo("NOT_FOUND")
        assertThat(listIds(owner)).contains(id)
        assertThat(storedProps(id)).doesNotContainKey("revokedAt")
    }

    @Test
    fun `주인이 폐기하면 목록에서 빠지고 폐기 시각이 남는다`() {
        val owner = loggedIn(newUser(Role.VIEWER))
        val id = issued(owner)

        val response = revoke(owner, id)
        assertThat(response.status).describedAs(response.body.toString()).isEqualTo(204)
        assertThat(listIds(owner)).doesNotContain(id)
        assertThat(storedProps(id)["revokedAt"]).isNotNull()

        val again = revoke(owner, id)
        assertThat(again.status).isEqualTo(404)
        assertThat(again.code).isEqualTo("NOT_FOUND")
    }

    @Test
    fun `이름이 비었거나 50자를 넘으면 거절한다`() {
        val viewer = loggedIn(newUser(Role.VIEWER))

        for (name in listOf("   ", "가".repeat(51))) {
            val response = issue(viewer, name)
            assertThat(response.status).describedAs(response.body.toString()).isEqualTo(400)
            assertThat(response.code).isEqualTo("VALIDATION_FAILED")
            assertThat(response.body["details"]["fieldErrors"].has("name")).isTrue()
        }
        val missing = viewer.post(tokensPath, emptyMap<String, Any>())
        assertThat(missing.status).describedAs(missing.body.toString()).isEqualTo(400)
        assertThat(missing.body["details"]["fieldErrors"].has("name")).isTrue()

        assertThat(issue(viewer, "가".repeat(50)).status).isEqualTo(201)
        assertThat(listIds(viewer)).hasSize(1)
    }

    @Test
    fun `폐기하지 않은 토큰이 5개면 더 발급하지 못하고 하나를 폐기하면 다시 발급된다`() {
        val viewer = loggedIn(newUser(Role.VIEWER))
        val ids = (1..5).map { issued(viewer, "토큰$it") }

        val sixth = issue(viewer, "여섯째")
        assertThat(sixth.status).describedAs(sixth.body.toString()).isEqualTo(409)
        assertThat(sixth.code).isEqualTo("TOKEN_LIMIT")
        assertThat(sixth.body["details"]["max"].asInt()).isEqualTo(5)
        assertThat(listIds(viewer)).containsExactlyInAnyOrderElementsOf(ids)

        assertThat(revoke(viewer, ids.first()).status).isEqualTo(204)
        assertThat(issue(viewer, "다시").status).isEqualTo(201)
        assertThat(listIds(viewer)).hasSize(5)
    }

    @Test
    fun `토큰이 넷일 때 동시에 두 번 발급하면 하나만 만들어진다`() {
        val email = newUser(Role.VIEWER)
        val first = loggedIn(email)
        val second = loggedIn(email)
        repeat(4) { issued(first, "토큰$it") }

        val responses = race({ issue(first, "경합1") }, { issue(second, "경합2") })
        assertThat(responses.map { it.status }).describedAs(responses.map { it.body.toString() }.toString())
            .containsExactlyInAnyOrder(201, 409)
        assertThat(activeCount(email)).isEqualTo(5)
    }

    @Test
    fun `CSRF 토큰 없는 발급은 거절한다`() {
        val viewer = loggedIn(newUser(Role.VIEWER))
        val response = viewer.send("POST", tokensPath, mapOf("name" to "x"), withCsrf = false)
        assertThat(response.status).isEqualTo(403)
        assertThat(response.code).isEqualTo("CSRF_REJECTED")
        assertThat(listIds(viewer)).isEmpty()
    }

    @Test
    fun `로그인하지 않으면 목록을 볼 수 없다`() {
        val response = anonymous().get(tokensPath)
        assertThat(response.status).isEqualTo(401)
        assertThat(response.code).isEqualTo("UNAUTHENTICATED")
    }

    @Test
    fun `발급과 폐기는 변경 이력에 남지 않는다`() {
        val owner = loggedIn(newUser(Role.EDITOR))
        val id = issued(owner)
        assertThat(revoke(owner, id).status).isEqualTo(204)

        val history = loggedIn(ADMIN).get("/api/changes?targetId=$id")
        assertThat(history.status).describedAs(history.body.toString()).isEqualTo(200)
        assertThat(history.body["totalItems"].asLong()).isZero()
    }
}
