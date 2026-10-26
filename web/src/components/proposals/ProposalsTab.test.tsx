import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CurrentUser, OntologyPreview, ProposalView } from '../../api/types'
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
  requiredRole: 'EDITOR',
  refs: { nodes: { s1: { id: 's1', type: 'Security', label: '삼성전자', archived: false } }, relationships: {}, trades: {} },
}

const viewer: CurrentUser = { id: 'u2', email: 'v@example.com', displayName: 'V', role: 'VIEWER', guideDoneAt: null }

const admin: CurrentUser = { ...viewer, id: 'u3', displayName: 'Ad', role: 'ADMIN' }

const render = (p: ProposalView, user?: CurrentUser, error: string | null = null, initialPreview?: OntologyPreview) =>
  renderToStaticMarkup(
    withApp(<ProposalCard proposal={p} error={error} initialPreview={initialPreview} onOpenNode={() => {}} onAccept={async () => {}} onReject={async () => {}} />, testOntology, user),
  )

const ontologyChange: ProposalView = {
  ...base,
  id: 'p2',
  kind: 'ONTOLOGY_CHANGE',
  payload: { baseVersion: testOntology.version, yaml: 'version: 1\nnodeTypes: {}', note: '이름을 바꿉니다' },
  requiredRole: 'ADMIN',
}

const preview = (impacts: OntologyPreview['impacts']): OntologyPreview => ({
  valid: true,
  errors: [],
  added: ['nodeTypes.Memo'],
  removed: [],
  changed: [],
  impacts,
  codeOwnedIgnored: [],
  yaml: null,
  definition: null,
})

const acceptDisabled = /data-testid="proposal-accept"[^>]*disabled|disabled=""[^>]*data-testid="proposal-accept"/

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

  it('실패 이유와 서버가 남긴 마지막 실패를 함께 보인다', () => {
    const html = render({ ...base, lastError: { code: 'DUPLICATE', message: '중복', at: '2026-10-25T04:00:00Z' } }, undefined, '승인하지 못했습니다')
    expect(html).toContain('data-testid="proposal-card-error"')
    expect(html).toContain('data-testid="proposal-last-error"')
  })

  it('실패 이유가 없으면 카드 오류가 없다', () => {
    expect(render(base)).not.toContain('proposal-card-error')
  })

  it('편집자가 본 온톨로지 변경 카드에는 관리자 안내가 있고 승인이 꺼져 있다', () => {
    const html = render(ontologyChange)
    expect(html).toContain('data-testid="proposal-admin-required"')
    expect(html).not.toContain('proposal-editor-required')
    expect(html).toMatch(acceptDisabled)
    expect(html).toContain('data-testid="proposal-ontology-yaml"')
    expect(html).not.toContain('proposal-ontology-preview"')
  })

  it('관리자가 본 카드는 바뀐 점을 보이고 영향이 있으면 확인란을 켜야 승인할 수 있다', () => {
    const html = render(ontologyChange, admin, null, preview([{ path: 'nodeTypes.Memo.properties.x', kind: 'REMOVED_PROPERTY', count: 2 }]))
    expect(html).toContain('data-testid="proposal-ontology-preview"')
    expect(html).toContain('data-testid="ontology-impact"')
    expect(html).toContain('data-testid="proposal-ontology-confirm"')
    expect(html).toMatch(acceptDisabled)
    expect(html).not.toContain('proposal-admin-required')
  })

  it('영향이 없으면 확인란이 없고 승인할 수 있다', () => {
    const html = render(ontologyChange, admin, null, preview([]))
    expect(html).not.toContain('proposal-ontology-confirm')
    expect(html).not.toMatch(acceptDisabled)
  })

  it('기준 버전이 다르면 안내를 보이고 승인이 꺼져 있다', () => {
    const stale = { ...ontologyChange, payload: { ...ontologyChange.payload, baseVersion: testOntology.version - 1 } }
    const html = render(stale, admin, null, preview([]))
    expect(html).toContain('data-testid="proposal-ontology-stale"')
    expect(html).toMatch(acceptDisabled)
  })

  it('새 종류에는 고쳐서 승인이 없다', () => {
    const update = { ...base, kind: 'UPDATE_NODE' as const, payload: { nodeId: 's1', expectedRevision: 1, properties: { name: '새 이름' } } }
    expect(render(update)).not.toContain('proposal-edit-open')
    expect(render(ontologyChange, admin, null, preview([]))).not.toContain('proposal-edit-open')
    expect(render(base)).toContain('proposal-edit-open')
  })
})
