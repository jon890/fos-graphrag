package dev.fos.workbench

import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.race
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

/** 같은 revision 에 동시에 들어온 쓰기는 하나만 성공한다. 실제 Neo4j 에 두 요청을 동시에 보낸다. */
class ConcurrencyIntegrationTest : IntegrationTest() {

    private fun statuses(vararg responses: dev.fos.workbench.support.ApiClient.Response) = responses.map { it.status }

    @Test
    fun `두 검토자가 같은 Claim 을 동시에 검토하면 하나는 409 다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val claim = fx.claim("SUPPLIES_TO", fx.company("a").id, fx.company("b").id, listOf(fx.document("d").id)).body
        val bob = loggedIn(BOB)
        val admin = loggedIn(ADMIN)
        val results = race(
            { bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED")) },
            { admin.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REJECTED")) },
        )
        assertThat(results.map { it.status }).containsExactlyInAnyOrder(200, 409)
        assertThat(alice.get("/api/changes?targetId=${claim.id}").body["totalItems"].asLong()).isEqualTo(2)
    }

    @Test
    fun `같은 노드를 동시에 보관하거나 복원하면 하나만 성공한다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val company = Fixtures(alice).company("동시보관")
        val archive = race(
            { alice.post("/api/nodes/${company.id}/archive", mapOf("expectedRevision" to 1)) },
            { bob.post("/api/nodes/${company.id}/archive", mapOf("expectedRevision" to 1)) },
        )
        assertThat(archive.map { it.status }).containsExactlyInAnyOrder(200, 409)
        val restore = race(
            { alice.post("/api/nodes/${company.id}/restore", mapOf("expectedRevision" to 2)) },
            { bob.post("/api/nodes/${company.id}/restore", mapOf("expectedRevision" to 2)) },
        )
        assertThat(restore.map { it.status }).containsExactlyInAnyOrder(200, 409)
        assertThat(alice.get("/api/nodes/${company.id}").body["node"]["revision"].asLong()).isEqualTo(3)
    }

    @Test
    fun `같은 관계를 동시에 보관하면 하나만 성공한다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val rel = alice.post("/api/relationships", mapOf("type" to "ISSUES", "fromId" to fx.company("c").id, "toId" to fx.security("s").id)).body
        val results = race(
            { alice.post("/api/relationships/${rel.id}/archive", mapOf("expectedRevision" to 1)) },
            { bob.post("/api/relationships/${rel.id}/archive", mapOf("expectedRevision" to 1)) },
        )
        assertThat(results.map { it.status }).containsExactlyInAnyOrder(200, 409)
        assertThat(alice.get("/api/changes?targetId=${rel.id}").body["totalItems"].asLong()).isEqualTo(2)
    }

    @Test
    fun `같은 사용자를 동시에 고치면 하나만 성공한다`() {
        val admin = loggedIn(ADMIN)
        val other = loggedIn(ADMIN)
        val user = admin.post("/api/users", mapOf("email" to "race-${UUID.randomUUID().toString().take(8)}@example.com", "displayName" to "경합", "role" to "VIEWER")).body
        val results = race(
            { admin.patch("/api/users/${user.id}", mapOf("expectedRevision" to 1, "role" to "EDITOR", "displayName" to "첫째")) },
            { other.patch("/api/users/${user.id}", mapOf("expectedRevision" to 1, "role" to "EDITOR", "displayName" to "둘째")) },
        )
        assertThat(results.map { it.status }).containsExactlyInAnyOrder(200, 409)
    }

    @Test
    fun `두 관리자가 서로를 동시에 강등해도 활성 관리자가 남고 500 이 나지 않는다`() {
        val admin = loggedIn(ADMIN)
        val email = "admin-race-${UUID.randomUUID().toString().take(8)}@example.com"
        val second = admin.post("/api/users", mapOf("email" to email, "displayName" to "관리자2", "role" to "ADMIN")).body
        val secondSession = loggedIn(email)
        val users = admin.get("/api/users").body.toList()
        val first = users.single { it["email"].asString() == ADMIN }
        try {
            val results = race(
                { admin.patch("/api/users/${second.id}", mapOf("expectedRevision" to second["revision"].asLong(), "role" to "EDITOR")) },
                { secondSession.patch("/api/users/${first.id}", mapOf("expectedRevision" to first["revision"].asLong(), "role" to "EDITOR")) },
            )
            assertThat(results.map { it.status }).doesNotContain(500)
            assertThat(results.map { it.status }).contains(200)
            assertThat(results.filter { it.status != 200 }.map { it.code }).allMatch { it in setOf("LAST_ADMIN", "TRANSIENT_CONFLICT", "FORBIDDEN") }
            val activeAdmins = neo4j.query("MATCH (u:User {role: 'ADMIN', enabled: true}) RETURN count(u) AS n").fetch().one().get()["n"] as Long
            assertThat(activeAdmins).isGreaterThanOrEqualTo(1)
        } finally {
            // 다른 테스트가 admin@example.com 을 ADMIN 으로 쓰므로 되돌린다
            neo4j.query("MATCH (u:User {email: \$email}) SET u.role = 'ADMIN', u.enabled = true").bind(ADMIN).to("email").run()
            neo4j.query("MATCH (u:User {email: \$email}) SET u.enabled = false").bind(email).to("email").run()
        }
    }
}
