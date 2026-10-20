package dev.fos.workbench.config

import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * 운영 프로필은 비밀값 기본값 없이 시작하지 않는다.
 * 값이 아예 없으면 설정 placeholder 단계에서 먼저 실패하고, 빈 문자열이면 여기서 실패한다.
 */
@Component
@Profile("prod")
class ProdPasswordGuard(
    @Value("\${spring.neo4j.authentication.password:}") private val neo4jPassword: String,
    @Value("\${spring.security.oauth2.client.registration.google.client-id:}") private val clientId: String,
    @Value("\${spring.security.oauth2.client.registration.google.client-secret:}") private val clientSecret: String,
) : InitializingBean {
    override fun afterPropertiesSet() {
        check(neo4jPassword.isNotBlank()) { "NEO4J_PASSWORD 가 비어 있다. 운영 프로필은 기본 비밀번호 없이 시작하지 않는다." }
        check(clientId.isNotBlank() && clientSecret.isNotBlank()) {
            "GOOGLE_CLIENT_ID 와 GOOGLE_CLIENT_SECRET 이 필요하다. 운영 프로필은 Google 로그인 설정 없이 시작하지 않는다."
        }
    }
}
