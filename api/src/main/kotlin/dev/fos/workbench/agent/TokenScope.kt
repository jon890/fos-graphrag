package dev.fos.workbench.agent

/** 연동 토큰 범위. 속성이 없는 예전 토큰은 READ 다(docs/data-schema.md 「연동 토큰」) */
enum class TokenScope {
    READ,
    READ_WRITE,
    ;

    companion object {
        /** 대소문자를 구분한다. 두 값 밖이면 null 이다 */
        fun parse(value: String?): TokenScope? = entries.firstOrNull { it.name == value }
    }
}
