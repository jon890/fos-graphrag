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
 * 노드 이름을 화면용으로 바꾼다. 서버의 Claim 이름은 주체 → 대상 관계로 조합한 값이라 그대로 보인다.
 * 예전 이력처럼 이름이 선택지 키이면 표시 이름으로 바꾼다.
 */
export function nodeDisplayLabel(o: Ontology, node: { type: string; label: string }): string {
  const def = o.nodeTypes[node.type]
  const labelDef = def?.properties[def.labelProperty]
  return labelDef?.type === 'enum' ? enumValueLabel(labelDef, node.label) : node.label
}

const JOSA: Record<string, [withBatchim: string, withoutBatchim: string]> = {
  '이(가)': ['이', '가'],
  '은(는)': ['은', '는'],
  '을(를)': ['을', '를'],
  '와(과)': ['과', '와'],
}

/** 낱말 끝소리에 맞춰 조사 이(가), 은(는), 을(를), 와(과) 가운데 하나를 고른다. 한글이 아니거나 모르는 조사면 적힌 그대로 붙인다 */
export function withJosa(word: string, josa: string): string {
  const pair = JOSA[josa]
  const code = word.charCodeAt(word.length - 1)
  if (!pair || code < 0xac00 || code > 0xd7a3) return `${word}${josa}`
  return `${word}${pair[(code - 0xac00) % 28 === 0 ? 1 : 0]}`
}

/** 한글 낱말 끝소리에 맞춰 을/를을 붙인다. 한글이 아니면 「을(를)」 로 둔다 */
export function withEulReul(word: string): string {
  return withJosa(word, '을(를)')
}

/** 고를 후보가 하나도 없을 때의 안내. 예: 「먼저 기업을 만드세요」 */
export function createFirstHint(typeLabels: string[]): string {
  return `먼저 ${withEulReul(typeLabels.join(', '))} 만드세요`
}

export type SentencePart = { kind: 'slot'; slot: 'subject' | 'object' } | { kind: 'text'; text: string }

const SLOT_PATTERN = /\{(subject|object)\}/g
const LEADING_JOSA = /^(이\(가\)|은\(는\)|을\(를\)|와\(과\))/

/**
 * predicate 의 문장 틀을 칸과 글로 나눈다. 칸 바로 뒤 글의 맨 앞 조사(이(가), 은(는), 을(를), 와(과))는
 * names 에 그 칸의 이름이 있으면 끝소리에 맞춰 하나로 바꾸고, 없으면 적힌 그대로 둔다.
 * 문장 틀이 없으면 subject 칸, object 칸, 관계 표시 이름 순서다.
 */
export function claimSentenceParts(
  o: Ontology,
  predicate: string,
  names?: { subject?: string | null; object?: string | null },
): SentencePart[] {
  const sentence = o.claimPredicates[predicate]?.sentence
  if (!sentence) {
    return [
      { kind: 'slot', slot: 'subject' },
      { kind: 'text', text: ' ' },
      { kind: 'slot', slot: 'object' },
      { kind: 'text', text: ` ${predicateLabel(o, predicate)}` },
    ]
  }
  const parts: SentencePart[] = []
  let last = 0
  let prevSlot: 'subject' | 'object' | null = null
  const pushText = (raw: string) => {
    let text = raw
    const name = prevSlot ? names?.[prevSlot] : null
    const josa = LEADING_JOSA.exec(text)
    if (name && josa) text = withJosa(name, josa[1]).slice(name.length) + text.slice(josa[1].length)
    if (text) parts.push({ kind: 'text', text })
  }
  for (const m of sentence.matchAll(SLOT_PATTERN)) {
    pushText(sentence.slice(last, m.index))
    prevSlot = m[1] as 'subject' | 'object'
    parts.push({ kind: 'slot', slot: prevSlot })
    last = m.index + m[0].length
  }
  pushText(sentence.slice(last))
  return parts
}
