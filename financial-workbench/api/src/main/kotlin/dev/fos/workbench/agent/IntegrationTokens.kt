package dev.fos.workbench.agent

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** 연동 토큰 원문을 만들고 해시한다. 형식은 docs/data-schema.md 「연동 토큰」 이다 */
object IntegrationTokens {
    const val PREFIX = "fwb_"
    private const val RANDOM_BYTES = 32
    private val FORMAT = Regex("^fwb_[A-Za-z0-9_-]{43}$")
    private val random = SecureRandom()

    /** `fwb_` 뒤에 무작위 32바이트를 채움 문자 없는 base64url 43자로 붙인다 */
    fun generate(): String {
        val bytes = ByteArray(RANDOM_BYTES).also { random.nextBytes(it) }
        return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun isWellFormed(raw: String): Boolean = FORMAT.matches(raw)

    /** 원문의 SHA-256 을 소문자 16진수 64자로 쓴다 */
    fun hash(raw: String): String =
        MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    fun last4(raw: String): String = raw.takeLast(4)
}
