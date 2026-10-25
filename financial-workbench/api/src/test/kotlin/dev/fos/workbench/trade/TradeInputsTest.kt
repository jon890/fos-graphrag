package dev.fos.workbench.trade

import dev.fos.workbench.web.ValidationFailedException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class TradeInputsTest {

    private fun item(vararg overrides: Pair<String, Any?>): Map<String, Any?> = mapOf(
        "broker" to "TOSS", "externalId" to " 20261024-000123 ", "side" to "BUY", "market" to "us", "ticker" to " flnc ",
        "name" to "Fluence Energy", "quantity" to 10, "price" to 12.3, "currency" to "usd", "amount" to 123.0, "fee" to 0.12,
        "executedAt" to "2026-10-24T23:31:05.789+09:00",
    ) + overrides

    @Suppress("UNCHECKED_CAST")
    private fun fieldErrors(items: List<Map<String, Any?>>): Map<String, String> {
        val e = assertThrows<ValidationFailedException> { TradeInputs.parse(items, 50) }
        return e.details["fieldErrors"] as Map<String, String>
    }

    @Test
    fun `정상 항목은 대문자와 UTC 초로 정규화된다`() {
        val parsed = TradeInputs.parse(listOf(item()), 50).single()

        assertThat(parsed).isEqualTo(
            TradeInput(
                broker = "TOSS", externalId = "20261024-000123", side = "BUY", market = "US", ticker = "FLNC", name = "Fluence Energy",
                quantity = 10.0, price = 12.3, currency = "USD", amount = 123.0, fee = 0.12, executedAt = "2026-10-24T14:31:05Z",
            ),
        )
    }

    @Test
    fun `모르는 필드는 그 칸의 오류다`() {
        assertThat(fieldErrors(listOf(item("accountNo" to "123-45")))).containsOnlyKeys("trades[0].accountNo")
    }

    @Test
    fun `수량이 0 이면 그 칸의 오류다`() {
        assertThat(fieldErrors(listOf(item("quantity" to 0)))).containsOnlyKeys("trades[0].quantity")
    }

    @Test
    fun `문자열로 쓴 숫자는 거절한다`() {
        assertThat(fieldErrors(listOf(item(), item("price" to "12.3")))).containsOnlyKeys("trades[1].price")
    }

    @Test
    fun `오프셋 없는 체결 시각은 거절한다`() {
        assertThat(fieldErrors(listOf(item("executedAt" to "2026-10-24T23:31:05")))).containsOnlyKeys("trades[0].executedAt")
    }

    @Test
    fun `모르는 시장 값은 거절한다`() {
        assertThat(fieldErrors(listOf(item("market" to "XX")))).containsOnlyKeys("trades[0].market")
    }

    @Test
    fun `50건까지 받고 51건은 목록 오류다`() {
        assertThat(TradeInputs.parse(List(50) { item("externalId" to "e$it") }, 50)).hasSize(50)
        assertThat(fieldErrors(List(51) { item("externalId" to "e$it") })).containsOnlyKeys("trades")
    }

    @Test
    fun `목록이 비었거나 없으면 목록 오류다`() {
        assertThat(fieldErrors(emptyList())).containsOnlyKeys("trades")
        val e = assertThrows<ValidationFailedException> { TradeInputs.parse(null, 50) }
        @Suppress("UNCHECKED_CAST")
        assertThat(e.details["fieldErrors"] as Map<String, String>).containsOnlyKeys("trades")
    }
}
