package dev.fos.workbench.oauth

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * 인가 코드, 접근 토큰, 갱신 토큰의 원문을 만들고 해시한다. 형식은 연동 토큰과 같다(docs/data-schema.md 「OAuth 연결」).
 * 원문은 저장하지 않고 [hash] 로 찾는다.
 */
object OAuthSecrets {
    const val CODE = "fwc_"
    const val ACCESS = "fwa_"
    const val REFRESH = "fwr_"

    private const val RANDOM_BYTES = 32
    private val BODY = Regex("^[A-Za-z0-9_-]{43}$")
    private val random = SecureRandom()
    private val base64Url = Base64.getUrlEncoder().withoutPadding()

    /** 접두 뒤에 무작위 32바이트를 채움 문자 없는 base64url 43자로 붙인다 */
    fun generate(prefix: String): String {
        val bytes = ByteArray(RANDOM_BYTES).also { random.nextBytes(it) }
        return prefix + base64Url.encodeToString(bytes)
    }

    fun isWellFormed(prefix: String, raw: String): Boolean = raw.startsWith(prefix) && BODY.matches(raw.substring(prefix.length))

    /** 원문의 SHA-256 을 소문자 16진수 64자로 쓴다. 연동 토큰의 해시와 같은 방식이다 */
    fun hash(raw: String): String = sha256(raw.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    /** PKCE S256(RFC 7636): `code_verifier` 의 SHA-256 을 채움 문자 없는 base64url 로 쓴다 */
    fun s256(verifier: String): String = base64Url.encodeToString(sha256(verifier.toByteArray(Charsets.US_ASCII)))

    private fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)
}
