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
}
