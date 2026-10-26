package dev.fos.workbench.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class RateLimiterTest {

    /** 테스트가 시각을 정해 옮기는 시계 */
    private class MovableClock(var now: Instant) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId?): Clock = this
        override fun instant(): Instant = now
    }

    private val start = Instant.parse("2026-10-25T00:00:00Z")
    private val clock = MovableClock(start)
    private val limiter = RateLimiter(3, clock)

    @Test
    fun `한도까지는 허용하고 넘으면 창 끝까지 남은 초를 올림해 알려 준다`() {
        repeat(3) { assertThat(limiter.tryAcquire("a").allowed).describedAs("${it + 1}번째").isTrue() }

        clock.now = start.plusMillis(20_500)
        val denied = limiter.tryAcquire("a")
        assertThat(denied.allowed).isFalse()
        // 창은 0초에 시작했고 20.5초가 지났으니 39.5초가 남는다
        assertThat(denied.retryAfterSeconds).isEqualTo(40)
    }

    @Test
    fun `창이 끝나기 직전 거부는 최소 1초를 알려 주고 60초가 지나면 다시 허용한다`() {
        repeat(3) { limiter.tryAcquire("a") }

        clock.now = start.plusMillis(59_999)
        val denied = limiter.tryAcquire("a")
        assertThat(denied.allowed).isFalse()
        assertThat(denied.retryAfterSeconds).isEqualTo(1)

        clock.now = start.plusSeconds(60)
        repeat(3) { assertThat(limiter.tryAcquire("a").allowed).describedAs("새 창의 ${it + 1}번째").isTrue() }
        assertThat(limiter.tryAcquire("a").allowed).isFalse()
    }

    @Test
    fun `키가 다르면 따로 센다`() {
        repeat(3) { limiter.tryAcquire("a") }
        assertThat(limiter.tryAcquire("a").allowed).isFalse()

        assertThat(limiter.tryAcquire("b").allowed).isTrue()
    }

    @Test
    fun `창은 그 키의 첫 요청부터 센다`() {
        clock.now = start.plusSeconds(30)
        repeat(3) { limiter.tryAcquire("a") }

        clock.now = start.plusSeconds(80)
        val denied = limiter.tryAcquire("a")
        assertThat(denied.allowed).isFalse()
        assertThat(denied.retryAfterSeconds).isEqualTo(10)

        clock.now = start.plusSeconds(90)
        assertThat(limiter.tryAcquire("a").allowed).isTrue()
    }

    @Test
    fun `창 길이가 지나면 다음 요청이 창이 끝난 키를 지우고 아직 창 안인 키는 남긴다`() {
        limiter.tryAcquire("a")
        limiter.tryAcquire("b")
        clock.now = start.plusSeconds(30)
        limiter.tryAcquire("c")
        assertThat(limiter.trackedKeys()).describedAs("창 길이가 지나기 전에는 지우지 않는다").isEqualTo(3)

        clock.now = start.plusSeconds(60)
        limiter.tryAcquire("d")

        // a, b 는 0초에 시작해 끝났고 c 는 30초에 시작해 남는다. d 는 방금 센 키다
        assertThat(limiter.trackedKeys()).isEqualTo(2)
        repeat(2) { limiter.tryAcquire("c") }
        assertThat(limiter.tryAcquire("c").allowed).describedAs("남은 c 는 창 안의 수를 그대로 센다").isFalse()
    }
}
