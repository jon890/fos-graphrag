package dev.fos.workbench.agent

import java.time.Clock
import java.util.concurrent.ConcurrentHashMap

/**
 * 키마다 60초 고정 창으로 센다. 창은 그 키의 첫 요청부터 시작한다.
 * 프로세스 메모리에만 있다(docs/code-architecture.md 의 작은 결정). 창이 끝난 키는 다음 요청에서 덮어쓴다.
 */
class RateLimiter(private val limitPerMinute: Int, private val clock: Clock = Clock.systemUTC()) {

    data class Decision(val allowed: Boolean, val retryAfterSeconds: Long)

    private data class Window(val startMillis: Long, val count: Int)

    private val windows = ConcurrentHashMap<String, Window>()

    fun tryAcquire(key: String): Decision {
        val now = clock.millis()
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

    companion object {
        private const val WINDOW_MILLIS = 60_000L
    }
}
