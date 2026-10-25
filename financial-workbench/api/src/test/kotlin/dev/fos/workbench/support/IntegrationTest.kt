package dev.fos.workbench.support

import dev.fos.workbench.auth.Role
import dev.fos.workbench.auth.UserRepository
import org.junit.jupiter.api.BeforeEach
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.core.env.Environment
import org.springframework.data.neo4j.core.Neo4jClient
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import tools.jackson.databind.json.JsonMapper
import java.util.UUID

/**
 * 실제 서버 포트, 실제 Neo4j, 가짜 OIDC 공급자로 도는 통합 테스트의 공통 설정.
 * NEO4J_PASSWORD 는 설정 placeholder 를 채우기 위한 값이고, 접속 정보는 ServiceConnection 이 덮어쓴다.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["NEO4J_PASSWORD=placeholder-overridden-by-service-connection"],
)
@ActiveProfiles("mockoidc")
@Import(TestcontainersConfig::class)
abstract class IntegrationTest {

    @Autowired lateinit var environment: Environment
    @Autowired lateinit var users: UserRepository
    @Autowired lateinit var mapper: JsonMapper
    @Autowired lateinit var neo4j: Neo4jClient

    @BeforeEach
    fun ensureUsers() {
        USERS.forEach { (email, name, role) ->
            if (users.findByEmail(email) == null) users.create(email, name, role, "system")
        }
    }

    fun anonymous(): ApiClient = ApiClient("http://localhost:${environment.getProperty("local.server.port")}", mapper)

    /** 허용 목록의 이메일로 가짜 공급자를 거쳐 로그인한다. sub 은 이메일마다 고정이다. */
    fun loggedIn(email: String): ApiClient = anonymous().also {
        val location = it.oidcLogin(subOf(email), email)
        check(location.endsWith("/") && !location.contains("denied")) { "로그인 실패: $location" }
    }

    fun subOf(email: String) = "sub-$email"

    /** 실행마다 다른 이메일의 허용 사용자를 만들고 그 이메일을 돌려준다 */
    fun newUser(role: Role, name: String = "새사용자"): String {
        val email = "u-${UUID.randomUUID().toString().take(8)}@example.com"
        users.create(email, name, role, "system")
        return email
    }

    companion object {
        const val ALICE = "alice@example.com"
        const val BOB = "bob@example.com"
        const val ADMIN = "admin@example.com"
        const val VIEWER = "viewer@example.com"

        val USERS = listOf(
            Triple(ALICE, "Alice", Role.EDITOR),
            Triple(BOB, "Bob", Role.EDITOR),
            Triple(ADMIN, "Admin", Role.ADMIN),
            Triple(VIEWER, "Viewer", Role.VIEWER),
        )

        @JvmStatic
        @DynamicPropertySource
        fun mockOidc(registry: DynamicPropertyRegistry) {
            registry.add("MOCK_OIDC_BROWSER_URL") { TestcontainersConfig.mockOidcUrl() }
            registry.add("MOCK_OIDC_INTERNAL_URL") { TestcontainersConfig.mockOidcUrl() }
        }
    }
}
