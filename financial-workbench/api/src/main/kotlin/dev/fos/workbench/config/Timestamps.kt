package dev.fos.workbench.config

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * 저장하는 시각은 자릿수가 고정된 UTC 문자열이다. 문자열 정렬이 시간 순서와 같아야 하기 때문이다.
 * `Instant.toString()` 은 소수 자릿수가 값마다 달라(`...00Z`, `...00.5Z`) 사전순이 시간순과 어긋난다.
 */
object Timestamps {
    /** 시스템 시각(createdAt, ChangeEvent.at 등). 마이크로초까지 6자리로 고정한다. */
    private val SYSTEM = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'").withZone(ZoneOffset.UTC)

    /** 사용자가 넣는 datetime 속성(collectedAt). 초까지만 둔다. */
    private val USER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'").withZone(ZoneOffset.UTC)

    fun now(): String = system(Instant.now())

    fun system(instant: Instant): String = SYSTEM.format(instant.truncatedTo(ChronoUnit.MICROS))

    fun user(instant: Instant): String = USER.format(instant.truncatedTo(ChronoUnit.SECONDS))
}
