import { describe, expect, it } from 'vitest'
import type { Ontology } from '../api/types'
import { politeEnding, relationSentence, relationSentenceParts, typeRelationSentences } from './relationSentence'

const node = (label: string) => ({ label, description: '', labelProperty: 'name', properties: { name: { type: 'string' as const, required: true } } })

// 들어오는 관계(CREATES), 나가는 관계(BENEFITS), 자기 자신을 잇는 관계(BLOCKS), 상관없는 관계(ISSUES)를 둔 온톨로지 조각이다
const ontology: Ontology = {
  schemaVersion: 'test',
  version: 1,
  versionCreatedAt: '2026-10-25T00:00:00Z',
  versionCreatedBy: null,
  nodeTypes: { Change: node('세상의 변화'), Bottleneck: node('병목'), Company: node('기업'), Security: node('종목'), Decision: node('결정') },
  relationshipTypes: {
    CREATES: { label: '만든다', description: '', from: ['Change'], to: ['Bottleneck'], sentence: '{from}이(가) {to}을(를) 만든다' },
    BENEFITS: { label: '이익', description: '', from: ['Bottleneck'], to: ['Company'], sentence: '{from}이(가) {to}에 이익을 준다' },
    BLOCKS: { label: '막는다', description: '', from: ['Bottleneck'], to: ['Bottleneck'], sentence: '{from}이(가) {to}을(를) 막는다' },
    HAS_DECISION: { label: '결정', description: '', from: ['Security'], to: ['Decision'], sentence: '{to}은(는) {from}에 대한 결정이다' },
    ISSUES: { label: '발행한다', description: '', from: ['Company'], to: ['Security'] },
  },
  claimPredicates: {},
}

describe('politeEnding', () => {
  it('한다체 끝을 합니다체로 바꾼다', () => {
    expect(politeEnding('발행한다')).toBe('발행합니다')
    expect(politeEnding('겪는다')).toBe('겪습니다')
    expect(politeEnding('썼다')).toBe('썼습니다')
    expect(politeEnding('결정이다')).toBe('결정입니다')
    expect(politeEnding('시나리오다')).toBe('시나리오입니다')
    expect(politeEnding('관련된다')).toBe('관련됩니다')
  })

  it('끝의 마침표는 떼고 바꾼다', () => {
    expect(politeEnding('병목을 만든다.')).toBe('병목을 만듭니다')
  })

  it('다 로 끝나지 않으면 그대로다', () => {
    expect(politeEnding('속한 산업')).toBe('속한 산업')
    expect(politeEnding('')).toBe('')
  })
})

describe('relationSentenceParts', () => {
  it('문장 틀의 자리 순서대로 이름을 넣고 자리 뒤 조사를 그 이름으로 고른다', () => {
    expect(relationSentenceParts(ontology, 'HAS_DECISION', '가나전자', '매수 결정')).toEqual([
      { kind: 'slot', slot: 'to', text: '매수 결정' },
      { kind: 'text', text: '은 ' },
      { kind: 'slot', slot: 'from', text: '가나전자' },
      { kind: 'text', text: '에 대한 결정입니다' },
    ])
  })

  it('문장 틀이 없으면 「{from}이(가) {to}을(를) 표시 이름」 이다', () => {
    expect(relationSentenceParts(ontology, 'ISSUES', '가나전자', '가나전자 보통주')).toEqual([
      { kind: 'slot', slot: 'from', text: '가나전자' },
      { kind: 'text', text: '가 ' },
      { kind: 'slot', slot: 'to', text: '가나전자 보통주' },
      { kind: 'text', text: '를 발행합니다' },
    ])
  })

  it('영문 이름도 읽는 소리로 조사를 고른다', () => {
    expect(relationSentence(ontology, 'ISSUES', 'POET', 'FLNC')).toBe('POET가 FLNC를 발행합니다')
    expect(relationSentence(ontology, 'CREATES', 'AI 수요', 'HBM')).toBe('AI 수요가 HBM을 만듭니다')
    expect(relationSentence(ontology, 'BENEFITS', 'DRAM', 'SK하이닉스 (KR)')).toBe('DRAM이 SK하이닉스 (KR)에 이익을 줍니다')
  })
})

describe('typeRelationSentences', () => {
  it('들어오는 관계와 나가는 관계를 타입 표시 이름으로 보이고 자기 자신을 잇는 관계는 한 번이다', () => {
    expect(typeRelationSentences(ontology, 'Bottleneck')).toEqual([
      { key: 'CREATES:Change:Bottleneck', relationship: 'CREATES', fromType: 'Change', toType: 'Bottleneck', text: '세상의 변화가 병목을 만듭니다' },
      { key: 'BENEFITS:Bottleneck:Company', relationship: 'BENEFITS', fromType: 'Bottleneck', toType: 'Company', text: '병목이 기업에 이익을 줍니다' },
      { key: 'BLOCKS:Bottleneck:Bottleneck', relationship: 'BLOCKS', fromType: 'Bottleneck', toType: 'Bottleneck', text: '병목이 병목을 막습니다' },
    ])
  })

  it('관계가 없는 타입은 빈 목록이다', () => {
    expect(typeRelationSentences(ontology, 'Unknown')).toEqual([])
  })
})
