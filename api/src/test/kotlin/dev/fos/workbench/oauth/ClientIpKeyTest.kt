package dev.fos.workbench.oauth

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ClientIpKeyTest {

    @Test
    fun `IPv4 는 주소 그대로 센다`() {
        assertThat(ClientIpKey.of("203.0.113.7")).isEqualTo("203.0.113.7")
        assertThat(ClientIpKey.of("203.0.113.8")).isNotEqualTo(ClientIpKey.of("203.0.113.7"))
    }

    @Test
    fun `IPv6 는 같은 64비트 접두면 같은 키다`() {
        val key = ClientIpKey.of("2001:db8:1:2:aaaa:bbbb:cccc:dddd")
        assertThat(key).isEqualTo("2001:db8:1:2::/64")
        assertThat(ClientIpKey.of("2001:0db8:0001:0002:0:0:0:1")).isEqualTo(key)
        assertThat(ClientIpKey.of("2001:db8:1:3::1")).isNotEqualTo(key)
    }

    @Test
    fun `IPv6 형식의 IPv4 는 IPv4 로 세고 IP 가 아닌 값은 그대로 쓴다`() {
        assertThat(ClientIpKey.of("::ffff:203.0.113.7")).isEqualTo("203.0.113.7")
        assertThat(ClientIpKey.of("0:0:0:0:0:0:0:1")).isEqualTo("0:0:0:0::/64")
        assertThat(ClientIpKey.of("not:an:ip:zz")).isEqualTo("not:an:ip:zz")
    }
}
