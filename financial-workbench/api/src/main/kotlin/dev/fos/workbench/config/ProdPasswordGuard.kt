package dev.fos.workbench.config

import org.springframework.beans.factory.InitializingBean
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/** 운영 프로필은 빈 Neo4j 비밀번호로 시작하지 않는다. 값이 아예 없으면 설정 placeholder 단계에서 먼저 실패한다. */
@Component
@Profile("prod")
class ProdPasswordGuard(
    @Value("\${spring.neo4j.authentication.password:}") private val password: String,
) : InitializingBean {
    override fun afterPropertiesSet() {
        check(password.isNotBlank()) { "NEO4J_PASSWORD 가 비어 있다. 운영 프로필은 기본 비밀번호 없이 시작하지 않는다." }
    }
}
