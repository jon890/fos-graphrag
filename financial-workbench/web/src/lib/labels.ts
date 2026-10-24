import { REVIEW_STATUSES, type NodeView, type Ontology, type PropertyDef } from '../api/types'
import { formatDate } from './format'

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
  '으로(로)': ['으로', '로'],
}

/** 이름 끝에서 건너뛰는 글자. 공백, 괄호, 따옴표, 마침표, 쉼표다 */
const TRAILING_SKIP = /[\s()[\]{}「」『』'"‘’“”.,]+$/

/**
 * 이름의 끝소리. 끝의 공백, 괄호, 따옴표, 마침표, 쉼표를 건너뛴 마지막 글자로 정한다.
 * 영문자와 숫자는 읽는 소리로 본다(L, R, 1, 7, 8 은 ㄹ 받침, M, N, 0, 3, 6 은 다른 받침). 규칙은 docs/flow.md 「조사 고르기」.
 * 받침이 없으면 none, ㄹ 받침이면 rieul, 다른 받침이면 other, 그 밖의 글자로 끝나거나 비면 null 이다.
 */
export function finalSound(word: string): 'none' | 'rieul' | 'other' | null {
  const trimmed = word.replace(TRAILING_SKIP, '')
  if (!trimmed) return null
  const last = trimmed[trimmed.length - 1]
  const code = last.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other'
  }
  const upper = last.toUpperCase()
  if (upper >= 'A' && upper <= 'Z') return 'LR'.includes(upper) ? 'rieul' : 'MN'.includes(upper) ? 'other' : 'none'
  if (last >= '0' && last <= '9') return '178'.includes(last) ? 'rieul' : '036'.includes(last) ? 'other' : 'none'
  return null
}

/**
 * 낱말 끝소리에 맞춰 조사 이(가), 은(는), 을(를), 와(과), 으로(로) 가운데 하나를 고른다.
 * 으로(로) 는 받침이 없거나 ㄹ 받침이면 「로」 다. 끝소리를 정할 수 없거나 모르는 조사면 적힌 그대로 붙인다
 */
export function withJosa(word: string, josa: string): string {
  const pair = JOSA[josa]
  const sound = finalSound(word)
  if (!pair || sound === null) return `${word}${josa}`
  const withoutBatchim = sound === 'none' || (josa === '으로(로)' && sound === 'rieul')
  return `${word}${pair[withoutBatchim ? 1 : 0]}`
}

/** 낱말 끝소리에 맞춰 을/를을 붙인다. 끝소리를 정할 수 없으면 「을(를)」 로 둔다 */
export function withEulReul(word: string): string {
  return withJosa(word, '을(를)')
}

/** 고를 후보가 하나도 없을 때의 안내. 예: 「먼저 기업을 만드세요」 */
export function createFirstHint(typeLabels: string[]): string {
  return `먼저 ${withEulReul(typeLabels.join(', '))} 만드세요`
}

export type SentencePart = { kind: 'slot'; slot: 'subject' | 'object' } | { kind: 'text'; text: string }

const SLOT_PATTERN = /\{(subject|object)\}/g
/** 자리 바로 뒤 글의 맨 앞 조사 표기. 관계 문장(relationSentence.ts)도 함께 쓴다 */
export const LEADING_JOSA = /^(으로\(로\)|이\(가\)|은\(는\)|을\(를\)|와\(과\))/

/**
 * predicate 의 문장 틀을 칸과 글로 나눈다. 칸 바로 뒤 글의 맨 앞 조사(이(가), 은(는), 을(를), 와(과), 으로(로))는
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

/** hintProperties 의 표시 값과 만든 날을 「 · 」 로 잇는다. 값이 빈 속성은 뺀다. 예: 「대한민국 (KR) · 2026. 10. 21.」 */
export function nodeHint(o: Ontology, node: Pick<NodeView, 'type' | 'properties' | 'createdAt'>): string {
  const parts: string[] = []
  for (const prop of o.nodeTypes[node.type]?.hintProperties ?? []) {
    const raw = node.properties[prop]
    const text = propertyDef(o, node.type, prop)?.type === 'enum' ? valueLabel(o, node.type, prop, raw) : raw == null ? '' : String(raw)
    if (text !== '') parts.push(text)
  }
  parts.push(formatDate(node.createdAt))
  return parts.join(' · ')
}

/** 앞뒤 공백을 지우고 소문자로 바꿔 같으면 같은 이름이다. 서버 검색(CONTAINS)과 같은 규칙이라 가운데 공백은 그대로 비교한다 */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
