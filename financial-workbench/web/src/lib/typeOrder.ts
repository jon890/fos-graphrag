import type { Ontology } from '../api/types'

// 타입 순서. 온톨로지에 순서 필드를 두지 않고 관계 방향으로 계산한다. 규칙은 docs/flow.md 「타입 순서」.
// 깊이는 뿌리에서 너비 우선으로 잰 가장 가까운 거리라 개념 지도의 breadthfirst 층과 같다.

/** managedBy 가 있는 타입(지금은 Claim). YAML 순서 */
export function managedTypes(o: Ontology): string[] {
  return Object.keys(o.nodeTypes).filter((t) => !!o.nodeTypes[t].managedBy)
}

/** 순서를 매기는 타입. managedBy 타입을 뺀 YAML 순서 */
function orderable(o: Ontology): string[] {
  return Object.keys(o.nodeTypes).filter((t) => !o.nodeTypes[t].managedBy)
}

/** from 타입마다 이어지는 to 타입. 자기 자신을 잇는 간선과 순서 대상이 아닌 타입은 뺀다 */
function edges(o: Ontology, types: Set<string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const def of Object.values(o.relationshipTypes)) {
    for (const from of def.from) {
      for (const to of def.to) {
        if (from === to || !types.has(from) || !types.has(to)) continue
        if (!out.has(from)) out.set(from, new Set())
        out.get(from)!.add(to)
      }
    }
  }
  return out
}

/** 들어오는 관계가 없는 타입(자기 자신을 잇는 관계는 셈하지 않는다). managedBy 타입 제외. YAML 순서 */
export function rootTypes(o: Ontology): string[] {
  const types = orderable(o)
  const incoming = new Set<string>()
  for (const tos of edges(o, new Set(types)).values()) for (const to of tos) incoming.add(to)
  return types.filter((t) => !incoming.has(t))
}

/** 관계 방향 그래프의 깊이. managedBy 타입은 빠진다. 뿌리에서 닿지 않는 타입은 들어 있지 않다 */
export function typeDepths(o: Ontology): Map<string, number> {
  const next = edges(o, new Set(orderable(o)))
  const depths = new Map<string, number>()
  const queue = rootTypes(o)
  for (const r of queue) depths.set(r, 0)
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]
    for (const to of next.get(t) ?? []) {
      if (depths.has(to)) continue
      depths.set(to, depths.get(t)! + 1)
      queue.push(to)
    }
  }
  return depths
}

/** 깊이가 얕은 순, 같으면 YAML 순서. 닿지 않는 타입은 맨 뒤에 YAML 순서. managedBy 타입 제외 */
export function orderedTypes(o: Ontology): string[] {
  const types = orderable(o)
  const depths = typeDepths(o)
  const index = new Map(types.map((t, i) => [t, i]))
  const reached = types.filter((t) => depths.has(t)).sort((a, b) => depths.get(a)! - depths.get(b)! || index.get(a)! - index.get(b)!)
  return [...reached, ...types.filter((t) => !depths.has(t))]
}
