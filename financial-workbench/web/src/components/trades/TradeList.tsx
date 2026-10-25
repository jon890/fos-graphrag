import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, errorMessage } from '../../api/client'
import type { Page, TradeView } from '../../api/types'
import { formatDate } from '../../lib/format'
import { formatMoney, formatQuantity, sideLabel } from '../../lib/trades'
import { TAB_PATHS, tradesSearch } from '../../routes'
import { Button } from '@/components/ui/button'

const LIST_SIZE = 20

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; value: Page<TradeView> }

/** 받은 쪽에서 보일 줄과 「모두 보기」 여부, 「모두 보기」 가 넣을 ticker(첫 체결의 ticker) */
export function visibleTrades(page: Page<TradeView>): { items: TradeView[]; more: boolean; ticker: string | null } {
  const items = page.items.slice(0, LIST_SIZE)
  return { items, more: page.totalItems > LIST_SIZE, ticker: items[0]?.ticker ?? null }
}

/** 읽기와 무관하게 줄을 그린다. items 가 비면 null */
export function TradeListView({
  view,
  title,
  testId,
  onMore,
}: {
  view: ReturnType<typeof visibleTrades>
  title: string
  testId: string
  onMore: (ticker: string) => void
}) {
  if (view.items.length === 0) return null
  return (
    <section className="detail-section" data-testid={testId}>
      <h3>{title}</h3>
      <ul className="m-0 grid gap-1 pl-0 text-sm">
        {view.items.map((t) => (
          <li key={t.id} className="break-words" data-testid="trade-list-item" data-id={t.id}>
            {formatDate(t.executedAt)} {sideLabel(t.side)} {formatQuantity(t.quantity)}주 {formatMoney(t.amount, t.currency)}
          </li>
        ))}
      </ul>
      {view.more && view.ticker && (
        <Button type="button" variant="link" size="sm" className="px-0" data-testid="trade-list-more" onClick={() => onMore(view.ticker as string)}>
          내 체결에서 모두 보기
        </Button>
      )}
    </section>
  )
}

interface Props {
  filter: { securityId?: string; decisionId?: string }
  testId: 'detail-trades' | 'trace-step-trades'
}

/** 종목이나 투자 결정에 이어진 내 체결 앞 20건. 체결이 없으면 아무것도 그리지 않는다 */
export function TradeList({ filter, testId }: Props) {
  const navigate = useNavigate()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const { securityId, decisionId } = filter
  const title = testId === 'detail-trades' ? '내 체결' : '실행한 체결'

  useEffect(() => {
    let cancelled = false
    setLoad({ kind: 'loading' })
    api.trades
      .list({ securityId, decisionId, size: LIST_SIZE })
      .then((value) => !cancelled && setLoad({ kind: 'done', value }))
      .catch((e) => !cancelled && setLoad({ kind: 'error', message: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [securityId, decisionId])

  if (load.kind === 'loading') return null
  if (load.kind === 'error') {
    return (
      <p className="m-0 text-xs text-red-700" data-testid={testId}>
        {title}를 읽지 못했습니다: {load.message}
      </p>
    )
  }
  return <TradeListView view={visibleTrades(load.value)} title={title} testId={testId} onMore={(ticker) => navigate(TAB_PATHS.trades + tradesSearch({ ticker, page: 0 }))} />
}
