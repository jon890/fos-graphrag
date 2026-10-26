package dev.fos.workbench.oauth

import dev.fos.workbench.config.WorkbenchProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class OAuthUrlsTest {

    private fun urls(publicUrl: String) = OAuthUrls(WorkbenchProperties(oauth = WorkbenchProperties.OAuth(publicUrl = publicUrl)))

    @Test
    fun `공개 주소가 있으면 끝의 슬래시를 빼고 요청 없이 그 값을 쓴다`() {
        val urls = urls("https://graph.example.com/")
        assertThat(urls.base()).isEqualTo("https://graph.example.com")
        assertThat(urls.resource()).isEqualTo("https://graph.example.com/mcp")
        assertThat(urls("http://127.0.0.1:8081").base()).isEqualTo("http://127.0.0.1:8081")
    }

    @Test
    fun `공개 주소가 http 나 https 의 절대 주소가 아니면 만들지 않는다`() {
        for (value in listOf("graph.example.com", "ftp://graph.example.com", "https://", "https://u@graph.example.com", "https://graph.example.com/?a=1", "https://graph.example.com/#x", "https://exa mple.com")) {
            assertThatThrownBy { urls(value) }.describedAs(value).isInstanceOf(IllegalStateException::class.java)
        }
    }
}
