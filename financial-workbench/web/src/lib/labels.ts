import { REVIEW_STATUSES, type Ontology, type PropertyDef } from '../api/types'

// 화면에 보이는 이름은 온톨로지(ontology/financial-ontology.yaml)가 소유한다.
// 타입, 속성, 선택지, 관계가 늘어도 이 파일을 고치지 않는다. 이름이 없으면 키를 그대로 보인다.

/** 온톨로지에 정의된 노드 타입 키. YAML 에 적은 순서다 */
export function typeKeys(o: Ontology): string[] {
  return Object.keys(o.nodeTypes)
}

export function typeLabel(o: Ontology, type: string): string {
  return o.nodeTypes[type]?.label || type
}

export function propertyDef(o: Ontology, type: string, prop: string): PropertyDef | undefined {
  return o.nodeTypes[type]?.properties[prop]
}

export function propertyLabel(o: Ontology, type: string, prop: string): string {
  return propertyDef(o, type, prop)?.label || prop
}

/** enum 속성의 값을 표시 이름으로 바꾼다. 이름이 없으면 저장된 값 그대로다 */
export function enumValueLabel(def: PropertyDef | undefined, value: string): string {
  return def?.valueLabels?.[value] || value
}

export function valueLabel(o: Ontology, type: string, prop: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  return enumValueLabel(propertyDef(o, type, prop), String(value))
}

/** 일반 관계(ISSUES)와 Claim 관계(SUBJECT, OBJECT, SUPPORTED_BY) 모두 찾는다 */
export function relationshipLabel(o: Ontology, key: string): string {
  return o.relationshipTypes[key]?.label || o.claimRelationships?.[key]?.label || key
}

export function predicateLabel(o: Ontology, key: string): string {
  return o.claimPredicates[key]?.label || key
}

export function reviewStatusKeys(o: Ontology): string[] {
  const keys = Object.keys(o.reviewStatuses ?? {})
  return keys.length > 0 ? keys : REVIEW_STATUSES
}

export function reviewStatusLabel(o: Ontology, status: string): string {
  return o.reviewStatuses?.[status]?.label || status
}

export function actionLabel(o: Ontology, action: string): string {
  return o.changeActions?.[action]?.label || action
}

/**
 * 노드 이름을 화면용으로 바꾼다. 서버의 label 은 labelProperty 값이라, 그 속성이 enum 이면
 * (Claim 의 predicate) 저장된 키가 그대로 온다. 그때는 선택지 표시 이름으로 바꾼다.
 */
export function nodeDisplayLabel(o: Ontology, node: { type: string; label: string }): string {
  const def = o.nodeTypes[node.type]
  const labelDef = def?.properties[def.labelProperty]
  return labelDef?.type === 'enum' ? enumValueLabel(labelDef, node.label) : node.label
}

/** 한글 낱말 끝소리에 맞춰 을/를을 붙인다. 한글이 아니면 「을(를)」 로 둔다 */
export function withEulReul(word: string): string {
  const code = word.charCodeAt(word.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return `${word}을(를)`
  return `${word}${(code - 0xac00) % 28 === 0 ? '를' : '을'}`
}
