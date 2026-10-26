package dev.fos.workbench.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

@ConfigurationProperties("workbench")
data class WorkbenchProperties(
    val graph: Graph = Graph(),
    val detail: Detail = Detail(),
    val security: Security = Security(),
    val bootstrap: Bootstrap = Bootstrap(),
    val seeds: Seeds = Seeds(),
    val agent: Agent = Agent(),
    val oauth: OAuth = OAuth(),
) {
    data class Graph(
        val maxHops: Int = 2,
        val maxNodes: Int = 150,
        val maxRelationships: Int = 300,
        val timeout: Duration = Duration.ofSeconds(5),
    )

    /** 노드 상세의 관계와 Claim 목록 상한. 넘으면 잘라 내고 truncated 를 표시한다. */
    data class Detail(
        val maxRelationships: Int = 100,
        val maxClaims: Int = 50,
    )

    data class Security(
        /** 세션 쿠키와 CSRF 쿠키의 Secure 속성. TLS 를 끝내는 앞단 뒤에서는 켠다. */
        val secureCookies: Boolean = false,
        /** 앞단이 HSTS 를 붙이지 않을 때만 켠다. */
        val hsts: Boolean = false,
    )

    data class Bootstrap(
        /** 사용자가 한 명도 없을 때 시작하면서 만들 첫 ADMIN 의 이메일. */
        val adminEmail: String? = null,
        val adminName: String = "관리자",
    )

    data class Seeds(
        /** 시작할 때 초기 데이터(ontology/seeds 폴더의 YAML)를 적용할지 */
        val enabled: Boolean = true,
    )

    data class Agent(
        /** 연동 토큰 하나가 1분에 부를 수 있는 /api/v1 요청 수 */
        val rateLimitPerMinute: Int = 60,
        /** 연동 토큰 하나가 1분에 부를 수 있는 /api/v1 쓰기 요청 수. 전체 한도에도 함께 센다 */
        val writeRateLimitPerMinute: Int = 10,
        /** 사용자마다 폐기하지 않은 연동 토큰 수 */
        val maxTokensPerUser: Int = 5,
    )

    /** OAuth 인가 서버. 값은 docs/code-architecture.md 「설정」 표와 같다 */
    data class OAuth(
        val accessTokenTtl: Duration = Duration.ofHours(1),
        val refreshTokenTtl: Duration = Duration.ofDays(30),
        /** 인가 코드는 이 시간 안에 한 번만 쓴다 */
        val codeTtl: Duration = Duration.ofSeconds(60),
        /** 사용자마다 남기는 앱 연결 수. 넘으면 가장 오래 쓰지 않은 것부터 지운다 */
        val maxGrantsPerUser: Int = 20,
        /** 같은 IP 가 1분에 부를 수 있는 /oauth/register 수 */
        val registerRateLimitPerMinute: Int = 10,
        /** 같은 IP 가 1분에 부를 수 있는 /oauth/token 과 /oauth/revoke 수 */
        val tokenRateLimitPerMinute: Int = 30,
        /** 이 서버의 공개 주소. 비어 있으면 요청의 scheme, host, 포트로 만든다. 값이 있으면 http(s) 절대 주소여야 시작한다 */
        val publicUrl: String = "",
        /** 등록에서 `https` redirect URI 로 받는 host. 소문자로 비교한다. 비어 있으면 loopback 의 `http` 만 받는다 */
        val allowedHttpsRedirectHosts: List<String> = emptyList(),
        /** 승인받지 못한 클라이언트 전체 수 상한. 오래된 것을 지운 뒤에도 이만큼 있으면 등록을 503 으로 거절한다 */
        val maxUnapprovedClients: Int = 1000,
    )
}
