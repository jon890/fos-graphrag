package dev.fos.workbench.oauth

import java.net.URI
import java.net.URISyntaxException

/**
 * 등록과 인가 요청의 `redirect_uri` 규칙(docs/api-contract.md 「`POST /oauth/register`」, 「인가 요청과 동의」).
 * 받는 주소는 loopback 의 `http` 와 `https` 뿐이다. 인가 요청의 주소는 등록한 값과 글자까지 같아야 한다.
 * loopback 의 포트만 다른 주소와 접두 일치는 받지 않는다(최신 MCP 인증 규격의 정확 일치).
 */
object RedirectUris {
    const val MAX_LENGTH = 2000

    private val LOOPBACK_HOSTS = setOf("127.0.0.1", "localhost", "[::1]")

    /** fragment 가 없는 절대 주소이고, loopback 의 `http` 이거나 host 가 있는 `https` 다 */
    fun validate(uri: String): Boolean {
        if (uri.length > MAX_LENGTH || uri.contains('#')) return false
        val parsed = parse(uri) ?: return false
        if (!parsed.isAbsolute || parsed.isOpaque || parsed.rawUserInfo != null) return false
        val host = parsed.host ?: return false
        return when (parsed.scheme) {
            "https" -> host.isNotEmpty()
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
