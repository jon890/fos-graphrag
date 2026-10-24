import type { Ontology } from '../api/types'
import { LEADING_JOSA, relationshipLabel, typeLabel, withJosa } from './labels'

// 관계를 문장 하나로 보인다. 규칙은 docs/flow.md 「관계 문장」 과 「조사 고르기」.

export type RelationSentencePart = { kind: 'slot'; slot: 'from' | 'to'; text: string } | { kind: 'text'; text: string }

const SLOT_PATTERN = /\{(from|to)\}/g
const HANGUL_START = 0xac00
const JONG_NIEUN = 4
const JONG_BIEUP = 17

/** 한다체 문장 끝을 합니다체로. 규칙은 docs/flow.md 「관계 문장」 */
export function politeEnding(sentence: string): string {
  const body = sentence.endsWith('.') ? sentence.slice(0, -1) : sentence
  if (!body.endsWith('다')) return sentence
  if (body.endsWith('이다')) return `${body.slice(0, -2)}입니다`
  if (body.endsWith('는다')) return `${body.slice(0, -2)}습니다`
  const stem = body.slice(0, -1)
  const code = stem.charCodeAt(stem.length - 1)
  if (Number.isNaN(code) || code < HANGUL_START || code > 0xd7a3) return sentence
  const jong = (code - HANGUL_START) % 28
  if (jong === 0) return `${stem}입니다`
  if (jong === JONG_NIEUN) return `${stem.slice(0, -1)}${String.fromCharCode(code - JONG_NIEUN + JONG_BIEUP)}니다`
  return `${stem}습니다`
}

/** 문장 틀(없으면 「{from}이(가) {to}을(를) {label}」)을 두 이름으로 채운다. 자리 뒤의 조사는 그 이름으로 고르고, 끝은 합니다체다 */
export function relationSentenceParts(o: Ontology, relationship: string, from: string, to: string): RelationSentencePart[] {
  const sentence = o.relationshipTypes[relationship]?.sentence || `{from}이(가) {to}을(를) ${relationshipLabel(o, relationship)}`
  const names = { from, to }
  const parts: RelationSentencePart[] = []
  let last = 0
  let prevName: string | null = null
  const pushText = (raw: string) => {
    let text = raw
    const josa = LEADING_JOSA.exec(text)
    if (prevName !== null && josa) text = withJosa(prevName, josa[1]).slice(prevName.length) + text.slice(josa[1].length)
    if (text) parts.push({ kind: 'text', text })
  }
  for (const m of sentence.matchAll(SLOT_PATTERN)) {
    pushText(sentence.slice(last, m.index))
    const slot = m[1] as 'from' | 'to'
    prevName = names[slot]
    parts.push({ kind: 'slot', slot, text: prevName })
    last = m.index + m[0].length
  }
  pushText(sentence.slice(last))

  // 합니다체는 문장 전체로 정하고 마지막 글 조각에만 반영한다. 바꿀 곳이 이름 자리에 걸치면 그대로 둔다
  const tail = parts[parts.length - 1]
  if (tail?.kind === 'text') {
    const full = parts.map((p) => p.text).join('')
    const head = full.slice(0, full.length - tail.text.length)
    const polite = politeEnding(full)
    if (polite.startsWith(head)) tail.text = polite.slice(head.length)
  }
  return parts
}

export function relationSentence(o: Ontology, relationship: string, from: string, to: string): string {
  return relationSentenceParts(o, relationship, from, to)
    .map((p) => p.text)
    .join('')
}

/** 개념 지도 타입 칸의 문장. type 이 from 이나 to 인 관계의 (from 타입, to 타입) 조합마다 하나, 이름은 타입 표시 이름 */
export function typeRelationSentences(
  o: Ontology,
  type: string,
): { key: string; relationship: string; fromType: string; toType: string; text: string }[] {
  const out: { key: string; relationship: string; fromType: string; toType: string; text: string }[] = []
  const seen = new Set<string>()
  for (const [relationship, def] of Object.entries(o.relationshipTypes)) {
    for (const fromType of def.from) {
      for (const toType of def.to) {
        const key = `${relationship}:${fromType}:${toType}`
        if ((fromType !== type && toType !== type) || seen.has(key)) continue
        seen.add(key)
        out.push({ key, relationship, fromType, toType, text: relationSentence(o, relationship, typeLabel(o, fromType), typeLabel(o, toType)) })
      }
    }
  }
  return out
}
