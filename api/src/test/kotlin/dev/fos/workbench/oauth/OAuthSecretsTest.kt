package dev.fos.workbench.oauth

import dev.fos.workbench.agent.IntegrationTokens
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class OAuthSecretsTest {

    @Test
    fun `S256 은 RFC 7636 부록 B 의 값과 같다`() {
        assertThat(OAuthSecrets.s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).isEqualTo("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    }

    @Test
    fun `만든 원문은 접두 뒤 43자이고 형식 검사를 통과한다`() {
        val raw = OAuthSecrets.generate(OAuthSecrets.ACCESS)
        assertThat(raw).startsWith("fwa_").hasSize(47)
        assertThat(OAuthSecrets.isWellFormed(OAuthSecrets.ACCESS, raw)).isTrue()
        assertThat(OAuthSecrets.isWellFormed(OAuthSecrets.REFRESH, raw)).describedAs("다른 접두").isFalse()
        assertThat(OAuthSecrets.isWellFormed(OAuthSecrets.ACCESS, raw.dropLast(1))).describedAs("42자").isFalse()
    }

    @Test
    fun `해시는 연동 토큰의 해시와 같은 SHA-256 소문자 16진수다`() {
        val raw = OAuthSecrets.generate(OAuthSecrets.CODE)
        assertThat(OAuthSecrets.hash(raw)).isEqualTo(IntegrationTokens.hash(raw)).matches("^[0-9a-f]{64}$")
        // "abc" 의 SHA-256(FIPS 180-2 예시)
        assertThat(OAuthSecrets.hash("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }
}
