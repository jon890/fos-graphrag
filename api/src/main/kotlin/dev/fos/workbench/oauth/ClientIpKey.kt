package dev.fos.workbench.oauth

import java.net.Inet6Address
import java.net.InetAddress
import java.net.UnknownHostException

/**
 * OAuth 공개 경로의 요청 한도를 세는 IP 키. IPv4 는 주소 그대로, IPv6 는 앞 64비트(/64)로 센다.
 * IPv6 사용자는 보통 /64 하나를 통째로 받아, 주소 하나씩 세면 주소를 바꿔 가며 한도를 피한다.
 */
object ClientIpKey {

    private const val PREFIX_BYTES = 8

    /** [remoteAddr] 는 `HttpServletRequest.remoteAddr` 의 IP 문자열이다. IP 로 읽을 수 없으면 그대로 쓴다 */
    fun of(remoteAddr: String): String {
        // ':' 가 없으면 IPv4 다. 대괄호로 감싸면 IPv6 리터럴로만 읽고 이름 조회를 하지 않는다
        if (!remoteAddr.contains(':')) return remoteAddr
        val address = try {
            InetAddress.getByName("[" + remoteAddr.removePrefix("[").removeSuffix("]") + "]")
        } catch (e: UnknownHostException) {
            return remoteAddr
        }
        // IPv4 가 IPv6 형식으로 온 주소(::ffff:a.b.c.d)는 Inet4Address 로 읽힌다
        if (address !is Inet6Address) return address.hostAddress
        val prefix = address.address.copyOf(PREFIX_BYTES)
        return prefix.toList().chunked(2).joinToString(":", postfix = "::/64") { (hi, lo) ->
            (((hi.toInt() and 0xff) shl 8) or (lo.toInt() and 0xff)).toString(16)
        }
    }
}
