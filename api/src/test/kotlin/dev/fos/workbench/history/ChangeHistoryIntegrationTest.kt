package dev.fos.workbench.history

import dev.fos.workbench.support.ApiClient
import dev.fos.workbench.support.Fixtures
import dev.fos.workbench.support.IntegrationTest
import dev.fos.workbench.support.id
import dev.fos.workbench.support.revision
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.JsonNode

class ChangeHistoryIntegrationTest : IntegrationTest() {

    @Test
    fun `이력의 노드 ID 는 지금 이름으로 함께 온다`() {
        val alice = loggedIn(ALICE)
        val fx = Fixtures(alice)
        val subject = fx.company("주체")
        val target = fx.sector("대상")
        val document = fx.document("근거")
        val claim = fx.claim("BELONGS_TO_SECTOR", subject.id, target.id, listOf(document.id)).body

        fun created(): JsonNode = alice.get("/api/changes?targetId=${claim.id}").body["items"]
            .single { it["action"].asString() == "CREATE" }
        val event = created()
        assertThat(event["changes"]["subjectId"]["after"].asString()).isEqualTo(subject.id)
        assertThat(event["refs"][subject.id]["label"].asString()).isEqualTo(subject["label"].asString())
        assertThat(event["refs"][target.id]["type"].asString()).isEqualTo("Sector")
        assertThat(event["refs"][document.id]["type"].asString()).isEqualTo("Document")

        val renamed = "새이름-${fx.suffix}"
        val patched = alice.patch("/api/nodes/${subject.id}", mapOf("expectedRevision" to subject.revision, "properties" to mapOf("name" to renamed)))
        assertThat(patched.status).describedAs(patched.body.toString()).isEqualTo(200)
        // 이름은 읽는 시점의 이름이다. 예전 이력에도 새 이름이 보인다
        assertThat(created()["refs"][subject.id]["label"].asString()).isEqualTo(renamed)
    }

    @Test
    fun `검토된 주장을 고친 이력의 검토자도 이름으로 온다`() {
        val alice = loggedIn(ALICE)
        val bob = loggedIn(BOB)
        val fx = Fixtures(alice)
        val claim = fx.claim("BELONGS_TO_SECTOR", fx.company("a").id, fx.sector("b").id, listOf(fx.document("d").id)).body
        assertThat(bob.post("/api/claims/${claim.id}/review", mapOf("expectedRevision" to 1, "status" to "REVIEWED")).status).isEqualTo(200)
        val edited = alice.patch("/api/claims/${claim.id}", mapOf("expectedRevision" to 2, "evidenceText" to "고친 근거 문장"))
        assertThat(edited.status).describedAs(edited.body.toString()).isEqualTo(200)

        val bobId = users.findByEmail(BOB)!!.id
        val update = alice.get("/api/changes?targetId=${claim.id}").body["items"].single { it["action"].asString() == "UPDATE" }
        assertThat(update["changes"]["reviewedBy"]["before"].asString()).isEqualTo(bobId)
        assertThat(update["refs"][bobId]["label"].asString()).isEqualTo("Bob")
        assertThat(update["refs"][bobId]["type"].asString()).isEqualTo("User")
    }

    @Test
    fun `사용자 목록은 이력에 나온 사람만, ADMIN 이 아니면 사용자 관리 이벤트만 남긴 사람은 빠진다`() {
        // 기본 ADMIN 계정은 다른 테스트가 지식 데이터를 바꾸므로 이 테스트 전용 관리자를 만든다
        val admin = loggedIn(ADMIN)
        val fx = Fixtures(admin)
        val ownEmail = "admin-actors-${fx.suffix}@example.com"
        assertThat(admin.post("/api/users", mapOf("email" to ownEmail, "displayName" to "이력관리자", "role" to "ADMIN")).status).isEqualTo(201)
        val own = loggedIn(ownEmail)
        val made = own.post("/api/users", mapOf("email" to "actors-target-${fx.suffix}@example.com", "displayName" to "대상", "role" to "VIEWER"))
        assertThat(made.status).describedAs(made.body.toString()).isEqualTo(201)

        val bob = loggedIn(BOB)
        fun emails(client: ApiClient): List<String> {
            val response = client.get("/api/changes/actors")
            assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
            return response.body.toList().map { it["email"].asString() }
        }
        assertThat(emails(bob)).describedAs("ADMIN 이 아닌 사람이 보는 사용자 목록").doesNotContain(ownEmail)
        assertThat(emails(admin)).describedAs("ADMIN 이 보는 사용자 목록").contains(ownEmail)

        Fixtures(loggedIn(ALICE)).company("actors")
        assertThat(emails(bob)).contains(ALICE)
    }
}
