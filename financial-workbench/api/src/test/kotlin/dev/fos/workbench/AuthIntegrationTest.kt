package dev.fos.workbench

import dev.fos.workbench.support.IntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AuthIntegrationTest : IntegrationTest() {

    @Test
    fun `인증 없는 조회와 변경을 막는다`() {
        val client = anonymous()
        client.get("/api/auth/csrf")

        val read = client.get("/api/ontology")
        assertThat(read.status).isEqualTo(401)
        assertThat(read.code).isEqualTo("UNAUTHENTICATED")
        assertThat(client.post("/api/nodes", mapOf("type" to "Company", "properties" to mapOf("name" to "무단"))).status).isEqualTo(401)
        assertThat(client.get("/api/nodes").status).isEqualTo(401)
        assertThat(client.get("/api/changes").status).isEqualTo(401)
        assertThat(client.get("/api/users").status).isEqualTo(401)
        // 비밀번호 로그인 경로는 없다
        assertThat(client.post("/api/auth/login", mapOf("username" to "a", "password" to "b")).status).isEqualTo(401)
    }

    @Test
    fun `허용 목록의 확인된 이메일은 Google 로그인으로 들어온다`() {
        val client = anonymous()
        assertThat(client.oidcLogin(subOf(ALICE), ALICE)).endsWith("/")

        val me = client.get("/api/auth/me")
        assertThat(me.status).isEqualTo(200)
        assertThat(me.body["email"].asString()).isEqualTo(ALICE)
        assertThat(me.body["role"].asString()).isEqualTo("EDITOR")
        assertThat(me.body.has("googleSub")).isFalse()
        val ontology = client.get("/api/ontology").body
        assertThat(ontology["schemaVersion"].asString()).isEqualTo("1.2.0")
        // 만들기 폼과 고르기 후보가 쓰는 정보, 예전 값 별칭도 같은 응답에 실린다
        assertThat(ontology["nodeTypes"]["Company"]["hintProperties"][0].asString()).isEqualTo("country")
        assertThat(ontology["relationshipTypes"]["ISSUES"]["createPicker"]["label"].asString()).isEqualTo("발행 기업")
        assertThat(ontology["nodeTypes"]["Security"]["properties"]["currency"]["valueAliases"]["KRW"].isArray).isTrue()
        // 화면용 표시 이름이 같은 응답에 실려 온다
        assertThat(ontology["nodeTypes"]["Company"]["label"].asString()).isEqualTo("기업")
        assertThat(ontology["nodeTypes"]["Security"]["properties"]["market"]["valueLabels"]["KRX_KOSPI"].asString()).isEqualTo("코스피")
        assertThat(ontology["reviewStatuses"]["DRAFT"]["label"].asString()).isEqualTo("초안")
    }

    @Test
    fun `목록에 없거나 확인되지 않은 이메일, 다른 Google 계정은 거절하고 세션을 만들지 않는다`() {
        val stranger = anonymous()
        assertThat(stranger.oidcLogin("sub-stranger", "stranger@example.com")).endsWith("/?login=denied")
        assertThat(stranger.get("/api/auth/me").status).isEqualTo(401)

        val unverified = anonymous()
        assertThat(unverified.oidcLogin(subOf(BOB), BOB, emailVerified = false)).endsWith("/?login=denied")
        assertThat(unverified.get("/api/auth/me").status).isEqualTo(401)

        // 먼저 BOB 의 sub 을 묶은 뒤, 다른 sub 이 같은 이메일로 오면 거절한다
        loggedIn(BOB)
        val impostor = anonymous()
        assertThat(impostor.oidcLogin("sub-someone-else", BOB)).endsWith("/?login=denied")
        assertThat(impostor.get("/api/auth/me").status).isEqualTo(401)
    }

    @Test
    fun `묶인 sub 으로 찾으므로 Google 이메일이 바뀌어도 같은 사람이다`() {
        loggedIn(ALICE)
        val renamed = anonymous()
        assertThat(renamed.oidcLogin(subOf(ALICE), "alice.new@example.com")).endsWith("/")
        assertThat(renamed.get("/api/auth/me").body["email"].asString()).isEqualTo(ALICE)
    }

    @Test
    fun `CSRF 토큰 없는 쓰기는 로그인해도 거절한다`() {
        val client = loggedIn(ALICE)
        val response = client.send("POST", "/api/auth/logout", null, withCsrf = false)
        assertThat(response.status).isEqualTo(403)
        assertThat(response.code).isEqualTo("CSRF_REJECTED")
    }

    @Test
    fun `로그아웃하면 세션이 사라진다`() {
        val client = loggedIn(BOB)
        assertThat(client.post("/api/auth/logout").status).isEqualTo(204)
        assertThat(client.get("/api/auth/me").status).isEqualTo(401)
    }

    @Test
    fun `health 는 인증 없이 상태만 알린다`() {
        val response = anonymous().get("/api/health")
        assertThat(response.status).isEqualTo(200)
        assertThat(response.body.propertyNames().asSequence().toList()).containsExactly("status")
        assertThat(response.body["status"].asString()).isEqualTo("UP")
    }

    @Test
    fun `보안 헤더를 붙이고 오류는 문서화한 형식으로만 응답한다`() {
        val response = anonymous().get("/api/health")
        assertThat(response.header("Content-Security-Policy")).contains("default-src 'self'").contains("frame-ancestors 'none'")
        assertThat(response.header("X-Content-Type-Options")).isEqualTo("nosniff")
        assertThat(response.header("Referrer-Policy")).isEqualTo("same-origin")
        assertThat(response.header("X-Frame-Options")).isEqualTo("DENY")
        assertThat(response.header("Strict-Transport-Security")).isNull()

        val missing = anonymous().get("/no-such-file.txt")
        assertThat(missing.status).isEqualTo(404)
        assertThat(missing.body.propertyNames().asSequence().toSet()).containsExactlyInAnyOrder("code", "message", "details")
        assertThat(anonymous().get("/actuator/health").status).isEqualTo(404)
    }
}
