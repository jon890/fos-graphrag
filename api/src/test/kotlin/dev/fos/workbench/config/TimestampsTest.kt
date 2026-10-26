package dev.fos.workbench.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Instant

class TimestampsTest {

    @Test
    fun `자릿수가 고정되어 문자열 순서가 시간 순서와 같다`() {
        val instants = listOf("2026-10-20T03:00:00Z", "2026-10-20T03:00:00.5Z", "2026-10-20T03:00:00.000001Z", "2026-10-20T03:00:01Z")
            .map(Instant::parse)
        val formatted = instants.map(Timestamps::system)
        assertThat(formatted.map { it.length }.toSet()).hasSize(1)
        assertThat(formatted.sorted()).isEqualTo(instants.sorted().map(Timestamps::system))
        assertThat(Timestamps.system(Instant.parse("2026-10-20T03:00:00.5Z"))).isEqualTo("2026-10-20T03:00:00.500000Z")
        // Instant.toString 은 0.5초 뒤의 값을 앞의 값보다 먼저 정렬한다. 고정 자릿수가 필요한 이유다
        assertThat(instants[1].toString() < instants[0].toString()).isTrue()
        assertThat(Timestamps.user(Instant.parse("2026-10-20T03:00:00.9Z"))).isEqualTo("2026-10-20T03:00:00Z")
        assertThat(Timestamps.now()).hasSize(27)
    }
}
