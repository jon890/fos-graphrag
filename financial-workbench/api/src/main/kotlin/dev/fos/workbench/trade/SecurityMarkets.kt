package dev.fos.workbench.trade

/** 토스증권 커넥터의 시장 값과 워크벤치 시장 값을 모두 받아 찾을 워크벤치 시장으로 바꾼다. 종목 찾기와 체결 저장이 같이 쓴다 */
object SecurityMarkets {
    const val MAX_TICKER = 32
    const val MESSAGE =
        "KR, US, KOSPI, KOSDAQ, NASDAQ, NYSE, AMEX, KR_ETC, US_ETC, KRX_KOSPI, KRX_KOSDAQ, OTHER 가운데 하나여야 합니다."

    private val MARKETS = mapOf(
        "KR" to listOf("KRX_KOSPI", "KRX_KOSDAQ", "OTHER"),
        "US" to listOf("NASDAQ", "NYSE", "OTHER"),
        "KOSPI" to listOf("KRX_KOSPI"),
        "KRX_KOSPI" to listOf("KRX_KOSPI"),
        "KOSDAQ" to listOf("KRX_KOSDAQ"),
        "KRX_KOSDAQ" to listOf("KRX_KOSDAQ"),
        "NASDAQ" to listOf("NASDAQ"),
        "NYSE" to listOf("NYSE"),
        "AMEX" to listOf("OTHER"),
        "KR_ETC" to listOf("OTHER"),
        "US_ETC" to listOf("OTHER"),
        "OTHER" to listOf("OTHER"),
    )

    /** 대문자로 바꾼 시장 값의 워크벤치 시장 목록. 모르는 값이면 null */
    fun workbenchMarkets(market: String): List<String>? = MARKETS[market]
}
