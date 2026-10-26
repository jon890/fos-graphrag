package dev.fos.workbench.oauth

import java.net.URI
import java.net.URISyntaxException

/**
 * 등록과 인가 요청의 `redirect_uri` 규칙(docs/api-contract.md 「`POST /oauth/register`」, 「인가 요청과 동의」).
 * 받는 주소는 loopback 의 `http` 와, 설정이 허용한 host 의 `https` 뿐이다. 인가 요청의 주소는 등록한 값과 글자까지 같아야 한다.
 * 아무 `https` host 나 받으면 누구나 등록한 클라이언트가 동의 화면에서 코드를 자기 서버로 받아 간다. 그래서 기본은 loopback 만이다.
 * loopback 의 포트만 다른 주소와 접두 일치는 받지 않는다(최신 MCP 인증 규격의 정확 일치).
 */
object RedirectUris {
    const val MAX_LENGTH = 2000

    private val LOOPBACK_HOSTS = setOf("127.0.0.1", "localhost", "[::1]")

    /** fragment 가 없는 절대 주소이고, loopback 의 `http` 이거나 host 가 [allowedHttpsHosts] 에 있는 `https` 다. host 는 소문자로 비교한다 */
    fun validate(uri: String, allowedHttpsHosts: Collection<String>): Boolean {
        if (uri.length > MAX_LENGTH || uri.contains('#')) return false
        val parsed = parse(uri) ?: return false
        if (!parsed.isAbsolute || parsed.isOpaque || parsed.rawUserInfo != null) return false
        val host = parsed.host ?: return false
        return when (parsed.scheme) {
            "https" -> host.isNotEmpty() && allowedHttpsHosts.any { it.lowercase() == host.lowercase() }
            "http" -> host in LOOPBACK_HOSTS
            else -> false
        }
    }

    fun isLoopback(uri: String): Boolean {
        val parsed = parse(uri) ?: return false
        return parsed.scheme == "http" && parsed.host in LOOPBACK_HOSTS
    }

    /** 등록한 주소와 요청한 주소가 글자까지 같다 */
    fun matches(registered: String, requested: String): Boolean = registered == requested

    private fun parse(uri: String): URI? = try {
        URI(uri)
    } catch (e: URISyntaxException) {
        null
    }
}
