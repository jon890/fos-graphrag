import { describe, expect, it } from 'vitest'
import { collapseClaims, EMPTY_GRAPH, expandedDisplay, graphFromView, layoutRoots, mergeGraph, typeColor, typeShape, type GraphData } from './graph'
import { testOntology } from '../components/testSupport'
import type { GraphView } from '../api/types'

const limits = { maxHops: 2, maxNodes: 150, maxRelationships: 300 }

function view(partial: Partial<GraphView>): GraphView {
  return { centerId: 'a', hops: 1, nodes: [], edges: [], truncated: false, limits, ...partial }
}

describe('mergeGraph', () => {
  it('같은 id 의 노드와 엣지는 하나만 남긴다', () => {
    const first = graphFromView(
      view({
        nodes: [
          { id: 'a', type: 'Company', label: 'A', reviewStatus: null },
          { id: 'c', type: 'Claim', label: 'SUPPLIES_TO', reviewStatus: 'DRAFT' },
        ],
        edges: [{ id: 'e1', type: 'SUBJECT', source: 'c', target: 'a' }],
      }),
    )
    const merged = mergeGraph(
      first,
      view({
        centerId: 'c',
        nodes: [
          { id: 'c', type: 'Claim', label: 'SUPPLIES_TO', reviewStatus: 'REVIEWED' },
          { id: 'a', type: 'Company', label: 'A', reviewStatus: null },
          { id: 'b', type: 'Company', label: 'B', reviewStatus: null },
        ],
        edges: [
          { id: 'e1', type: 'SUBJECT', source: 'c', target: 'a' },
          { id: 'e2', type: 'OBJECT', source: 'c', target: 'b' },
        ],
      }),
    )
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(merged.edges.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    // 나중 응답의 검토 상태가 이긴다.
    expect(merged.nodes.find((n) => n.id === 'c')?.reviewStatus).toBe('REVIEWED')
  })

  it('truncated 는 어느 한쪽이라도 true 면 true 다', () => {
    const truncated = mergeGraph(EMPTY_GRAPH, view({ truncated: true }))
    expect(truncated.truncated).toBe(true)
    expect(mergeGraph(truncated, view({ truncated: false })).truncated).toBe(true)
    expect(mergeGraph(EMPTY_GRAPH, view({ truncated: false })).truncated).toBe(false)
  })

  it('끝점 노드가 없는 엣지는 버린다', () => {
    const merged = mergeGraph(
      EMPTY_GRAPH,
      view({
        nodes: [{ id: 'a', type: 'Company', label: 'A', reviewStatus: null }],
        edges: [{ id: 'e1', type: 'ISSUES', source: 'a', target: 'missing' }],
      }),
    )
    expect(merged.edges).toEqual([])
  })

  it('limits 는 마지막 응답 값을 쓴다', () => {
    expect(mergeGraph(EMPTY_GRAPH, view({})).limits).toEqual(limits)
  })
})

describe('collapseClaims', () => {
  const a = { id: 'a', type: 'Company', label: 'A', reviewStatus: null }
  const b = { id: 'b', type: 'Company', label: 'B', reviewStatus: null }
  const c = { id: 'c', type: 'Claim', label: 'A → B 공급한다', reviewStatus: 'DRAFT' as const, predicate: 'SUPPLIES_TO' }
  const d = { id: 'd', type: 'Document', label: 'D', reviewStatus: null }
  const subject = { id: 'e1', type: 'SUBJECT', source: 'c', target: 'a' }
  const object = { id: 'e2', type: 'OBJECT', source: 'c', target: 'b' }
  const supported = { id: 'e3', type: 'SUPPORTED_BY', source: 'c', target: 'd' }
  const base: GraphData = { nodes: [a, c, b, d], edges: [subject, object, supported], truncated: false, limits: null }
  const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id)

  it('주장을 주체에서 대상으로 가는 선으로 접고 근거 문서를 숨긴다', () => {
    const display = collapseClaims(base, 'a')
    expect(ids(display.nodes)).toEqual(['a', 'b'])
    expect(display.edges).toEqual([])
    expect(display.claimEdges).toEqual([{ claimId: 'c', source: 'a', target: 'b', predicate: 'SUPPLIES_TO', reviewStatus: 'DRAFT' }])
    expect(ids(display.listed)).toEqual(['a', 'c', 'b'])
  })

  it('대상이 그래프에 없으면 접지 않는다', () => {
    const display = collapseClaims({ ...base, nodes: [a, c, d], edges: [subject, supported] }, 'a')
    expect(ids(display.nodes)).toEqual(['a', 'c', 'd'])
    expect(display.claimEdges).toEqual([])
  })

  it('접히지 않는 다른 주장이 받치는 문서는 숨기지 않는다', () => {
    const c2 = { id: 'c2', type: 'Claim', label: 'c2', reviewStatus: null, predicate: 'SUPPLIES_TO' }
    const display = collapseClaims(
      { ...base, nodes: [...base.nodes, c2], edges: [...base.edges, { id: 'e4', type: 'SUPPORTED_BY', source: 'c2', target: 'd' }] },
      'a',
    )
    expect(ids(display.nodes)).toContain('d')
    expect(ids(display.nodes)).toContain('c2')
  })

  it('중심이 문서면 문서를 남기고 주장은 접는다', () => {
    const display = collapseClaims(base, 'd')
    expect(ids(display.nodes)).toEqual(['a', 'b', 'd'])
    expect(display.claimEdges.map((x) => x.claimId)).toEqual(['c'])
  })

  it('중심이 주장이면 접지 않는다', () => {
    const display = collapseClaims(base, 'c')
    expect(ids(display.nodes)).toContain('c')
    expect(display.claimEdges).toEqual([])
  })

  it('expandedDisplay 는 입력 그대로 돌려주고 접힌 주장이 없다', () => {
    const display = expandedDisplay(base)
    expect(display.nodes).toEqual(base.nodes)
    expect(display.listed).toEqual(base.nodes)
    expect(display.edges).toEqual(base.edges)
    expect(display.claimEdges).toEqual([])
  })
})

describe('타입 표시', () => {
  it('온톨로지에 display 가 있으면 그 색과 모양을 쓴다', () => {
    expect(typeColor(testOntology, 'Company')).toBe('#2563eb')
    expect(typeShape(testOntology, 'Company')).toBe('ellipse')
  })

  it('display 가 없으면 이름으로 고른 팔레트 색과 원 모양이다', () => {
    const color = typeColor(testOntology, 'Person')
    expect(color).toMatch(/^#[0-9a-f]{6}$/)
    expect(typeColor(testOntology, 'Person')).toBe(color)
    expect(typeShape(testOntology, 'Person')).toBe('ellipse')
    expect(typeShape(testOntology, 'Unknown')).toBe('ellipse')
  })
})

describe('layoutRoots', () => {
  const node = (id: string, type = 'Company') => ({ id, type, label: id, reviewStatus: null })
  const edge = (id: string, source: string, target: string) => ({ id, type: 'ISSUES', source, target })

  it('들어오는 선이 없는 노드가 뿌리다', () => {
    const data: GraphData = { ...EMPTY_GRAPH, nodes: [node('a'), node('b'), node('c')], edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')] }
    expect(layoutRoots(expandedDisplay(data), 'b')).toEqual(['a'])
  })

  it('고리만 있으면 중심 노드가 뿌리다', () => {
    const data: GraphData = { ...EMPTY_GRAPH, nodes: [node('a'), node('b')], edges: [edge('e1', 'a', 'b'), edge('e2', 'b', 'a')] }
    expect(layoutRoots(expandedDisplay(data), 'b')).toEqual(['b'])
  })

  it('자기 자신을 잇는 선만 있는 노드도 뿌리다', () => {
    const data: GraphData = { ...EMPTY_GRAPH, nodes: [node('a'), node('b')], edges: [edge('e1', 'a', 'a'), edge('e2', 'a', 'b')] }
    expect(layoutRoots(expandedDisplay(data), null)).toEqual(['a'])
  })

  it('접힌 주장 선이 대상 노드를 뿌리에서 뺀다', () => {
    const data: GraphData = {
      ...EMPTY_GRAPH,
      nodes: [node('a'), node('b'), node('c', 'Claim')],
      edges: [edge('s', 'c', 'a'), edge('o', 'c', 'b')].map((e, i) => ({ ...e, type: i === 0 ? 'SUBJECT' : 'OBJECT' })),
    }
    expect(layoutRoots(collapseClaims(data, null), null)).toEqual(['a'])
  })
})
