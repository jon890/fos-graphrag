import type { GraphEdge, GraphLimits, GraphNode, GraphView } from '../api/types'

/** 화면이 들고 있는 합쳐진 그래프. 여러 번의 neighborhood 응답을 누적한다. */
export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
  limits: GraphLimits | null
}

export const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], truncated: false, limits: null }

export function graphFromView(view: GraphView): GraphData {
  return mergeGraph(EMPTY_GRAPH, view)
}

/**
 * 이웃 확장 결과를 기존 그래프에 합친다.
 * - 같은 id 의 노드와 엣지는 하나만 남긴다. 나중 응답의 값(라벨, 검토 상태)이 이긴다.
 * - 양 끝 노드가 없는 엣지는 버린다. Cytoscape 는 끝점 없는 엣지를 받지 않는다.
 * - truncated 는 어느 한 응답이라도 잘렸으면 true 다.
 */
export function mergeGraph(base: GraphData, incoming: Pick<GraphView, 'nodes' | 'edges' | 'truncated'> & { limits?: GraphLimits | null }): GraphData {
  const nodes = new Map<string, GraphNode>()
  for (const n of base.nodes) nodes.set(n.id, n)
  for (const n of incoming.nodes) nodes.set(n.id, n)

  const edges = new Map<string, GraphEdge>()
  for (const e of [...base.edges, ...incoming.edges]) {
    if (!nodes.has(e.source) || !nodes.has(e.target)) continue
    edges.set(e.id, e)
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    truncated: base.truncated || incoming.truncated,
    limits: incoming.limits ?? base.limits,
  }
}

export const TYPE_COLORS: Record<string, string> = {
  Company: '#2563eb',
  Security: '#0d9488',
  Sector: '#9333ea',
  Document: '#d97706',
  Claim: '#dc2626',
}

export function colorForType(type: string): string {
  return TYPE_COLORS[type] ?? '#64748b'
}
