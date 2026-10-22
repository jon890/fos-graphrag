import type cytoscape from 'cytoscape'
import type { GraphEdge, GraphLimits, GraphNode, GraphView, Ontology, ReviewStatus } from '../api/types'

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

/** 온톨로지에 색이 없는 타입에 쓴다. 겹치지 않게 타입 이름으로 고른다 */
const FALLBACK_COLORS = ['#0891b2', '#65a30d', '#c026d3', '#ea580c', '#4f46e5', '#be123c', '#0f766e', '#a16207']

export function typeColor(o: Ontology, type: string): string {
  const configured = o.nodeTypes[type]?.display?.color
  if (configured) return configured
  let hash = 0
  for (const ch of type) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}

/** 그래프 노드 모양. 온톨로지 display.shape 를 따르고, 없으면 원이다 */
export function typeShape(o: Ontology, type: string): cytoscape.Css.NodeShape {
  return (o.nodeTypes[type]?.display?.shape ?? 'ellipse') as cytoscape.Css.NodeShape
}

/** 접힌 주장 하나. 주체에서 대상으로 가는 선 하나로 그린다 */
export interface ClaimEdge {
  /** 주장 id */
  claimId: string
  source: string
  target: string
  predicate: string | null
  reviewStatus: ReviewStatus | null
}

/** 화면에 그릴 그래프 */
export interface GraphDisplay {
  /** 그릴 노드. 접힌 주장과 접힌 주장에만 걸린 근거 문서는 빠진다 */
  nodes: GraphNode[]
  /** 그릴 관계. 접힌 주장에 닿은 관계는 빠진다 */
  edges: GraphEdge[]
  claimEdges: ClaimEdge[]
  /** 「그래프에 나온 항목」 목록. nodes 에 접힌 주장을 더한 것이고, 순서는 data.nodes 순서다 */
  listed: GraphNode[]
}

/** 주장을 선으로 접는다. 주체와 대상이 모두 그래프에 있는 주장만 접고, 중심 노드는 접거나 숨기지 않는다 */
export function collapseClaims(data: GraphData, centerId: string | null): GraphDisplay {
  const subjects = new Map<string, string>()
  const objects = new Map<string, string>()
  for (const e of data.edges) {
    if (e.type === 'SUBJECT') subjects.set(e.source, e.target)
    else if (e.type === 'OBJECT') objects.set(e.source, e.target)
  }

  const collapsed = new Map<string, ClaimEdge>()
  for (const n of data.nodes) {
    if (n.type !== 'Claim' || n.id === centerId) continue
    const source = subjects.get(n.id)
    const target = objects.get(n.id)
    if (source === undefined || target === undefined) continue
    collapsed.set(n.id, { claimId: n.id, source, target, predicate: n.predicate ?? null, reviewStatus: n.reviewStatus ?? null })
  }

  const touching = new Map<string, GraphEdge[]>()
  for (const e of data.edges) {
    for (const id of [e.source, e.target]) {
      const list = touching.get(id)
      if (list) list.push(e)
      else touching.set(id, [e])
    }
  }
  const hidden = (n: GraphNode): boolean => {
    if (n.id === centerId) return false
    const list = touching.get(n.id)
    return !!list && list.length > 0 && list.every((e) => e.type === 'SUPPORTED_BY' && collapsed.has(e.source))
  }

  const nodes = data.nodes.filter((n) => !collapsed.has(n.id) && !hidden(n))
  return {
    nodes,
    edges: data.edges.filter((e) => !collapsed.has(e.source) && !collapsed.has(e.target)),
    claimEdges: [...collapsed.values()],
    listed: data.nodes.filter((n) => collapsed.has(n.id) || !hidden(n)),
  }
}

/** 접지 않은 보기. 「주장을 따로 보기」 를 켰을 때 쓴다 */
export function expandedDisplay(data: GraphData): GraphDisplay {
  return { nodes: data.nodes, edges: data.edges, claimEdges: [], listed: data.nodes }
}
