package dev.fos.workbench.trade

import com.fasterxml.jackson.annotation.JsonInclude
import dev.fos.workbench.config.Timestamps
import dev.fos.workbench.knowledge.NodeRef
import dev.fos.workbench.web.ValidationFailedException
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/** 검사를 마친 체결 하나. 문자열은 앞뒤 공백을 지웠고 market, ticker, currency 는 대문자, executedAt 은 UTC 초까지다 */
data class TradeInput(
    val broker: String,
    val externalId: String,
    val side: String,
    val market: String,
    val ticker: String,
    val name: String?,
    val quantity: Double,
    val price: Double,
    val currency: String,
    val amount: Double,
    val fee: Double?,
    val executedAt: String,
)

/** 주인 화면에 보이는 체결. `security`, `decisions` 는 보관된 것도 담는다(docs/api-contract.md 「내 체결」) */
@JsonInclude(JsonInclude.Include.ALWAYS)
data class TradeView(
    val id: String,
    val broker: String,
    val externalId: String,
    val side: String,
    val market: String,
    val ticker: String,
    val name: String?,
    val quantity: Double,
    val price: Double,
    val currency: String,
    val amount: Double,
    val fee: Double?,
    val executedAt: String,
    val createdAt: String,
    val createdVia: String,
    val security: NodeRef?,
    val decisions: List<NodeRef>,
)

/** 저장 요청의 항목 하나의 결과. `status` 는 `created`(새로 저장) 또는 `existing`(이미 있음)이다 */
data class TradeSaveResult(val index: Int, val status: String, val trade: TradeView)

/** 저장 요청의 체결 목록을 검사한다. 규칙은 docs/api-contract.md 「`POST /api/v1/trades`」 와 같다 */
object TradeInputs {
    const val MAX_EXTERNAL_ID = 100
    const val MAX_NAME = 100

    val BROKERS = setOf("TOSS", "OTHER")
    val SIDES = setOf("BUY", "SELL")

    private val FIELDS = setOf(
        "broker", "externalId", "side", "market", "ticker", "name", "quantity", "price", "currency", "amount", "fee", "executedAt",
    )
    private val CURRENCY = Regex("^[A-Za-z]{3}$")

    /** 키 목록, 형식, 범위를 검사해 정규화한다. 틀리면 trades[i].칸 키로 모은 ValidationFailedException */
    fun parse(items: List<Map<String, Any?>>?, max: Int): List<TradeInput> {
        if (items.isNullOrEmpty() || items.size > max) {
            throw ValidationFailedException(mapOf("trades" to "1개 이상 ${max}개 이하여야 합니다."))
        }
        val errors = linkedMapOf<String, String>()
        val parsed = items.mapIndexed { i, item -> Item(item) { field, message -> errors.putIfAbsent("trades[$i].$field", message) }.read() }
        if (errors.isNotEmpty()) throw ValidationFailedException(errors)
        return parsed.map { it!! }
    }

    /** 항목 하나를 읽는다. 틀린 칸이 있으면 report 로 알리고 null 이다 */
    private class Item(private val raw: Map<String, Any?>, private val report: (String, String) -> Unit) {
        private var failed = false

        fun read(): TradeInput? {
            raw.keys.filterNot { it in FIELDS }.forEach { fail(it, "알 수 없는 필드입니다.") }
            val broker = choice("broker", BROKERS)
            val externalId = text("externalId", MAX_EXTERNAL_ID, required = true)
            val side = choice("side", SIDES)
            val market = text("market", null, required = true)?.uppercase()?.also {
                if (SecurityMarkets.workbenchMarkets(it) == null) fail("market", SecurityMarkets.MESSAGE)
            }
            val ticker = text("ticker", SecurityMarkets.MAX_TICKER, required = true)?.uppercase()
            val name = text("name", MAX_NAME, required = false)
            val quantity = number("quantity", required = true, positive = true)
            val price = number("price", required = true)
            val currency = text("currency", null, required = true)?.also {
                if (!CURRENCY.matches(it)) fail("currency", "영문 세 자리여야 합니다.")
            }?.uppercase()
            val amount = number("amount", required = true)
            val fee = number("fee", required = false)
            val executedAt = executedAt()
            if (failed) return null
            return TradeInput(
                broker = broker!!, externalId = externalId!!, side = side!!, market = market!!, ticker = ticker!!, name = name,
                quantity = quantity!!, price = price!!, currency = currency!!, amount = amount!!, fee = fee, executedAt = executedAt!!,
            )
        }

        private fun fail(field: String, message: String) {
            failed = true
            report(field, message)
        }

        /** 앞뒤 공백을 지운 문자열. 필수가 아니면 비운 값은 없는 것으로 본다 */
        private fun text(field: String, maxLength: Int?, required: Boolean): String? {
            val value = raw[field]
            if (value == null) {
                if (required) fail(field, "필수입니다.")
                return null
            }
            if (value !is String) {
                fail(field, "문자열이어야 합니다.")
                return null
            }
            val trimmed = value.trim()
            if (trimmed.isEmpty()) {
                if (required) fail(field, "필수입니다.")
                return null
            }
            if (maxLength != null && trimmed.length > maxLength) {
                fail(field, "${maxLength}자 이하여야 합니다.")
                return null
            }
            return trimmed
        }

        private fun choice(field: String, values: Set<String>): String? {
            val value = text(field, null, required = true) ?: return null
            if (value !in values) {
                fail(field, "${values.joinToString()} 가운데 하나여야 합니다.")
                return null
            }
            return value
        }

        /** 숫자만 받는다. 문자열로 쓴 숫자는 거절한다. positive 면 0 보다 커야 하고, 아니면 0 이상이다 */
        private fun number(field: String, required: Boolean, positive: Boolean = false): Double? {
            val value = raw[field]
            if (value == null) {
                if (required) fail(field, "필수입니다.")
                return null
            }
            val n = (value as? Number)?.toDouble()
            if (n == null || !n.isFinite()) {
                fail(field, "수여야 합니다.")
                return null
            }
            if (if (positive) n <= 0.0 else n < 0.0) {
                fail(field, if (positive) "0 보다 커야 합니다." else "0 이상이어야 합니다.")
                return null
            }
            return n
        }

        /** 오프셋이 붙은 ISO-8601 시각만 받아 UTC 초까지로 바꾼다 */
        private fun executedAt(): String? {
            val value = text("executedAt", null, required = true) ?: return null
            return try {
                Timestamps.user(OffsetDateTime.parse(value).toInstant())
            } catch (_: DateTimeParseException) {
                fail("executedAt", "오프셋이 붙은 ISO-8601 시각이어야 합니다.")
                null
            }
        }
    }
}
