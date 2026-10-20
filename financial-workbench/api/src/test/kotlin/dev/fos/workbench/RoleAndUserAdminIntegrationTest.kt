package dev.fos.workbench

import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class RoleAndUserAdminIntegrationTest : IntegrationTest() {

    @Test
    fun `VIEWER 는 조회만 하고 모든 쓰기는 403 이다`() {
        val alice = loggedIn(ALICE)
        val company = Fixtures(alice).company("열람대상")
        val viewer = loggedIn(VIEWER)

        assertThat(viewer.get("/api/nodes/${company.id}").status).isEqualTo(200)
        assertThat(viewer.get("/api/graph/neighborhood?id=${company.id}").status).isEqualTo(200)
        assertThat(viewer.get("/api/changes").status).isEqualTo(200)
        assertThat(viewer.get("/api/ontology").status).isEqualTo(200)

        val create = viewer.post("/api/nodes", mapOf("type" to "Company", "properties" to mapOf("name" to "x")))
        assertThat(create.status).isEqualTo(403)
        assertThat(create.code).isEqualTo("FORBIDDEN")
        assertThat(viewer.patch("/api/nodes/${company.id}", mapOf("expectedRevision" to 1, "properties" to mapOf("country" to "US"))).status).isEqualTo(403)
        assertThat(viewer.post("/api/nodes/${company.id}/archive", mapOf("expectedRevision" to 1)).status).isEqualTo(403)
        assertThat(viewer.post("/api/claims", mapOf("predicate" to "SUPPLIES_TO")).status).isEqualTo(403)
        assertThat(viewer.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to "a", "toId" to "b")).status).isEqualTo(403)
        assertThat(alice.get("/api/nodes/${company.id}").body["node"]["revision"].asLong()).isEqualTo(1)
    }

    @Test
    fun `EDITOR 는 사용자 관리를 못 하고 ADMIN 은 한다`() {
        val alice = loggedIn(ALICE)
        assertThat(alice.get("/api/users").code).isEqualTo("FORBIDDEN")
        assertThat(alice.post("/api/users", mapOf("email" to "x@example.com", "displayName" to "x", "role" to "ADMIN")).status).isEqualTo(403)

        val admin = loggedIn(ADMIN)
        val email = "new-${UUID.randomUUID().toString().take(8)}@example.com"
        val created = admin.post("/api/users", mapOf("email" to email.uppercase(), "displayName" to "새 사용자", "role" to "VIEWER"))
        assertThat(created.status).isEqualTo(201)
        assertThat(created.body["email"].asString()).isEqualTo(email)
        assertThat(created.body["linked"].asBoolean()).isFalse()
        assertThat(admin.post("/api/users", mapOf("email" to email, "displayName" to "중복", "role" to "VIEWER")).code).isEqualTo("DUPLICATE")
        assertThat(admin.post("/api/users", mapOf("email" to "bad", "displayName" to "x", "role" to "OWNER")).code).isEqualTo("VALIDATION_FAILED")

        val promoted = admin.patch("/api/users/${created.body.id}", mapOf("expectedRevision" to 1, "role" to "EDITOR"))
        assertThat(promoted.body["role"].asString()).isEqualTo("EDITOR")
        assertThat(admin.patch("/api/users/${created.body.id}", mapOf("expectedRevision" to 1, "role" to "VIEWER")).code).isEqualTo("REVISION_CONFLICT")

        val history = admin.get("/api/changes?targetId=${created.body.id}").body["items"]
        assertThat(history.toList().map { it["action"].asString() }).containsExactly("UPDATE", "CREATE")
        assertThat(history[0]["targetKind"].asString()).isEqualTo("USER")
        assertThat(history[0]["changes"]["role"]["after"].asString()).isEqualTo("EDITOR")
    }

    @Test
    fun `역할 변경은 다음 요청부터, 비활성화는 기존 세션을 바로 끊는다`() {
        val admin = loggedIn(ADMIN)
        val email = "temp-${UUID.randomUUID().toString().take(8)}@example.com"
        val user = admin.post("/api/users", mapOf("email" to email, "displayName" to "임시", "role" to "EDITOR")).body
        val session = loggedIn(email)
        assertThat(session.post("/api/nodes", mapOf("type" to "Sector", "properties" to mapOf("name" to "임시 산업 $email"))).status).isEqualTo(201)

        admin.patch("/api/users/${user.id}", mapOf("expectedRevision" to 1, "role" to "VIEWER"))
        assertThat(session.post("/api/nodes", mapOf("type" to "Sector", "properties" to mapOf("name" to "막힘 $email"))).code).isEqualTo("FORBIDDEN")

        admin.patch("/api/users/${user.id}", mapOf("expectedRevision" to 2, "enabled" to false))
        assertThat(session.get("/api/auth/me").status).isEqualTo(401)
        assertThat(anonymous().oidcLogin(subOf(email), email)).endsWith("/?login=denied")

        admin.patch("/api/users/${user.id}", mapOf("expectedRevision" to 3, "enabled" to true))
        assertThat(anonymous().oidcLogin(subOf(email), email)).endsWith("/")
    }

    @Test
    fun `마지막 활성 ADMIN 은 강등하거나 비활성화할 수 없다`() {
        // 테스트끼리 DB 를 함께 쓰므로 활성 ADMIN 이 admin@example.com 하나뿐인 상태를 먼저 만든다
        neo4j.query("MATCH (u:User {role: 'ADMIN'}) WHERE u.email <> \$email SET u.enabled = false").bind(ADMIN).to("email").run()
        val admin = loggedIn(ADMIN)
        val me = admin.get("/api/users").body.toList().single { it["email"].asString() == ADMIN }
        val revision = me["revision"].asLong()

        val demote = admin.patch("/api/users/${me.id}", mapOf("expectedRevision" to revision, "role" to "EDITOR"))
        assertThat(demote.status).isEqualTo(409)
        assertThat(demote.code).isEqualTo("LAST_ADMIN")
        assertThat(admin.patch("/api/users/${me.id}", mapOf("expectedRevision" to revision, "enabled" to false)).code).isEqualTo("LAST_ADMIN")

        // 다른 활성 ADMIN 이 있으면 그 사람은 비활성화할 수 있다
        val second = admin.post("/api/users", mapOf("email" to "admin2-${UUID.randomUUID().toString().take(8)}@example.com", "displayName" to "관리자2", "role" to "ADMIN")).body
        assertThat(admin.patch("/api/users/${second.id}", mapOf("expectedRevision" to 1, "enabled" to false)).status).isEqualTo(200)
        assertThat(admin.get("/api/users").body.toList().single { it["email"].asString() == ADMIN }["role"].asString()).isEqualTo("ADMIN")
    }
}
