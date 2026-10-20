package dev.fos.workbench.support

import dev.fos.workbench.auth.UserRepository
import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.core.env.Environment
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.security.crypto.password.PasswordEncoder
import tools.jackson.databind.json.JsonMapper

/**
 * 실제 서버 포트와 실제 Neo4j 컨테이너로 도는 통합 테스트의 공통 설정.
 * NEO4J_PASSWORD 는 설정 placeholder 를 채우기 위한 값이고, 접속 정보는 ServiceConnection 이 덮어쓴다.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["NEO4J_PASSWORD=placeholder-overridden-by-service-connection"],
)
@Import(TestcontainersConfig::class)
abstract class IntegrationTest {

    @Autowired lateinit var environment: Environment
    @Autowired lateinit var users: UserRepository
    @Autowired lateinit var encoder: PasswordEncoder
    @Autowired lateinit var mapper: JsonMapper
    @Autowired lateinit var neo4j: Neo4jClient

    @BeforeEach
    fun ensureUsers() {
        listOf(ALICE to "Alice", BOB to "Bob").forEach { (name, display) ->
            if (users.findByUsername(name) == null) users.create(name, display, encoder.encode(PASSWORD)!!)
        }
    }

    fun anonymous(): ApiClient = ApiClient("http://localhost:${environment.getProperty("local.server.port")}", mapper)

    fun loggedIn(username: String): ApiClient = anonymous().also {
        val response = it.login(username, PASSWORD)
        check(response.status == 200) { "로그인 실패: ${response.status} ${response.body}" }
    }

    companion object {
        const val ALICE = "alice"
        const val BOB = "bob"
        const val PASSWORD = "correct-horse-battery"
    }
}
