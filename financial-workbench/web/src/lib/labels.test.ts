import { describe, expect, it } from 'vitest'
import type { Ontology } from '../api/types'
import { creatableTypes } from '../context'
import { testOntology } from '../components/testSupport'
import {
  actionLabel,
  claimSentenceParts,
  createFirstHint,
  finalSound,
  nodeDisplayLabel,
  nodeHint,
  predicateLabel,
  propertyLabel,
  relationshipLabel,
  reviewStatusKeys,
  reviewStatusLabel,
  sameName,
  typeKeys,
  typeLabel,
  valueLabel,
  withEulReul,
  withJosa,
} from './labels'

// 화면 코드에 없는 가짜 타입(Person)과 가짜 predicate(MENTORED)를 YAML 에만 더한 온톨로지다.
// 이 파일의 어떤 함수도 Person 을 알지 못해야 한다.
const ontology: Ontology = {
  schemaVersion: '9.9.9',
  version: 1,
  versionCreatedAt: '2026-10-20T03:15:00Z',
  versionCreatedBy: null,
  nodeTypes: {
    Company: {
      label: '기업',
      description: '기업',
      labelProperty: 'name',
      properties: { name: { type: 'string', label: '기업 이름', required: true } },
    },
    Person: {
      label: '인물',
      description: '투자자나 경영자',
      labelProperty: 'name',
      properties: {
        name: { type: 'string', label: '이름', required: true },
        style: {
          type: 'enum',
          label: '투자 스타일',
          required: false,
          values: ['VALUE', 'GROWTH', 'OTHER'],
          valueLabels: { VALUE: '가치 투자', GROWTH: '성장 투자' },
        },
      },
    },
    Principle: { description: '원칙', labelProperty: 'title', properties: { title: { type: 'string', required: true } } },
    Claim: {
      label: '주장',
      description: '주장',
      labelProperty: 'predicate',
      managedBy: 'claims',
      properties: {
        predicate: {
          type: 'enum',
          label: '관계 종류',
          required: true,
          values: ['MENTORED'],
          valueLabels: { MENTORED: '가르쳤다' },
        },
      },
    },
  },
  relationshipTypes: { WROTE: { label: '썼다', description: '', from: ['Person'], to: ['Principle'] }, KNOWS: { description: '', from: ['Person'], to: ['Person'] } },
  claimRelationships: { SUBJECT: { label: '주체', description: '', from: ['Claim'] } },
  claimPredicates: {
    MENTORED: { label: '가르쳤다', description: '', subjectTypes: ['Person'], objectTypes: ['Person'], sentence: '{subject}이(가) {object}에 가르쳤다' },
  },
  reviewStatuses: { DRAFT: { label: '초안' }, SEEN: { label: '확인함' } },
  changeActions: { CREATE: { label: '만들기' } },
}

describe('표시 이름', () => {
  it('YAML 에 더한 새 타입과 속성과 선택지를 코드 수정 없이 읽는다', () => {
    expect(typeKeys(ontology)).toEqual(['Company', 'Person', 'Principle', 'Claim'])
    expect(typeLabel(ontology, 'Person')).toBe('인물')
    expect(propertyLabel(ontology, 'Person', 'style')).toBe('투자 스타일')
    expect(valueLabel(ontology, 'Person', 'style', 'VALUE')).toBe('가치 투자')
    expect(relationshipLabel(ontology, 'WROTE')).toBe('썼다')
    expect(relationshipLabel(ontology, 'SUBJECT')).toBe('주체')
    expect(predicateLabel(ontology, 'MENTORED')).toBe('가르쳤다')
    expect(reviewStatusKeys(ontology)).toEqual(['DRAFT', 'SEEN'])
    expect(reviewStatusLabel(ontology, 'SEEN')).toBe('확인함')
    expect(actionLabel(ontology, 'CREATE')).toBe('만들기')
  })

  it('표시 이름이 없으면 키를 그대로 보인다', () => {
    expect(typeLabel(ontology, 'Principle')).toBe('Principle')
    expect(propertyLabel(ontology, 'Principle', 'title')).toBe('title')
    expect(valueLabel(ontology, 'Person', 'style', 'OTHER')).toBe('OTHER')
    expect(relationshipLabel(ontology, 'KNOWS')).toBe('KNOWS')
    expect(typeLabel(ontology, 'Unknown')).toBe('Unknown')
    expect(reviewStatusLabel(ontology, 'REJECTED')).toBe('REJECTED')
    expect(actionLabel(ontology, 'ARCHIVE')).toBe('ARCHIVE')
  })

  it('표시 이름이 하나도 없는 예전 온톨로지도 읽는다', () => {
    const bare: Ontology = { schemaVersion: '1.0.0', version: 1, versionCreatedAt: '2026-10-20T03:15:00Z', versionCreatedBy: null, nodeTypes: {}, relationshipTypes: {}, claimPredicates: {} }
    expect(reviewStatusKeys(bare)).toEqual(['DRAFT', 'REVIEWED', 'REJECTED'])
    expect(typeLabel(bare, 'Company')).toBe('Company')
    expect(relationshipLabel(bare, 'SUBJECT')).toBe('SUBJECT')
  })

  it('만들 수 있는 타입 목록도 온톨로지에서 온다', () => {
    expect(creatableTypes(ontology)).toEqual(['Company', 'Person', 'Principle'])
  })

  it('노드 이름이 enum 키이면(Claim) 선택지 표시 이름으로 바꾼다', () => {
    expect(nodeDisplayLabel(ontology, { type: 'Claim', label: 'MENTORED' })).toBe('가르쳤다')
    expect(nodeDisplayLabel(ontology, { type: 'Claim', label: '가 → 나 가르쳤다' })).toBe('가 → 나 가르쳤다')
    expect(nodeDisplayLabel(ontology, { type: 'Company', label: '가상전자' })).toBe('가상전자')
    expect(nodeDisplayLabel(ontology, { type: 'Unknown', label: 'x' })).toBe('x')
  })
})

describe('withEulReul', () => {
  it('받침에 따라 을/를을 붙인다', () => {
    expect(withEulReul('기업')).toBe('기업을')
    expect(withEulReul('근거 문서')).toBe('근거 문서를')
    expect(withEulReul('인물')).toBe('인물을')
    expect(withEulReul('ETF')).toBe('ETF를')
  })
})

describe('withJosa', () => {
  it('한글 끝소리에 맞춰 조사를 고른다', () => {
    expect(withJosa('가나전자', '이(가)')).toBe('가나전자가')
    expect(withJosa('다라부품', '이(가)')).toBe('다라부품이')
    expect(withJosa('삼성', '와(과)')).toBe('삼성과')
    expect(withJosa('가나전자', '와(과)')).toBe('가나전자와')
    expect(withJosa('병목', '이(가)')).toBe('병목이')
    expect(withJosa('기업', '이(가)')).toBe('기업이')
  })

  it('으로(로) 는 받침이 없거나 ㄹ 받침이면 로다', () => {
    expect(withJosa('서울', '으로(로)')).toBe('서울로')
    expect(withJosa('산업', '으로(로)')).toBe('산업으로')
    expect(withJosa('기업', '으로(로)')).toBe('기업으로')
    expect(withJosa('가나전자', '으로(로)')).toBe('가나전자로')
  })

  it('영문자는 읽는 소리로 고른다', () => {
    expect(withJosa('FLNC', '이(가)')).toBe('FLNC가')
    expect(withJosa('HBM', '을(를)')).toBe('HBM을')
    expect(withJosa('DRAM', '이(가)')).toBe('DRAM이')
    expect(withJosa('POET', '이(가)')).toBe('POET가')
    expect(withJosa('ABC', '이(가)')).toBe('ABC가')
    expect(withJosa('SK하이닉스 (KR)', '을(를)')).toBe('SK하이닉스 (KR)을')
    expect(withJosa('intel', '으로(로)')).toBe('intel로')
  })

  it('숫자는 읽는 소리로 고른다', () => {
    expect(withJosa('A1', '으로(로)')).toBe('A1로')
    expect(withJosa('버전 3', '을(를)')).toBe('버전 3을')
    expect(withJosa('버전 2', '을(를)')).toBe('버전 2를')
    expect(withJosa('버전 0', '으로(로)')).toBe('버전 0으로')
  })

  it('끝의 괄호와 따옴표, 마침표는 건너뛴다', () => {
    expect(withJosa('「기업」', '이(가)')).toBe('「기업」이')
    expect(withJosa('"가나전자"', '을(를)')).toBe('"가나전자"를')
    expect(withJosa('병목 (가설).', '은(는)')).toBe('병목 (가설).은')
  })

  it('기호로 끝나거나 비면 적힌 그대로 붙인다', () => {
    expect(withJosa('A-', '이(가)')).toBe('A-이(가)')
    expect(withJosa('', '을(를)')).toBe('을(를)')
    expect(withJosa('( )', '이(가)')).toBe('( )이(가)')
    expect(withJosa('가나', '에서')).toBe('가나에서')
  })
})

describe('finalSound', () => {
  it('끝소리를 받침 없음, ㄹ 받침, 다른 받침, 모름으로 나눈다', () => {
    expect(finalSound('가나')).toBe('none')
    expect(finalSound('서울')).toBe('rieul')
    expect(finalSound('기업')).toBe('other')
    expect(finalSound('excel')).toBe('rieul')
    expect(finalSound('ETF')).toBe('none')
    expect(finalSound('HBM')).toBe('other')
    expect(finalSound('7')).toBe('rieul')
    expect(finalSound('6')).toBe('other')
    expect(finalSound('9')).toBe('none')
    expect(finalSound('A-')).toBeNull()
    expect(finalSound('')).toBeNull()
  })
})

describe('claimSentenceParts', () => {
  it('문장 틀을 칸과 글로 나누고 이름이 있으면 조사를 고른다', () => {
    expect(claimSentenceParts(ontology, 'MENTORED')).toEqual([
      { kind: 'slot', slot: 'subject' },
      { kind: 'text', text: '이(가) ' },
      { kind: 'slot', slot: 'object' },
      { kind: 'text', text: '에 가르쳤다' },
    ])
    expect(claimSentenceParts(ontology, 'MENTORED', { subject: '가나전자' })[1]).toEqual({ kind: 'text', text: '가 ' })
  })

  it('문장 틀이 없으면 주체 칸, 대상 칸, 관계 표시 이름 순서다', () => {
    expect(claimSentenceParts(ontology, 'UNKNOWN')).toEqual([
      { kind: 'slot', slot: 'subject' },
      { kind: 'text', text: ' ' },
      { kind: 'slot', slot: 'object' },
      { kind: 'text', text: ' UNKNOWN' },
    ])
  })
})

describe('createFirstHint', () => {
  it('고를 후보가 없을 때 먼저 만들 타입을 알린다', () => {
    expect(createFirstHint(['기업'])).toBe('먼저 기업을 만드세요')
    expect(createFirstHint(['기업', '종목'])).toBe('먼저 기업, 종목을 만드세요')
  })
})

describe('nodeHint', () => {
  const createdAt = '2026-10-21T00:00:00Z'

  it('hintProperties 의 표시 값과 만든 날을 잇는다', () => {
    expect(nodeHint(testOntology, { type: 'Company', properties: { country: 'KR' }, createdAt })).toMatch(/^대한민국 \(KR\) · /)
  })

  it('값이 빈 속성과 hintProperties 가 없는 타입은 만든 날만이다', () => {
    const dateOnly = nodeHint(testOntology, { type: 'Company', properties: {}, createdAt })
    expect(dateOnly).not.toContain(' · ')
    expect(nodeHint(testOntology, { type: 'Person', properties: { name: 'x' }, createdAt })).toBe(dateOnly)
  })
})

describe('sameName', () => {
  it('앞뒤 공백과 대소문자는 무시한다', () => {
    expect(sameName(' 가나 전자 ', '가나 전자')).toBe(true)
    expect(sameName('ABC', 'abc')).toBe(true)
  })

  it('다른 글자와 가운데 공백 차이는 다른 이름이다', () => {
    expect(sameName('가나', '가나전자')).toBe(false)
    expect(sameName('가나 전자', '가나  전자')).toBe(false)
  })
})
