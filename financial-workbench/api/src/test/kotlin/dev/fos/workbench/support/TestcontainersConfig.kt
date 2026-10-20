package dev.fos.workbench.support

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.testcontainers.neo4j.Neo4jContainer
import org.testcontainers.utility.DockerImageName

/** 실제 Neo4j 를 띄운다. 운영 Compose 와 같은 이미지다. 테스트 JVM 하나에 컨테이너 하나만 쓴다. */
@TestConfiguration(proxyBeanMethods = false)
class TestcontainersConfig {

    @Bean
    @ServiceConnection
    fun neo4j(): Neo4jContainer = CONTAINER

    companion object {
        const val IMAGE = "neo4j:5.26.30-community"
        val CONTAINER: Neo4jContainer = Neo4jContainer(DockerImageName.parse(IMAGE))
            .withAdminPassword("integration-test-password")
            .withReuse(false)
    }
}
