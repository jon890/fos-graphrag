import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CurrentUser, KnowledgeLevel, NodeRef, NodeView, TraceStatus, TraceStep, TraceView } from '../../api/types'
import { testOntology, withApp } from '../testSupport'
import { ConceptChips } from './ConceptChips'
import { KnowledgeMarkControls } from './KnowledgeMarkControls'
import { TraceBody } from './TracePage'

const nodeView = (id: string, type: string, label: string, properties: NodeView['properties'] = {}): NodeView => ({
  id,
  type,
  label,
  properties,
  revision: 1,
  archived: false,
  archivedAt: null,
  createdAt: '2026-10-20T03:15:00Z',
  createdBy: null,
  updatedAt: '2026-10-20T03:15:00Z',
  updatedBy: null,
  reviewStatus: null,
})

const mark = (nodeId: string, level: KnowledgeLevel) => ({ nodeId, level, note: null, updatedAt: '2026-10-25T03:15:00Z' })

const step = (node: NodeView, depth: number, status: TraceStatus, over: Partial<TraceStep> = {}): TraceStep => ({
  node,
  depth,
  childId: null,
  relationshipId: null,
  relationshipType: null,
  status,
  documents: [],
  claims: [],
  concepts: [],
  missing: [],
  knowledge: null,
  ...over,
})

const valuation: NodeRef = { id: 'v1', type: 'Valuation', label: '가나 2026-09', archived: false }

// 응답은 깊이 순서다. 결정 ← 종목 ← 기업 ← 병목 으로 거슬러 올라간다
const view: TraceView = {
  rootId: 'd1',
  steps: [
    step(nodeView('d1', 'Decision', '가나 매수', { reason: '원문 대조 대기' }), 0, 'MISSING', {
      missing: [{ relationshipType: 'BASED_ON', candidates: [valuation] }],
      knowledge: mark('d1', 'UNSURE'),
    }),
    step(nodeView('s1', 'Security', '가나 보통주'), 1, 'MISSING', { childId: 'd1', relationshipId: 'r1', relationshipType: 'HAS_DECISION' }),
    step(nodeView('c1', 'Company', '가나전자'), 2, 'PARTIAL', {
      childId: 's1',
      relationshipId: 'r2',
      relationshipType: 'ISSUES',
      claims: [{ id: 'cl1', label: '가나전자 → 메모리 속한다', predicate: 'BELONGS_TO_SECTOR', reviewStatus: 'DRAFT' }],
    }),
    step(nodeView('b1', 'Bottleneck', 'HBM 생산'), 3, 'SUPPORTED', {
      childId: 'c1',
      relationshipId: 'r3',
      relationshipType: 'BENEFITS',
      documents: [{ id: 'doc1', title: '증설 계획', url: 'https://example.com/a', publisher: '가나리서치', collectedAt: null, archived: false }],
      knowledge: mark('b1', 'LEARNING'),
    }),
  ],
  dependents: [],
  truncated: false,
  dependentsTruncated: false,
  limits: { maxDepth: 6, maxSteps: 60, maxDependents: 50, maxCandidates: 5 },
}

const viewer: CurrentUser = { id: 'u2', email: 'v@example.com', displayName: 'V', role: 'VIEWER', guideDoneAt: null }

const renderTrace = (user?: CurrentUser) =>
  renderToStaticMarkup(
    withApp(<TraceBody view={view} onOpenNode={() => {}} onTrace={() => {}} onReload={() => {}} onMarkChange={() => {}} />, testOntology, user, '/trace?node=d1'),
  )

/** 단계 카드마다 그 카드의 HTML 을 나눈다 */
function cards(html: string): { id: string; depth: number; role: string; html: string }[] {
  const starts = [...html.matchAll(/<li[^>]*data-testid="trace-step"[^>]*>/g)]
  return starts.map((m, i) => {
    const tag = m[0]
    const end = i + 1 < starts.length ? starts[i + 1].index : html.indexOf('data-testid="trace-dependents"')
    return {
      id: /data-node-id="([^"]+)"/.exec(tag)![1],
      depth: Number(/data-depth="(\d+)"/.exec(tag)![1]),
      role: /data-role="([^"]+)"/.exec(tag)![1],
      html: html.slice(m.index, end),
    }
  })
}

const text = (html: string) => html.replace(/<[^>]+>/g, '')

describe('근거 따라가기 화면', () => {
  it('깊은 단계가 위, 지금 항목이 맨 아래이고 출발점과 지금 항목을 표시한다', () => {
    const list = cards(renderTrace())
    expect(list.map((c) => c.depth)).toEqual([3, 2, 1, 0])
    expect(list.map((c) => c.id)).toEqual(['b1', 'c1', 's1', 'd1'])
    expect(list.map((c) => c.role)).toEqual(['origin', 'middle', 'middle', 'root'])
  })

  it('요약 줄은 단계 수, 상태별 개수, 잘 모르겠어요 단계 수를 data 로 갖는다', () => {
    const html = renderTrace()
    expect(html).toMatch(/data-testid="trace-summary" data-steps="4" data-supported="1" data-partial="1" data-missing="2" data-unsure="1"/)
    expect(html).toContain('가나 매수: 이 판단은 어디서 왔나')
  })

  it('단계 문장은 아래 단계와의 관계 문장이고 이 단계 이름이 굵다', () => {
    const byId = Object.fromEntries(cards(renderTrace()).map((c) => [c.id, c.html]))
    const sentence = (html: string) => text(/<p[^>]*data-testid="trace-step-sentence"[^>]*>(.*?)<\/p>/.exec(html)![1])
    expect(sentence(byId.c1)).toBe('가나전자가 가나 보통주를 발행합니다')
    expect(byId.c1).toMatch(/data-testid="trace-step-sentence"[^>]*><strong>가나전자<\/strong>/)
    expect(sentence(byId.s1)).toBe('가나 매수는 가나 보통주에 대한 결정입니다')
    expect(byId.d1).not.toContain('data-testid="trace-step-sentence"')
  })

  it('결정 카드는 이유를 그대로 보이고, 잇지 않은 관계와 편집자의 후보 잇기를 보인다', () => {
    const decision = cards(renderTrace()).find((c) => c.id === 'd1')!.html
    expect(decision).toMatch(/data-testid="trace-step-description"[^>]*>원문 대조 대기</)
    expect(decision).toMatch(/data-testid="trace-missing" data-relationship="BASED_ON"/)
    expect(text(decision)).toContain('아직 이어지지 않은 결정의 근거')
    expect(decision).toMatch(/<button[^>]*data-testid="trace-candidate-link"[^>]*data-candidate-id="v1"[^>]*>가나 2026-09 잇기<\/button>/)
    expect(decision).toMatch(/<button[^>]*data-testid="trace-step-attach"/)
  })

  it('근거 문서는 새 창으로 여는 링크이고 주장은 검토 상태를 갖는다', () => {
    const byId = Object.fromEntries(cards(renderTrace()).map((c) => [c.id, c.html]))
    expect(byId.b1).toMatch(/<a href="https:\/\/example.com\/a" target="_blank" rel="noreferrer" data-testid="trace-step-document"/)
    expect(byId.b1).not.toContain('data-testid="trace-step-no-evidence"')
    expect(byId.c1).toMatch(/data-testid="trace-step-claim" data-review-status="DRAFT"/)
  })

  it('열람자에게는 후보 잇기와 근거 문서 붙이기가 없고 잇지 않은 관계 문장과 이해 표시는 남는다', () => {
    const html = renderTrace(viewer)
    expect(html).not.toContain('data-testid="trace-candidate-link"')
    expect(html).not.toContain('data-testid="trace-step-attach"')
    expect(html).not.toContain('data-testid="trace-missing-open"')
    expect(html).toContain('data-testid="trace-missing"')
    expect(html).toContain('data-testid="trace-step-no-evidence"')
    expect([...html.matchAll(/data-testid="knowledge-controls"/g)]).toHaveLength(4)
  })

  it('기대는 항목이 없으면 안내 문장을 보인다', () => {
    expect(renderTrace()).toContain('지금은 이 항목을 근거로 삼은 항목이 없습니다.')
  })
})

describe('이해 표시 토글', () => {
  const render = (level: KnowledgeLevel | null) =>
    renderToStaticMarkup(<KnowledgeMarkControls nodeId="n1" mark={level ? mark('n1', level) : null} />)

  it('잘 모르겠어요 이면 그 토글만 눌려 있다', () => {
    const html = render('UNSURE')
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="knowledge-unsure"/)
    expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="knowledge-known"/)
    expect(html).toContain('data-level="UNSURE"')
    expect(html).not.toContain('data-testid="knowledge-learning-badge"')
  })

  it('공부 중이면 두 토글 모두 눌리지 않고 공부 중 글자를 붙인다', () => {
    const html = render('LEARNING')
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).toMatch(/data-testid="knowledge-learning-badge"[^>]*>공부 중</)
  })

  it('표시가 없으면 data-level 이 none 이다', () => {
    expect(render(null)).toContain('data-level="none"')
  })

  it('메모가 있으면 내 메모 줄을 보인다', () => {
    const html = renderToStaticMarkup(<KnowledgeMarkControls nodeId="n1" mark={{ ...mark('n1', 'UNSURE'), note: '왜 막히는지' }} />)
    expect(html).toMatch(/data-testid="knowledge-note"[^>]*>내 메모: 왜 막히는지</)
  })
})

describe('개념 칩', () => {
  it('빈 목록이면 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<ConceptChips concepts={[]} onOpen={() => {}} />)).toBe('')
  })

  it('칩 글자는 개념 · 이름이고 칩마다 개념 id 를 갖는다', () => {
    const html = renderToStaticMarkup(
      <ConceptChips concepts={[{ id: 'k1', label: '안전마진', summary: null, relationshipType: 'USES_CONCEPT' }]} onOpen={() => {}} />,
    )
    expect(html).toMatch(/data-testid="concept-chip" data-concept-id="k1"[^>]*>개념 · 안전마진</)
  })
})
