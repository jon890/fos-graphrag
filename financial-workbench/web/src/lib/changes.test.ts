import { describe, expect, it } from 'vitest'
import type { Ontology } from '../api/types'
import { testOntology } from '../components/testSupport'
import { changeFieldLabel, changeValueText } from './changes'

const o: Ontology = {
  ...testOntology,
  changeFields: {
    subjectId: { label: '주체' },
    documentIds: { label: '근거 문서' },
    archived: { label: '보관' },
    reviewStatus: { label: '검토 상태' },
    role: { label: '역할' },
  },
}

describe('changeFieldLabel', () => {
  it('속성 label, changeFields label, 키 순서로 이름을 고른다', () => {
    expect(changeFieldLabel(o, 'Company', 'name')).toBe('기업 이름')
    expect(changeFieldLabel(o, 'Claim', 'subjectId')).toBe('주체')
    expect(changeFieldLabel(o, 'Claim', 'unknownKey')).toBe('unknownKey')
  })
})

describe('changeValueText', () => {
  const company = (id: string, label: string) => ({ id, type: 'Company', label, archived: false })

  it('검토자 ID 는 사용자 이름으로 보인다', () => {
    const refs = { u2: { id: 'u2', type: 'User', label: 'Bob', archived: false } }
    expect(changeValueText(o, 'Claim', 'reviewedBy', 'u2', refs)).toBe('Bob')
  })

  it('노드 ID 는 이름으로, refs 에 없으면 찾을 수 없다는 말로 보인다', () => {
    expect(changeValueText(o, 'Claim', 'subjectId', 'c1', { c1: company('c1', '가나전자') })).toBe('가나전자')
    expect(changeValueText(o, 'Claim', 'subjectId', 'c1', {})).toBe('(찾을 수 없는 항목)')
  })

  it('ID 목록은 이름을 쉼표로 잇는다', () => {
    const refs = { d1: company('d1', '문서1'), d2: company('d2', '문서2') }
    expect(changeValueText(o, 'Claim', 'documentIds', ['d1', 'd2'], refs)).toBe('문서1, 문서2')
  })

  it('불리언, 검토 상태, 역할, 빈 값을 보일 말로 바꾼다', () => {
    expect(changeValueText(o, 'Company', 'archived', false, {})).toBe('아니오')
    expect(changeValueText(o, 'Company', 'archived', true, {})).toBe('예')
    expect(changeValueText(o, 'Claim', 'reviewStatus', 'DRAFT', {})).toBe('초안')
    expect(changeValueText(o, 'User', 'role', 'EDITOR', {})).toBe('편집자')
    expect(changeValueText(o, 'Company', 'name', null, {})).toBe('(없음)')
  })

  it('enum 속성은 선택지 이름으로 보인다', () => {
    expect(changeValueText(o, 'Company', 'country', 'KR', {})).toBe('대한민국 (KR)')
  })
})
