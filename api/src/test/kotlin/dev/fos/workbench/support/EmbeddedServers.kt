package dev.fos.workbench.support

import no.nav.security.mock.oauth2.MockOAuth2Server
import no.nav.security.mock.oauth2.OAuth2Config
import java.io.File
import java.net.URI
import java.net.URLClassLoader
import java.time.Duration

/**
 * 테스트 JVM 안에 Neo4j 와 가짜 OIDC 공급자를 띄운다. Docker 가 없어도 돈다.
 * Neo4j 에는 운영 Compose 와 같은 서버 상한(트랜잭션 10초, 잠금 대기 5초)을 준다.
 *
 * Neo4j 하네스 5.26 은 Netty 4.1 을 쓰고 앱의 Neo4j 드라이버 6.1 은 Netty 4.2 를 쓴다.
 * 같은 클래스로더에 두면 Netty 버전이 하나로 맞춰져 Neo4j 가 시작하지 못하고, 하네스의 slf4j 공급자가 Logback 과 부딪힌다.
 * 그래서 Gradle 이 넘긴 하네스 jar 만 담은 클래스로더에서 리플렉션으로 띄운다.
 */
object EmbeddedServers {

    private const val HARNESS_CLASSPATH_PROPERTY = "neo4j.harness.classpath"

    /** 통합 테스트가 나눠 쓰는 Neo4j 의 bolt URI */
    val neo4jUri: String by lazy { startNeo4j() }

    /** 로그인 폼에 sub 과 claims JSON 을 넣으면 그 값으로 ID 토큰을 발급한다. */
    val mockOidc: MockOAuth2Server by lazy {
        MockOAuth2Server(OAuth2Config(interactiveLogin = true)).also { it.start() }
    }

    fun mockOidcUrl(): String = mockOidc.baseUrl().toString().trimEnd('/')

    /** 새 Neo4j 를 띄우고 bolt URI 를 돌려준다. 서버는 JVM 이 끝날 때 닫는다. */
    fun startNeo4j(): String {
        val classpath = System.getProperty(HARNESS_CLASSPATH_PROPERTY)
            ?: error("시스템 속성 $HARNESS_CLASSPATH_PROPERTY 가 없다. 테스트는 ./gradlew test 로 돌린다")
        val urls = classpath.split(File.pathSeparator).filter { it.isNotBlank() }.map { File(it).toURI().toURL() }
        val loader = URLClassLoader(urls.toTypedArray(), ClassLoader.getPlatformClassLoader())

        val settings = loader.loadClass("org.neo4j.configuration.GraphDatabaseSettings")
        val settingType = loader.loadClass("org.neo4j.graphdb.config.Setting")
        val builderType = loader.loadClass("org.neo4j.harness.Neo4jBuilder")
        val neo4jType = loader.loadClass("org.neo4j.harness.Neo4j")
        val withConfig = builderType.getMethod("withConfig", settingType, Any::class.java)

        var builder = loader.loadClass("org.neo4j.harness.Neo4jBuilders").getMethod("newInProcessBuilder").invoke(null)
        builder = withConfig.invoke(builder, settings.getField("transaction_timeout").get(null), Duration.ofSeconds(10))
        builder = withConfig.invoke(builder, settings.getField("lock_acquisition_timeout").get(null), Duration.ofSeconds(5))
        builder = builderType.getMethod("withDisabledServer").invoke(builder)
        val neo4j = builderType.getMethod("build").invoke(builder) as AutoCloseable

        Runtime.getRuntime().addShutdownHook(Thread {
            neo4j.close()
            loader.close()
        })
        return (neo4jType.getMethod("boltURI").invoke(neo4j) as URI).toString()
    }
}
