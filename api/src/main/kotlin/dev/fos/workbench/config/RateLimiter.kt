package dev.fos.workbench.config

import java.time.Clock
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * 키마다 60초 고정 창으로 센다. 창은 그 키의 첫 요청부터 시작한다.
 * 프로세스 메모리에만 있다(docs/code-architecture.md 의 작은 결정). 창이 끝난 키는 다음 요청에서 덮어쓴다.
 * 다시 오지 않는 키(IP 처럼 바뀌는 값)가 쌓이지 않게, 창 길이마다 한 번 창이 끝난 키를 모두 지운다.
 */
class RateLimiter(private val limitPerMinute: Int, private val clock: Clock = Clock.systemUTC()) {

    data class Decision(val allowed: Boolean, val retryAfterSeconds: Long)

    private data class Window(val startMillis: Long, val count: Int)

    private val windows = ConcurrentHashMap<String, Window>()

    private val lastSweepMillis = AtomicLong(clock.millis())

    fun tryAcquire(key: String): Decision {
        val now = clock.millis()
        sweep(now)
        var allowed = false
        val window = windows.compute(key) { _, held ->
            val current = if (held == null || now - held.startMillis >= WINDOW_MILLIS) Window(now, 0) else held
            if (current.count < limitPerMinute) {
                allowed = true
                current.copy(count = current.count + 1)
            } else {
                current
            }
        }!!
        if (allowed) return Decision(true, 0)
        val remainingMillis = window.startMillis + WINDOW_MILLIS - now
        return Decision(false, maxOf(1L, (remainingMillis + 999) / 1000))
    }

    /** 세고 있는 키 수 */
    fun trackedKeys(): Int = windows.size

    /** 지난 정리에서 창 길이가 지났으면 한 스레드만 정리한다. 값이 같을 때만 지우므로 그 사이에 새로 센 창은 남는다 */
    private fun sweep(now: Long) {
        val last = lastSweepMillis.get()
        if (now - last < WINDOW_MILLIS || !lastSweepMillis.compareAndSet(last, now)) return
        windows.values.removeIf { now - it.startMillis >= WINDOW_MILLIS }
    }

    companion object {
        private const val WINDOW_MILLIS = 60_000L
    }
}
