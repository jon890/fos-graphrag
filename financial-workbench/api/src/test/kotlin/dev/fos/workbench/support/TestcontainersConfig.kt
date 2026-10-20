package dev.fos.workbench.support

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.neo4j.Neo4jContainer
import org.testcontainers.utility.DockerImageName

/**
 * 실제 Neo4j 와 가짜 OIDC 공급자를 띄운다. Neo4j 는 운영 Compose 와 같은 이미지다.
 * 테스트 JVM 하나에 컨테이너를 하나씩만 쓴다.
 */
@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfig {

    @Bean
    @ServiceConnection
    fun neo4j(): Neo4jContainer = NEO4J

    companion object {
        const val NEO4J_IMAGE = "neo4j:5.26.30-community"
        const val MOCK_OIDC_IMAGE = "ghcr.io/navikt/mock-oauth2-server:3.0.1"

        val NEO4J: Neo4jContainer = Neo4jContainer(DockerImageName.parse(NEO4J_IMAGE))
            .withAdminPassword("integration-test-password")
            // 운영 Compose 와 같은 서버 상한
            .withNeo4jConfig("db.transaction.timeout", "10s")
            .withNeo4jConfig("db.lock.acquisition.timeout", "5s")

        /** 로그인 폼에 sub 과 claims JSON 을 넣으면 그 값으로 ID 토큰을 발급한다. */
        val MOCK_OIDC: GenericContainer<*> = GenericContainer(DockerImageName.parse(MOCK_OIDC_IMAGE))
            .withExposedPorts(8080)
            .withEnv("JSON_CONFIG", """{"interactiveLogin":true}""")
            .waitingFor(Wait.forHttp("/default/.well-known/openid-configuration").forStatusCode(200))

        fun mockOidcUrl(): String {
            if (!MOCK_OIDC.isRunning) MOCK_OIDC.start()
            return "http://localhost:${MOCK_OIDC.getMappedPort(8080)}"
        }
    }
}
