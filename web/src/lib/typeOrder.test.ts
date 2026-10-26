import { describe, expect, it } from 'vitest'
import type { NodeTypeDef, Ontology, RelationshipTypeDef } from '../api/types'
import { managedTypes, orderedTypes, rootTypes, typeDepths } from './typeOrder'

const node = (managedBy?: string): NodeTypeDef => ({ description: '', labelProperty: 'name', properties: {}, ...(managedBy ? { managedBy } : {}) })
const rel = (from: string[], to: string[]): RelationshipTypeDef => ({ description: '', from, to })

/** 타입 키는 YAML 순서대로 적는다. managed 에 든 키는 managedBy 를 가진다 */
function ontology(types: string[], relationships: Record<string, RelationshipTypeDef>, managed: string[] = []): Ontology {
  return {
    schemaVersion: 'test',
    version: 1,
    versionCreatedAt: '2026-10-20T00:00:00Z',
    versionCreatedBy: null,
    nodeTypes: Object.fromEntries(types.map((t) => [t, node(managed.includes(t) ? 'claims' : undefined)])),
    relationshipTypes: relationships,
    claimPredicates: {},
  }
}

describe('타입 순서', () => {
  it('뿌리가 둘이고 갈래가 있으면 깊이가 얕은 순서, 같은 깊이는 YAML 순서다', () => {
    // YAML 순서는 C, A, D, B, E. 뿌리는 A, B 이고 E 는 A 에서 바로 닿아 깊이 1 이다.
    const o = ontology(['C', 'A', 'D', 'B', 'E'], { R1: rel(['A'], ['C', 'E']), R2: rel(['B'], ['D']), R3: rel(['C'], ['E']) })
    expect(rootTypes(o)).toEqual(['A', 'B'])
    expect(Object.fromEntries(typeDepths(o))).toEqual({ A: 0, B: 0, C: 1, D: 1, E: 1 })
    expect(orderedTypes(o)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('깊이가 같으면 관계 정의 순서가 아니라 YAML 순서를 따른다', () => {
    const o = ontology(['Root', 'Y', 'X'], { R1: rel(['Root'], ['X']), R2: rel(['Root'], ['Y']) })
    expect(orderedTypes(o)).toEqual(['Root', 'Y', 'X'])
  })

  it('자기 자신을 잇는 관계만 들어오는 타입은 뿌리다', () => {
    const o = ontology(['Leaf', 'Concept'], { SELF: rel(['Concept'], ['Concept']), DOWN: rel(['Concept'], ['Leaf']) })
    expect(rootTypes(o)).toEqual(['Concept'])
    expect(orderedTypes(o)).toEqual(['Concept', 'Leaf'])
  })

  it('고리로만 이어져 뿌리에서 닿지 않는 타입은 맨 뒤에 YAML 순서로 둔다', () => {
    const o = ontology(['Q', 'Root', 'P', 'Child'], { LOOP1: rel(['P'], ['Q']), LOOP2: rel(['Q'], ['P']), DOWN: rel(['Root'], ['Child']) })
    expect(typeDepths(o).has('P')).toBe(false)
    expect(typeDepths(o).has('Q')).toBe(false)
    expect(orderedTypes(o)).toEqual(['Root', 'Child', 'Q', 'P'])
  })

  it('managedBy 타입은 순서와 뿌리에서 빠지고 따로 돌려준다', () => {
    const o = ontology(['Claim', 'A', 'B'], { R: rel(['A'], ['B']), ABOUT: rel(['Claim'], ['A']) }, ['Claim'])
    expect(rootTypes(o)).toEqual(['A'])
    expect(orderedTypes(o)).toEqual(['A', 'B'])
    expect(typeDepths(o).has('Claim')).toBe(false)
    expect(managedTypes(o)).toEqual(['Claim'])
  })

  it('온톨로지에 없는 타입을 잇는 관계는 셈하지 않는다', () => {
    const o = ontology(['A'], { GHOST: rel(['Ghost'], ['A']) })
    expect(rootTypes(o)).toEqual(['A'])
    expect(orderedTypes(o)).toEqual(['A'])
  })
})
