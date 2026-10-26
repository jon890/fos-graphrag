import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TradeView } from '../../api/types'
import { formatMoney } from '../../lib/trades'
import { withApp } from '../testSupport'
import { TradeRow, TradesTab } from './TradesTab'

const base: TradeView = {
  id: 't1',
  broker: 'KIS',
  externalId: 'ext-1',
  side: 'BUY',
  market: 'NASDAQ',
  ticker: 'FLNC',
  name: 'Fluence Energy',
  quantity: 12.5,
  price: 20.1,
  currency: 'USD',
  amount: 251.25,
  fee: 0.5,
  executedAt: '2026-10-24T01:00:00Z',
  createdAt: '2026-10-25T01:00:00Z',
  createdVia: 'AGENT',
  security: null,
  decisions: [{ id: 'd1', type: 'Decision', label: '추가 매입', archived: false }],
}

const render = (t: TradeView, variant: 'row' | 'card') =>
  renderToStaticMarkup(
    withApp(
      variant === 'row' ? (
        <table>
          <tbody>
            <TradeRow trade={t} variant="row" onOpenNode={() => {}} onDelete={() => {}} />
          </tbody>
        </table>
      ) : (
        <ul>
          <TradeRow trade={t} variant="card" onOpenNode={() => {}} onDelete={() => {}} />
        </ul>
      ),
    ),
  )

describe('TradesTab', () => {
  it('첫 렌더에 화면과 안내, 종목 코드 칸이 있다', () => {
    const html = renderToStaticMarkup(withApp(<TradesTab onOpenNode={() => {}} />, undefined, undefined, '/trades'))
    expect(html).toContain('data-testid="trades-tab"')
    expect(html).toContain('data-testid="trades-guide"')
    expect(html).toContain('data-testid="trades-ticker"')
    expect(html).toContain('다른 사용자에게는 보이지 않습니다')
  })
})

describe('TradeRow', () => {
  it('행에 구분, 금액, 이은 결정 이름 링크가 있다', () => {
    const html = render(base, 'row')
    expect(html).toContain('data-testid="trade-row"')
    expect(html).toContain('data-side="BUY"')
    expect(html).toContain(formatMoney(251.25, 'USD'))
    expect(html).toContain('추가 매입')
    expect(html).toContain('data-testid="trade-delete"')
  })

  it('종목이 이어지지 않았으면 증권사가 준 이름과 종목 코드를 보인다', () => {
    const html = render(base, 'row')
    expect(html).toContain('Fluence Energy FLNC')
  })

  it('이은 종목이 있으면 그 이름이 링크로 보인다', () => {
    const html = render({ ...base, security: { id: 's1', type: 'Security', label: '플루언스', archived: false } }, 'row')
    expect(html).toContain('data-node-id="s1"')
    expect(html).toContain('플루언스')
  })

  it('카드도 같은 내용을 그린다', () => {
    const html = render({ ...base, side: 'SELL' }, 'card')
    expect(html).toContain('data-side="SELL"')
    expect(html).toContain(formatMoney(251.25, 'USD'))
    expect(html).toContain('추가 매입')
  })
})
