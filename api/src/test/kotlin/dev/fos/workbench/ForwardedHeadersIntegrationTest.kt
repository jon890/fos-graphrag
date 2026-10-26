package dev.fos.workbench

import dev.fos.workbench.support.IntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.test.context.TestPropertySource
import java.net.URLDecoder

/** 앞단 프록시가 보낸 X-Forwarded-* 는 믿는 주소에서 왔을 때만 OAuth redirect URI 와 OAuth 메타데이터의 주소에 반영된다. */
class ForwardedHeadersIntegrationTest {

    private fun redirectUri(location: String) =
        URLDecoder.decode(location.substringAfter("redirect_uri=").substringBefore('&'), Charsets.UTF_8)

    private val forwarded = mapOf("X-Forwarded-Proto" to "https", "X-Forwarded-Host" to "workbench.example.com", "X-Forwarded-Port" to "443")

    @Nested
    @TestPropertySource(properties = ["WORKBENCH_FORWARD_HEADERS_STRATEGY=native"])
    inner class TrustedProxy : IntegrationTest() {
        @Test
        fun `loopback 프록시의 헤더로 공개 origin 의 redirect URI 를 만든다`() {
            val location = anonymous().firstRedirect("/oauth2/authorization/google", forwarded)
            assertThat(redirectUri(location)).isEqualTo("https://workbench.example.com/login/oauth2/code/google")
        }

        @Test
        fun `OAuth 메타데이터의 주소도 프록시가 넘긴 공개 origin 이다`() {
            val headers = mapOf("X-Forwarded-Proto" to "https", "X-Forwarded-Host" to "graph.example.com")
            val response = anonymous().send("GET", "/.well-known/oauth-authorization-server", null, headers = headers)
            assertThat(response.status).describedAs(response.body.toString()).isEqualTo(200)
            assertThat(response.body["issuer"].asString()).isEqualTo("https://graph.example.com")
            assertThat(response.body["token_endpoint"].asString()).isEqualTo("https://graph.example.com/oauth/token")

            val resource = anonymous().send("GET", "/.well-known/oauth-protected-resource/mcp", null, headers = headers)
            assertThat(resource.body["resource"].asString()).isEqualTo("https://graph.example.com/mcp")
        }
    }

    @Nested
    @TestPropertySource(properties = ["WORKBENCH_FORWARD_HEADERS_STRATEGY=native", "WORKBENCH_TRUSTED_PROXIES=10\\\\.9\\\\.9\\\\.9"])
    inner class UntrustedProxy : IntegrationTest() {
        @Test
        fun `믿지 않는 주소가 보낸 헤더는 무시한다`() {
            val location = anonymous().firstRedirect("/oauth2/authorization/google", forwarded)
            assertThat(redirectUri(location)).startsWith("http://localhost:")
        }

        @Test
        fun `믿지 않는 주소가 보낸 헤더는 OAuth 메타데이터의 주소도 바꾸지 못한다`() {
            val response = anonymous().send("GET", "/.well-known/oauth-authorization-server", null, headers = forwarded)
            assertThat(response.body["issuer"].asString()).startsWith("http://localhost:")
        }
    }
}
