package dev.fos.workbench.oauth

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class RedirectUrisTest {

    private val registered = "http://localhost:1234/callback"

    @Test
    fun `등록한 주소와 글자까지 같아야 맞는다`() {
        assertThat(RedirectUris.matches(registered, "http://localhost:1234/callback")).isTrue()
        for (requested in listOf("http://localhost:5678/callback", "http://localhost:1234/callback/extra", "http://localhost:1234/callbackx")) {
            assertThat(RedirectUris.matches(registered, requested)).describedAs(requested).isFalse()
        }
    }

    @Test
    fun `loopback 의 http 와 https 만 받는다`() {
        for (uri in listOf("http://localhost:1234/callback", "http://127.0.0.1:53682/cb", "http://[::1]:8080/cb", "https://app.example.com/cb")) {
            assertThat(RedirectUris.validate(uri)).describedAs(uri).isTrue()
        }
        for (uri in listOf("http://example.com/cb", "custom://cb", "http://localhost/cb#x", "/cb", "http://localhost@example.com/cb")) {
            assertThat(RedirectUris.validate(uri)).describedAs(uri).isFalse()
        }
    }

    @Test
    fun `2000자까지 받고 2001자는 거절한다`() {
        val prefix = "https://app.example.com/"
        val atLimit = prefix + "a".repeat(RedirectUris.MAX_LENGTH - prefix.length)
        assertThat(atLimit).hasSize(2000)
        assertThat(RedirectUris.validate(atLimit)).isTrue()
        assertThat(RedirectUris.validate(atLimit + "a")).isFalse()
    }

    @Test
    fun `loopback 은 http 의 세 host 다`() {
        assertThat(RedirectUris.isLoopback("http://127.0.0.1:1/cb")).isTrue()
        assertThat(RedirectUris.isLoopback("https://localhost/cb")).isFalse()
        assertThat(RedirectUris.isLoopback("http://example.com/cb")).isFalse()
    }
}
