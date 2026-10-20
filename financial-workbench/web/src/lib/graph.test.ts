import { describe, expect, it } from 'vitest'
import { EMPTY_GRAPH, graphFromView, mergeGraph } from './graph'
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
