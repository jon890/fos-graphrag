import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Page, TradeView } from '../../api/types'
import { TradeListView, visibleTrades } from './TradeList'

const trade = (id: string, ticker: string): TradeView => ({
  id,
  broker: 'KIS',
  externalId: `ext-${id}`,
  side: 'BUY',
  market: 'KRX',
  ticker,
  name: null,
  quantity: 10,
  price: 70000,
  currency: 'KRW',
  amount: 700000,
  fee: null,
  executedAt: '2026-10-24T01:00:00Z',
  createdAt: '2026-10-25T01:00:00Z',
  createdVia: 'AGENT',
  security: null,
  decisions: [],
})

const page = (totalItems: number, items: TradeView[]): Page<TradeView> => ({ items, page: 0, size: 20, totalItems, totalPages: Math.ceil(totalItems / 20) })

describe('visibleTrades', () => {
  it('20건을 넘으면 모두 보기가 켜지고 ticker 는 첫 체결의 것이다', () => {
    const view = visibleTrades(page(21, [trade('a', 'FLNC'), trade('b', 'AAPL')]))
    expect(view.more).toBe(true)
    expect(view.ticker).toBe('FLNC')
  })

  it('정확히 20건이면 모두 보기가 꺼진다', () => {
    expect(visibleTrades(page(20, [trade('a', 'FLNC')])).more).toBe(false)
  })

  it('체결이 없으면 ticker 도 없다', () => {
    expect(visibleTrades(page(0, [])).ticker).toBeNull()
  })
})

describe('TradeListView', () => {
  const noop = () => {}

  it('체결이 없으면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<TradeListView view={visibleTrades(page(0, []))} title="내 체결" testId="detail-trades" onMore={noop} />)).toBe('')
  })

  it('체결 하나면 줄 하나와 절 머리를 그리고 모두 보기는 없다', () => {
    const html = renderToStaticMarkup(<TradeListView view={visibleTrades(page(1, [trade('a', 'FLNC')]))} title="실행한 체결" testId="trace-step-trades" onMore={noop} />)
    expect(html.match(/data-testid="trade-list-item"/g)).toHaveLength(1)
    expect(html).toContain('data-testid="trace-step-trades"')
    expect(html).toContain('실행한 체결')
    expect(html).toContain('매수 10주 700,000 KRW')
    expect(html).not.toContain('trade-list-more')
  })

  it('20건을 넘으면 모두 보기를 그린다', () => {
    const html = renderToStaticMarkup(<TradeListView view={visibleTrades(page(21, [trade('a', 'FLNC')]))} title="내 체결" testId="detail-trades" onMore={noop} />)
    expect(html).toContain('data-testid="trade-list-more"')
  })
})
