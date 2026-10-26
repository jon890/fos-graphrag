package dev.fos.workbench.config

import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.core.env.Environment
import org.springframework.core.env.Profiles
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.stereotype.Component

/**
 * 운영 프로필이 안전하지 않은 설정으로 시작하지 않게 막는다.
 * - Neo4j 비밀번호와 Google client 값이 비어 있으면 실패한다. 값이 아예 없으면 placeholder 단계에서 먼저 실패한다.
 * - 가짜 OIDC 프로필(mockoidc)과 함께 켜지면 실패한다. 가짜 공급자는 아무 이메일이나 확인된 것으로 발급한다.
 * - google 등록이 실제 Google 발급자를 가리키지 않으면 실패한다.
 * - X-Forwarded-* 를 읽는데 app 포트가 loopback 밖에 열리고 믿을 프록시를 명시하지 않았으면 실패한다.
 *   기본 신뢰 대역(loopback, 172.16.0.0/12)은 bind 가 loopback 일 때만 안전하다. 밖에 열면 외부 클라이언트가
 *   Docker 게이트웨이 주소로 들어와 신뢰 대상이 되고 X-Forwarded-For 를 마음대로 넣는다.
 */
@Component
@Profile("prod")
class ProdStartupGuard(
    private val environment: Environment,
    private val registrations: ClientRegistrationRepository,
    @Value("\${spring.neo4j.authentication.password:}") private val neo4jPassword: String,
) : InitializingBean {

    override fun afterPropertiesSet() {
        check(!environment.acceptsProfiles(Profiles.of(MOCK_PROFILE))) {
            "prod 프로필은 mockoidc 와 함께 켤 수 없다. 브라우저 테스트는 e2e 프로필을 쓴다."
        }
        check(neo4jPassword.isNotBlank()) { "NEO4J_PASSWORD 가 비어 있다. 운영 프로필은 기본 비밀번호 없이 시작하지 않는다." }
        val google = registrations.findByRegistrationId("google")
            ?: error("google OAuth 등록이 없다. GOOGLE_CLIENT_ID 와 GOOGLE_CLIENT_SECRET 을 확인한다.")
        check(google.clientId.isNotBlank() && !google.clientSecret.isNullOrBlank()) {
            "GOOGLE_CLIENT_ID 와 GOOGLE_CLIENT_SECRET 이 필요하다. 운영 프로필은 Google 로그인 설정 없이 시작하지 않는다."
        }
        check(google.providerDetails.issuerUri == GOOGLE_ISSUER) {
            "google 등록의 발급자가 $GOOGLE_ISSUER 가 아니다: ${google.providerDetails.issuerUri}"
        }
        check(google.providerDetails.authorizationUri.orEmpty().startsWith("$GOOGLE_ISSUER/")) {
            "google 등록의 인가 주소가 Google 이 아니다."
        }
        val strategy = environment.getProperty("server.forward-headers-strategy", "none").lowercase()
        val bind = environment.getProperty("WORKBENCH_BIND", "127.0.0.1").trim()
        val explicitProxies = environment.getProperty("WORKBENCH_TRUSTED_PROXIES_EXPLICIT", "").trim()
        check(strategy == "none" || isLoopback(bind) || explicitProxies.isNotEmpty()) {
            "WORKBENCH_BIND=$bind 처럼 loopback 밖에 열면서 forward headers 를 읽으려면 WORKBENCH_TRUSTED_PROXIES 에 앞단 프록시 주소를 명시해야 한다."
        }
    }

    private fun isLoopback(host: String) = host == "localhost" || host == "::1" || host.startsWith("127.")

    companion object {
        const val MOCK_PROFILE = "mockoidc"
        const val GOOGLE_ISSUER = "https://accounts.google.com"
    }
}
