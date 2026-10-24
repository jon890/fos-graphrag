import { describe, expect, it } from 'vitest'
import { hasClaimPredicateForNode } from './DetailPanel'
import { testOntology } from './testSupport'

describe('주장 추가 가능 여부', () => {
  const ontology = {
    ...testOntology,
    nodeTypes: {
      ...testOntology.nodeTypes,
      Sector: {
        label: '산업',
        description: '산업 분류',
        labelProperty: 'name',
        properties: { name: { type: 'string' as const, label: '산업 이름', required: true } },
      },
      Gone: {
        label: '어느 끝에도 없는 타입',
        description: '주장에 쓰지 않는다',
        labelProperty: 'name',
        properties: { name: { type: 'string' as const, label: '이름', required: true } },
      },
    },
    claimPredicates: {
      BELONGS_TO_SECTOR: {
        label: '속한다',
        description: '',
        sentence: '{subject}이(가) {object}에 속한다',
        subjectTypes: ['Company'],
        objectTypes: ['Sector'],
      },
    },
  }

  it('대상 전용 타입도 주장 추가를 연다', () => {
    expect(hasClaimPredicateForNode(ontology, 'Sector')).toBe(true)
  })

  it('어느 끝에도 없는 타입에는 주장 추가를 열지 않는다', () => {
    expect(hasClaimPredicateForNode(ontology, 'Gone')).toBe(false)
  })
})
