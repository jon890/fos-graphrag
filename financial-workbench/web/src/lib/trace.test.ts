import { describe, expect, it } from 'vitest'
import type { KnowledgeLevel, NodeView, TraceStatus, TraceStep, TraceView } from '../api/types'
import { stepCards, stepRole, traceSummary, withStepKnowledge } from './trace'

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
