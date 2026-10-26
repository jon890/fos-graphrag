package dev.fos.workbench.oauth

import dev.fos.workbench.config.WorkbenchProperties
import org.springframework.stereotype.Component
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import java.net.URI
import java.net.URISyntaxException

/**
 * 이 서버의 공개 주소(`{base}`, docs/api-contract.md 「OAuth 인가 서버」).
 * `workbench.oauth.public-url` 이 있으면 그 값(끝의 `/` 를 뺀다)을 쓰고, 없으면 현재 요청의 scheme, host, 포트로 만든다.
 * 고정 값이 있으면 issuer, 자원 주소, `resource_metadata`, `Origin` 비교가 `Host` 와 `X-Forwarded-*` 에 따라 바뀌지 않는다.
 * 요청에서 만들 때 앞단이 넘긴 `X-Forwarded-*` 는 Tomcat 이 믿는 프록시에서 왔을 때만 반영된다(`server.forward-headers-strategy`).
 * 고정 값이 없으면 요청 스레드에서만 부른다.
 */
@Component
class OAuthUrls(properties: WorkbenchProperties) {

    private val publicUrl: String? = properties.oauth.publicUrl.trim().takeIf { it.isNotEmpty() }?.let(::normalize)

    fun base(): String = publicUrl ?: ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString()

    /** 접근 토큰의 자원 주소 */
    fun resource(): String = base() + "/mcp"

    companion object {
        /** http(s) 절대 주소가 아니면 시작을 멈춘다. query, fragment, 사용자 정보도 받지 않는다 */
        private fun normalize(value: String): String {
            val uri = try {
                URI(value)
            } catch (e: URISyntaxException) {
                null
            }
            check(
                uri != null && uri.scheme in setOf("http", "https") && !uri.host.isNullOrEmpty() &&
                    uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null,
            ) { "workbench.oauth.public-url(WORKBENCH_PUBLIC_URL) 은 http 나 https 의 절대 주소여야 한다: $value" }
            return value.trimEnd('/')
        }
    }
}
