import type {
  ClaimPredicateDef,
  NodeDisplayDef,
  NodeTypeDef,
  Ontology,
  OntologyDefinition,
  PropertyDef,
  RelationshipTypeDef,
} from '../api/types'

/** 서버가 받는 노드 모양. 서버의 `NodeDisplayDef.SHAPES` 와 같게 둔다. 서버가 다시 검사한다 */
export const NODE_SHAPES = ['ellipse', 'round-rectangle', 'hexagon', 'round-diamond', 'round-tag', 'round-pentagon']

/**
 * 서버 코드가 이름으로 읽는 타입과 속성. 서버의 `CodeReadKeys` 와 같게 둔다. 서버가 다시 검사한다.
 * 이 타입은 빼지 못하고, 이 속성은 빼거나 필수 여부를 바꾸지 못한다.
 */
export const CODE_READ_KEYS: Record<string, string[]> = {
  Document: ['title', 'url', 'publisher', 'documentType', 'publishedAt', 'collectedAt'],
  Security: ['market', 'ticker'],
}

/** API 가 직접 쓰는 노드 속성 이름. 서버의 `OntologyLoader.RESERVED_PROPERTIES` 와 같게 둔다 */
const SYSTEM_PROPERTIES = [
  'id',
  'type',
  'revision',
  'archived',
  'archivedAt',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'searchText',
  'reviewStatus',
  'reviewedBy',
  'reviewedAt',
  'reviewNote',
  'contentUpdatedBy',
]

const KEY_RULES = {
  nodeType: { pattern: /^[A-Z][A-Za-z0-9]*$/, message: '노드 타입 키는 영문 대문자로 시작하고 영문자와 숫자만 씁니다' },
  property: { pattern: /^[a-z][A-Za-z0-9]*$/, message: '속성 키는 영문 소문자로 시작하고 영문자와 숫자만 씁니다' },
  relationshipType: { pattern: /^[A-Z][A-Z0-9_]*$/, message: '관계 종류 키는 영문 대문자로 시작하고 영문 대문자, 숫자, 밑줄만 씁니다' },
  claimPredicate: { pattern: /^[A-Z][A-Z0-9_]*$/, message: '주장 종류 키는 영문 대문자로 시작하고 영문 대문자, 숫자, 밑줄만 씁니다' },
}

export type KeyKind = keyof typeof KEY_RULES

/** 새 키가 쓸 수 없으면 이유를, 쓸 수 있으면 null 을 돌려준다. 서버가 다시 검사한다 */
export function keyError(kind: KeyKind, key: string, existing: string[] = []): string | null {
  if (existing.includes(key)) return '이미 있는 키입니다'
  if (kind === 'property' && (SYSTEM_PROPERTIES.includes(key) || key.startsWith('_'))) return '시스템이 쓰는 속성 이름이라 쓸 수 없습니다'
  return KEY_RULES[kind].pattern.test(key) ? null : KEY_RULES[kind].message
}

export function sentenceError(sentence: string): string | null {
  const count = (token: string) => sentence.split(token).length - 1
  return count('{subject}') === 1 && count('{object}') === 1 ? null : '문장 틀에 {subject} 와 {object} 를 한 번씩 넣습니다'
}

/** 서버는 알 수 없는 키를 거절하므로 버전 정보를 뺀다 */
export function toDefinition(ontology: Ontology): OntologyDefinition {
  const { version: _version, versionCreatedAt: _createdAt, versionCreatedBy: _createdBy, ...definition } = ontology
  return definition
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

function withNodeType(def: OntologyDefinition, type: string, change: (node: NodeTypeDef) => NodeTypeDef): OntologyDefinition {
  const node = def.nodeTypes[type]
  return node ? { ...def, nodeTypes: { ...def.nodeTypes, [type]: change(node) } } : def
}

export interface NewNodeType {
  label: string
  description: string
  labelProperty: string
  labelPropertyLabel: string
  color: string
  shape: string
}

/** 새 노드 타입. 라벨 속성 하나(필수 string)를 함께 만든다 */
export function addNodeType(def: OntologyDefinition, key: string, input: NewNodeType): OntologyDefinition {
  const node: NodeTypeDef = {
    label: input.label,
    description: input.description,
    labelProperty: input.labelProperty,
    display: { color: input.color, shape: input.shape },
    properties: { [input.labelProperty]: { type: 'string', label: input.labelPropertyLabel, required: true, maxLength: 200 } },
  }
  return { ...def, nodeTypes: { ...def.nodeTypes, [key]: node } }
}

export interface NodeTypePatch {
  label?: string
  description?: string
  display?: NodeDisplayDef | null
}

export function updateNodeType(def: OntologyDefinition, key: string, patch: NodeTypePatch): OntologyDefinition {
  return withNodeType(def, key, (node) => ({ ...node, ...patch }))
}

export function addProperty(def: OntologyDefinition, type: string, key: string, prop: PropertyDef): OntologyDefinition {
  return withNodeType(def, type, (node) => ({ ...node, properties: { ...node.properties, [key]: compact(prop) } }))
}

export type PropertyPatch = Partial<Pick<PropertyDef, 'label' | 'description' | 'required' | 'maxLength' | 'min' | 'max' | 'values' | 'valueLabels'>>

function onlyKeys<V>(map: Record<string, V> | undefined, keys: string[]): Record<string, V> | undefined {
  if (!map) return undefined
  const kept = Object.fromEntries(Object.entries(map).filter(([k]) => keys.includes(k)))
  return Object.keys(kept).length > 0 ? kept : undefined
}

/** patch 에서 값이 undefined 인 키는 지운다. values 에서 빠진 값의 valueLabels 와 valueAliases 도 지운다 */
export function updateProperty(def: OntologyDefinition, type: string, key: string, patch: PropertyPatch): OntologyDefinition {
  return withNodeType(def, type, (node) => {
    const current = node.properties[key]
    if (!current) return node
    let next: PropertyDef = compact({ ...current, ...patch })
    if ('values' in patch) {
      const values = next.values ?? []
      next = compact({ ...next, valueLabels: onlyKeys(next.valueLabels, values), valueAliases: onlyKeys(next.valueAliases, values) })
    } else if ('valueLabels' in patch) {
      next = compact({ ...next, valueLabels: onlyKeys(next.valueLabels, Object.keys(next.valueLabels ?? {})) })
    }
    return { ...node, properties: { ...node.properties, [key]: next } }
  })
}

export interface NewRelationshipType {
  label: string
  description: string
  from: string[]
  to: string[]
}

export function addRelationshipType(def: OntologyDefinition, key: string, input: NewRelationshipType): OntologyDefinition {
  return { ...def, relationshipTypes: { ...def.relationshipTypes, [key]: input } }
}

export type RelationshipTypePatch = Partial<Pick<RelationshipTypeDef, 'label' | 'description' | 'from' | 'to'>>

export function updateRelationshipType(def: OntologyDefinition, key: string, patch: RelationshipTypePatch): OntologyDefinition {
  const current = def.relationshipTypes[key]
  return current ? { ...def, relationshipTypes: { ...def.relationshipTypes, [key]: { ...current, ...patch } } } : def
}

export interface NewClaimPredicate {
  label: string
  sentence: string
  description: string
  subjectTypes: string[]
  objectTypes: string[]
}

export function addClaimPredicate(def: OntologyDefinition, key: string, input: NewClaimPredicate): OntologyDefinition {
  return { ...def, claimPredicates: { ...def.claimPredicates, [key]: input } }
}

export type ClaimPredicatePatch = Partial<Pick<ClaimPredicateDef, 'label' | 'sentence' | 'description' | 'subjectTypes' | 'objectTypes'>>

export function updateClaimPredicate(def: OntologyDefinition, key: string, patch: ClaimPredicatePatch): OntologyDefinition {
  const current = def.claimPredicates[key]
  return current ? { ...def, claimPredicates: { ...def.claimPredicates, [key]: { ...current, ...patch } } } : def
}

/** 「뺄 예정」 경로를 켜고 끈다. 경로는 nodeTypes.X, nodeTypes.X.properties.p, relationshipTypes.X, claimPredicates.X 다 */
export function toggleRemoved(removed: string[], path: string): string[] {
  return removed.includes(path) ? removed.filter((p) => p !== path) : [...removed, path]
}

function without<K extends string, V extends object>(map: Record<K, V>, key: string): Record<K, V> {
  return Object.fromEntries(Object.entries(map).filter(([k]) => k !== key)) as Record<K, V>
}

/**
 * 「뺄 예정」 경로를 정의에서 실제로 뺀다. 빠진 타입을 가리키는 관계 종류의 시작과 끝, 주장 종류의 타입 목록에서도 그 타입을 뺀다.
 * 빠진 속성은 그 타입의 hintProperties 와 searchProperties 에서도 뺀다. 폼은 두 목록을 고치지 못해 남기면 미리보기가 실패한다.
 */
export function applyRemoved(def: OntologyDefinition, removed: string[]): OntologyDefinition {
  let next = def
  const removedTypes = new Set<string>()
  for (const path of removed) {
    const [section, key, field, prop] = path.split('.')
    if (section === 'nodeTypes' && field === undefined) {
      removedTypes.add(key)
      next = { ...next, nodeTypes: without(next.nodeTypes, key) }
    } else if (section === 'nodeTypes' && field === 'properties') {
      next = withNodeType(next, key, (node) => ({
        ...node,
        properties: without(node.properties, prop),
        ...(node.hintProperties && { hintProperties: node.hintProperties.filter((p) => p !== prop) }),
        ...(node.searchProperties && { searchProperties: node.searchProperties.filter((p) => p !== prop) }),
      }))
    } else if (section === 'relationshipTypes') {
      next = { ...next, relationshipTypes: without(next.relationshipTypes, key) }
    } else if (section === 'claimPredicates') {
      next = { ...next, claimPredicates: without(next.claimPredicates, key) }
    }
  }
  if (removedTypes.size === 0) return next
  const keep = (types: string[]) => types.filter((t) => !removedTypes.has(t))
  return {
    ...next,
    relationshipTypes: Object.fromEntries(
      Object.entries(next.relationshipTypes).map(([k, r]) => [k, { ...r, from: keep(r.from), to: keep(r.to) }]),
    ),
    claimPredicates: Object.fromEntries(
      Object.entries(next.claimPredicates).map(([k, c]) => [k, { ...c, subjectTypes: keep(c.subjectTypes), objectTypes: keep(c.objectTypes) }]),
    ),
  }
}
