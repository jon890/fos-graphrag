package dev.fos.workbench

import dev.fos.workbench.support.IntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.springframework.test.context.TestPropertySource
import java.net.URLDecoder

/** 앞단 프록시가 보낸 X-Forwarded-* 는 믿는 주소에서 왔을 때만 OAuth redirect URI 에 반영된다. */
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
    }

    @Nested
    @TestPropertySource(properties = ["WORKBENCH_FORWARD_HEADERS_STRATEGY=native", "WORKBENCH_TRUSTED_PROXIES=10\\\\.9\\\\.9\\\\.9"])
    inner class UntrustedProxy : IntegrationTest() {
        @Test
        fun `믿지 않는 주소가 보낸 헤더는 무시한다`() {
            val location = anonymous().firstRedirect("/oauth2/authorization/google", forwarded)
            assertThat(redirectUri(location)).startsWith("http://localhost:")
        }
    }
}
