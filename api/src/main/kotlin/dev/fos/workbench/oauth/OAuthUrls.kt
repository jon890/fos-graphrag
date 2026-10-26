package dev.fos.workbench.oauth

import org.springframework.web.servlet.support.ServletUriComponentsBuilder

/**
 * 현재 요청의 scheme, host, 포트로 만든 주소(`{base}`, docs/api-contract.md 「OAuth 인가 서버」).
 * 앞단이 넘긴 `X-Forwarded-*` 는 Tomcat 이 믿는 프록시에서 왔을 때만 요청에 반영된다(`server.forward-headers-strategy`).
 * 요청 스레드에서만 부른다.
 */
object OAuthUrls {
    fun base(): String = ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString()

    /** 접근 토큰의 자원 주소 */
    fun resource(): String = base() + "/mcp"
}
