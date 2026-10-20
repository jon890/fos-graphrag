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

        val write = client.post("/api/nodes", mapOf("type" to "Company", "properties" to mapOf("name" to "무단")))
        assertThat(write.status).isEqualTo(401)

        assertThat(client.get("/api/nodes").status).isEqualTo(401)
        assertThat(client.get("/api/changes").status).isEqualTo(401)
    }

    @Test
    fun `CSRF 토큰이 없는 로그인을 거절한다`() {
        val client = anonymous()
        val response = client.send("POST", "/api/auth/login", mapOf("username" to ALICE, "password" to PASSWORD), withCsrf = false)
        assertThat(response.status).isEqualTo(403)
        assertThat(response.code).isEqualTo("CSRF_REJECTED")
    }

    @Test
    fun `로그인한 사용자는 온톨로지를 읽는다`() {
        val client = loggedIn(ALICE)

        val me = client.get("/api/auth/me")
        assertThat(me.status).isEqualTo(200)
        assertThat(me.body["username"].asString()).isEqualTo(ALICE)
        assertThat(me.body.has("passwordHash")).isFalse()

        val ontology = client.get("/api/ontology")
        assertThat(ontology.status).isEqualTo(200)
        assertThat(ontology.body["schemaVersion"].asString()).isEqualTo("1.0.0")
        assertThat(ontology.body["nodeTypes"]["Security"]["properties"]["market"]["type"].asString()).isEqualTo("enum")
    }

    @Test
    fun `로그인한 사용자도 CSRF 토큰 없이 쓰지 못한다`() {
        val client = loggedIn(ALICE)
        val response = client.send("POST", "/api/auth/logout", null, withCsrf = false)
        assertThat(response.status).isEqualTo(403)
        assertThat(response.code).isEqualTo("CSRF_REJECTED")
    }

    @Test
    fun `틀린 비밀번호는 401 이다`() {
        val response = anonymous().login(ALICE, "wrong-password-123")
        assertThat(response.status).isEqualTo(401)
        assertThat(response.code).isEqualTo("INVALID_CREDENTIALS")
    }

    @Test
    fun `로그아웃하면 세션이 사라진다`() {
        val client = loggedIn(BOB)
        assertThat(client.post("/api/auth/logout").status).isEqualTo(204)
        assertThat(client.get("/api/auth/me").status).isEqualTo(401)
    }

    @Test
    fun `health 는 인증 없이 Neo4j 상태를 알린다`() {
        val response = anonymous().get("/api/health")
        assertThat(response.status).isEqualTo(200)
        assertThat(response.body["neo4j"].asString()).isEqualTo("UP")
        assertThat(response.body["ontologyVersion"].asString()).isEqualTo("1.0.0")
    }
}
