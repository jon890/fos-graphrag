package dev.fos.workbench.trade

import dev.fos.workbench.config.Limits
import dev.fos.workbench.web.NotFoundException
import dev.fos.workbench.web.Page
import dev.fos.workbench.web.PageQuery
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * 주인 본인의 체결 기록을 저장하고 읽고 지운다. 역할을 보지 않고 주인 id 로만 찾으므로 ADMIN 도 남의 체결을 보지 않는다.
 * 지식 데이터가 아니라 변경 이력을 남기지 않는다(docs/data-schema.md 「체결 기록」).
 */
@Service
class TradeService(private val trades: TradeRepository) {

    /**
     * 모든 항목을 먼저 검사하고, 하나라도 틀리면 아무것도 쓰지 않는다.
     * 주인 노드를 잠그고 항목 순서대로 merge 와 종목 잇기를 한다. 같은 요청 안의 같은 체결은 뒤의 것이 existing 이다.
     */
    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun save(ownerId: String, items: List<Map<String, Any?>>?, tokenId: String?): List<TradeSaveResult> {
        val inputs = TradeInputs.parse(items, Limits.MAX_TRADES_PER_REQUEST)
        // 토큰 인증이 지운 사용자를 먼저 막으므로 정상 흐름에서는 나오지 않는다
        if (!trades.lockOwner(ownerId)) throw IllegalStateException("사용자를 찾을 수 없다: $ownerId")
        val saved = inputs.map { input ->
            val (id, created) = trades.merge(ownerId, input, tokenId, CREATED_VIA_AGENT)
            // 검사를 통과한 market 이라 목록이 늘 있다
            trades.linkSecurityIfMissing(ownerId, id, SecurityMarkets.workbenchMarkets(input.market).orEmpty(), input.ticker)
            id to created
        }
        trades.unlockOwner(ownerId)
        val views = trades.views(ownerId, saved.map { it.first }).associateBy { it.id }
        return saved.mapIndexed { i, (id, created) ->
            TradeSaveResult(i, if (created) CREATED else EXISTING, views[id] ?: throw IllegalStateException("저장한 체결을 읽지 못했다: $id"))
        }
    }

    @Transactional(readOnly = true)
    fun list(ownerId: String, filter: TradeFilter, page: PageQuery): Page<TradeView> = trades.page(ownerId, filter, page)

    @Transactional(timeout = Limits.WRITE_TIMEOUT_SECONDS)
    fun delete(ownerId: String, tradeId: String) {
        if (!trades.delete(ownerId, tradeId)) throw NotFoundException(tradeId)
    }

    companion object {
        const val CREATED = "created"
        const val EXISTING = "existing"
        const val CREATED_VIA_AGENT = "AGENT"
    }
}
