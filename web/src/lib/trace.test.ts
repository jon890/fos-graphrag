import { describe, expect, it } from 'vitest'
import type { KnowledgeLevel, KnowledgeSummary, NodeRef, NodeView, StudyItem, TraceStatus, TraceStep, TraceView } from '../api/types'
import { competenceText, stepCards, stepRole, studyContextText, studyTodos, traceSummary, withStepKnowledge } from './trace'

const nodeView = (id: string): NodeView => ({
  id,
  type: 'Company',
  label: id,
  properties: {},
  revision: 1,
  archived: false,
  archivedAt: null,
  createdAt: '2026-10-20T03:15:00Z',
  createdBy: null,
  updatedAt: '2026-10-20T03:15:00Z',
  updatedBy: null,
  reviewStatus: null,
})

const step = (id: string, depth: number, status: TraceStatus, level: KnowledgeLevel | null = null): TraceStep => ({
  node: nodeView(id),
  depth,
  childId: depth === 0 ? null : 'child',
  relationshipId: depth === 0 ? null : `r-${id}`,
  relationshipType: depth === 0 ? null : 'ISSUES',
  status,
  documents: [],
  claims: [],
  concepts: [],
  missing: [],
  knowledge: level ? { nodeId: id, level, note: null, updatedAt: '2026-10-25T03:15:00Z' } : null,
})

const view = (steps: TraceStep[]): TraceView => ({
  rootId: steps[0].node.id,
  steps,
  dependents: [],
  truncated: false,
  dependentsTruncated: false,
  limits: { maxDepth: 6, maxSteps: 60, maxDependents: 50, maxCandidates: 5 },
})

// 응답은 깊이 순서(얕은 것부터)이고, 깊이 1 에 두 단계가 만든 순서로 있다
const mixed = view([
  step('root', 0, 'MISSING', 'UNSURE'),
  step('d1-first', 1, 'PARTIAL', 'KNOWN'),
  step('d1-second', 1, 'SUPPORTED', 'UNSURE'),
  step('d2', 2, 'SUPPORTED', 'LEARNING'),
])

describe('stepCards', () => {
  it('깊은 단계가 위, 지금 항목이 맨 아래이고 같은 깊이는 응답 순서를 지킨다', () => {
    expect(stepCards(mixed).map((s) => s.node.id)).toEqual(['d2', 'd1-first', 'd1-second', 'root'])
  })

  it('응답 배열을 바꾸지 않는다', () => {
    stepCards(mixed)
    expect(mixed.steps.map((s) => s.node.id)).toEqual(['root', 'd1-first', 'd1-second', 'd2'])
  })
})

describe('traceSummary', () => {
  it('단계 수, 상태별 개수, 잘 모르겠어요 단계 수를 센다', () => {
    expect(traceSummary(mixed)).toEqual({ steps: 4, supported: 2, partial: 1, missing: 1, unsure: 2 })
  })

  it('지금 항목 하나뿐인 응답도 센다', () => {
    expect(traceSummary(view([step('root', 0, 'MISSING')]))).toEqual({ steps: 1, supported: 0, partial: 0, missing: 1, unsure: 0 })
  })
})

describe('stepRole', () => {
  it('지금 항목은 root, 가장 깊은 단계는 origin, 나머지는 middle 이다', () => {
    const roles = Object.fromEntries(mixed.steps.map((s) => [s.node.id, stepRole(mixed, s)]))
    expect(roles).toEqual({ root: 'root', 'd1-first': 'middle', 'd1-second': 'middle', d2: 'origin' })
  })

  it('단계가 지금 항목 하나뿐이면 root 다', () => {
    const only = view([step('root', 0, 'SUPPORTED')])
    expect(stepRole(only, only.steps[0])).toBe('root')
  })
})

describe('withStepKnowledge', () => {
  it('그 단계의 표시만 바꾸고 요약 줄이 새 값으로 센다', () => {
    const next = withStepKnowledge(mixed, 'root', { nodeId: 'root', level: 'KNOWN', note: null, updatedAt: '2026-10-25T04:00:00Z' })
    expect(next.steps.find((s) => s.node.id === 'root')?.knowledge?.level).toBe('KNOWN')
    expect(next.steps.find((s) => s.node.id === 'd1-second')?.knowledge?.level).toBe('UNSURE')
    expect(traceSummary(next).unsure).toBe(1)
  })
})

const ref = (id: string, type: string, label: string): NodeRef => ({ id, type, label, archived: false })

const study = (over: Partial<StudyItem> = {}): StudyItem => ({
  node: ref('v1', 'Valuation', '밸류에이션'),
  level: 'UNSURE',
  note: null,
  updatedAt: '2026-10-25T03:15:00Z',
  contexts: [],
  documents: [],
  concepts: [],
  ...over,
})

describe('studyContextText', () => {
  it('결정 둘이면 「{결정 이름}의 {N}단계 위」 를 쉼표로 잇는다', () => {
    const item = study({
      contexts: [
        { decision: ref('d1', 'Decision', '전력 매수'), depth: 2 },
        { decision: ref('d2', 'Decision', '변압기 보유'), depth: 4 },
      ],
    })
    expect(studyContextText(item)).toBe('전력 매수의 2단계 위, 변압기 보유의 4단계 위')
  })

  it('항목이 결정 자신이면 「투자 결정」 이다', () => {
    const item = study({ node: ref('d1', 'Decision', '전력 매수'), contexts: [{ decision: ref('d1', 'Decision', '전력 매수'), depth: 0 }] })
    expect(studyContextText(item)).toBe('투자 결정')
  })

  it('이어진 결정이 없으면 그렇다고 알린다', () => {
    expect(studyContextText(study())).toBe('이어진 투자 결정이 없습니다')
  })
})

describe('studyTodos', () => {
  it('문서마다 읽기, 개념마다 설명 읽기를 문서 다음에 둔다', () => {
    const doc = (id: string, title: string) => ({ id, title, url: `https://example.com/${id}`, collectedAt: null, archived: false })
    const item = study({
      documents: [doc('doc1', '전력망 보고서'), doc('doc2', '변압기 공급')],
      concepts: [{ id: 'c1', label: '병목', summary: null, relationshipType: 'USES_CONCEPT' }],
    })
    expect(studyTodos(item)).toEqual([
      { kind: 'document', label: '「전력망 보고서」 읽기', url: 'https://example.com/doc1', id: 'doc1' },
      { kind: 'document', label: '「변압기 공급」 읽기', url: 'https://example.com/doc2', id: 'doc2' },
      { kind: 'concept', label: '개념 「병목」 설명 읽기', id: 'c1' },
    ])
  })

  it('문서가 없으면 근거를 붙이라는 할 일 하나다', () => {
    expect(studyTodos(study())).toEqual([{ kind: 'attach', label: '근거 문서가 없습니다. 공부한 자료를 근거로 붙여 주세요' }])
  })
})

describe('competenceText', () => {
  const summary = (total: number, understood: number, decisionsTruncated = false): KnowledgeSummary => ({
    counts: { KNOWN: 0, UNSURE: 0, LEARNING: 0 },
    decisions: { total, understood },
    decisionsTruncated,
  })

  it('결정 수와 다 이해한 결정 수를 보인다', () => {
    expect(competenceText(summary(4, 1))).toBe('투자 결정 4개 가운데 1개는 근거를 다 이해함')
  })

  it('결정이 0 개면 아직 없다고 알린다', () => {
    expect(competenceText(summary(0, 0))).toBe('아직 투자 결정이 없습니다.')
  })

  it('잘린 요약이면 앞 200개만 셌다고 붙인다', () => {
    expect(competenceText(summary(200, 3, true))).toBe('투자 결정 200개 가운데 3개는 근거를 다 이해함 (앞 200개만 셌습니다)')
  })
})
