import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CurrentUser, ProposalView } from '../../api/types'
import { testOntology, withApp } from '../testSupport'
import { ProposalCard } from './ProposalsTab'

const base: ProposalView = {
  id: 'p1',
  kind: 'CREATE_NODE',
  status: 'PENDING',
  payload: { type: 'Decision', properties: { title: '추가 매입', reason: '체결이 있다' }, links: [{ type: 'HAS_DECISION', fromId: 's1' }], tradeIds: [] },
  rationale: '10월 24일 체결이 있고 같은 날의 결정이 없다.',
  evidence: {},
  createdAt: '2026-10-25T03:15:00Z',
  createdVia: 'AGENT',
  token: { id: 'k1', name: 'Hermes' },
  decidedAt: null,
  decisionNote: null,
  result: null,
  lastError: null,
  requiresEditor: true,
  refs: { nodes: { s1: { id: 's1', type: 'Security', label: '삼성전자', archived: false } }, trades: {} },
}

const viewer: CurrentUser = { id: 'u2', email: 'v@example.com', displayName: 'V', role: 'VIEWER', guideDoneAt: null }

const render = (p: ProposalView, user?: CurrentUser) =>
  renderToStaticMarkup(withApp(<ProposalCard proposal={p} onOpenNode={() => {}} onAccept={async () => {}} onReject={async () => {}} />, testOntology, user))

describe('ProposalCard', () => {
  it('대기 중인 항목 만들기 카드에 내용과 세 단추가 있다', () => {
    const html = render(base)
    expect(html).toContain('data-testid="proposal-summary"')
    expect(html).toContain('투자 결정 「추가 매입」을 만듭니다')
    expect(html).toContain('data-testid="proposal-prop"')
    expect(html).toContain('data-testid="proposal-link"')
    expect(html).toContain('data-testid="proposal-accept"')
    expect(html).toContain('data-testid="proposal-edit-open"')
    expect(html).toContain('data-testid="proposal-reject-open"')
    expect(html).not.toContain('proposal-editor-required')
  })

  it('열람자에게는 승인 단추가 꺼져 있고 안내가 있다', () => {
    const html = render(base, viewer)
    expect(html).toContain('data-testid="proposal-editor-required"')
    expect(html).toMatch(/data-testid="proposal-accept"[^>]*disabled|disabled=""[^>]*data-testid="proposal-accept"/)
  })

  it('마지막 승인 실패가 있으면 그 문장을 보인다', () => {
    const html = render({ ...base, lastError: { code: 'DUPLICATE', message: '같은 종목이 이미 있습니다', at: '2026-10-25T04:00:00Z' } })
    expect(html).toContain('data-testid="proposal-last-error"')
    expect(html).toContain('승인하지 못했습니다: 같은 종목이 이미 있습니다')
  })

  it('결정한 카드에는 승인 단추가 없고 결정 내용이 있다', () => {
    const html = render({ ...base, status: 'REJECTED', decidedAt: '2026-10-25T05:00:00Z', decisionNote: '이미 있는 결정입니다' })
    expect(html).toContain('data-testid="proposal-decided"')
    expect(html).toContain('이미 있는 결정입니다')
    expect(html).not.toContain('data-testid="proposal-accept"')
  })
})
