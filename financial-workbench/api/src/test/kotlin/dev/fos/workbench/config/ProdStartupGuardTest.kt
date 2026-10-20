package dev.fos.workbench.config

import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository
import org.springframework.security.oauth2.core.AuthorizationGrantType

class ProdStartupGuardTest {

    private val google = CommonOAuth2Provider.GOOGLE.getBuilder("google").clientId("id").clientSecret("secret").build()

    private fun guard(
        registration: ClientRegistration,
        vararg profiles: String,
        password: String = "pw",
        properties: Map<String, String> = emptyMap(),
    ) = ProdStartupGuard(
        MockEnvironment().apply {
            setActiveProfiles(*profiles)
            properties.forEach { (k, v) -> setProperty(k, v) }
        },
        InMemoryClientRegistrationRepository(registration),
        password,
    )

    @Test
    fun `실제 Google 등록과 비밀값이 있으면 통과한다`() {
        assertThatCode { guard(google, "prod", "container").afterPropertiesSet() }.doesNotThrowAnyException()
    }

    @Test
    fun `mockoidc 와 함께 켜지면 시작하지 않는다`() {
        assertThatThrownBy { guard(google, "prod", "mockoidc").afterPropertiesSet() }.hasMessageContaining("mockoidc")
    }

    @Test
    fun `Google 이 아닌 발급자를 가리키면 시작하지 않는다`() {
        val mock = ClientRegistration.withRegistrationId("google")
            .clientId("workbench-local").clientSecret("workbench-local-secret")
            .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
            .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
            .authorizationUri("http://localhost:8090/default/authorize").tokenUri("http://localhost:8090/default/token")
            .jwkSetUri("http://localhost:8090/default/jwks").scope("openid")
            .build()
        assertThatThrownBy { guard(mock, "prod").afterPropertiesSet() }.hasMessageContaining("발급자")
    }

    @Test
    fun `빈 Neo4j 비밀번호와 빈 client secret 은 시작하지 않는다`() {
        assertThatThrownBy { guard(google, "prod", password = "").afterPropertiesSet() }.hasMessageContaining("NEO4J_PASSWORD")
        val noSecret = CommonOAuth2Provider.GOOGLE.getBuilder("google").clientId("id").clientSecret("").build()
        assertThatThrownBy { guard(noSecret, "prod").afterPropertiesSet() }.hasMessageContaining("GOOGLE_CLIENT")
    }

    @Test
    fun `loopback 밖에 열면서 forward headers 를 읽으면 믿을 프록시를 명시해야 한다`() {
        val native = mapOf("server.forward-headers-strategy" to "native")
        assertThatCode { guard(google, "prod", properties = native + ("WORKBENCH_BIND" to "127.0.0.1")).afterPropertiesSet() }
            .doesNotThrowAnyException()
        assertThatThrownBy { guard(google, "prod", properties = native + ("WORKBENCH_BIND" to "0.0.0.0")).afterPropertiesSet() }
            .hasMessageContaining("WORKBENCH_TRUSTED_PROXIES")
        assertThatCode {
            guard(google, "prod", properties = native + mapOf("WORKBENCH_BIND" to "10.0.0.5", "WORKBENCH_TRUSTED_PROXIES_EXPLICIT" to "10\\.0\\.0\\.9")).afterPropertiesSet()
        }.doesNotThrowAnyException()
        // forward headers 를 읽지 않으면 bind 와 상관없다
        assertThatCode { guard(google, "prod", properties = mapOf("WORKBENCH_BIND" to "0.0.0.0")).afterPropertiesSet() }
            .doesNotThrowAnyException()
    }
}
