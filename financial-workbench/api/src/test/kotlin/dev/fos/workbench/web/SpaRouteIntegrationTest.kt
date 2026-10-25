package dev.fos.workbench.web

import dev.fos.workbench.support.IntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

class SpaRouteIntegrationTest : IntegrationTest() {

    private val http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build()

    // ApiClient 는 JSON 만 받으므로 화면 경로는 브라우저가 보내는 Accept 로 부른다. 브라우저는 모든 형식도 함께 받는다고 보낸다.
    private fun getHtml(path: String): HttpResponse<String> {
        val base = "http://localhost:${environment.getProperty("local.server.port")}"
        val request = HttpRequest.newBuilder(URI.create(base + path)).header("Accept", "text/html,application/xhtml+xml,*/*;q=0.8").timeout(Duration.ofSeconds(30)).GET().build()
        return http.send(request, HttpResponse.BodyHandlers.ofString())
    }

    @Test
    fun `화면 경로는 로그인 없이 index html 을 돌려준다`() {
        for (path in listOf("/changes?target=x", "/users", "/tokens", "/proposals", "/workspace?node=a&pane=detail", "/list", "/review", "/ontology", "/map?type=Bottleneck", "/study", "/trace?node=x")) {
            val response = getHtml(path)
            assertThat(response.statusCode()).describedAs(path).isEqualTo(200)
            assertThat(response.body()).describedAs(path).contains("workbench-test-index")
        }
    }

    @Test
    fun `목록 밖 경로는 404 NOT_FOUND 다`() {
        val response = getHtml("/nope")
        assertThat(response.statusCode()).isEqualTo(404)
        assertThat(response.body()).contains("NOT_FOUND")
    }

    @Test
    fun `api 아래 없는 경로는 화면으로 넘어가지 않는다`() {
        val viewer = loggedIn(VIEWER).get("/api/nope")
        assertThat(viewer.status).isEqualTo(404)
        assertThat(viewer.code).isEqualTo("NOT_FOUND")
        assertThat(anonymous().get("/api/nope").status).isEqualTo(401)
    }
}
