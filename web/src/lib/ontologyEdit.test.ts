import { describe, expect, it } from 'vitest'
import type { OntologyImpactKind } from '../api/types'
import { impactText } from './ontologyEdit'

describe('impactText', () => {
  const expected: [OntologyImpactKind, string][] = [
    ['REMOVED_NODE_TYPE', '이 타입의 노드 3개가 정의 없이 남습니다'],
    ['REMOVED_PROPERTY', '노드 3개가 이 속성 값을 가지고 있습니다'],
    ['NOW_REQUIRED', '노드 3개에 이 속성 값이 없습니다'],
    ['REMOVED_ENUM_VALUE', '노드 3개가 이 값을 쓰고 있습니다'],
    ['CHANGED_PROPERTY_TYPE', '노드 3개의 값이 예전 타입으로 남습니다'],
    ['NARROWED_RANGE', '노드 3개의 값이 새 범위를 넘습니다'],
    ['REMOVED_RELATIONSHIP_TYPE', '이 종류의 관계 3개가 정의 없이 남습니다'],
    ['NARROWED_RELATIONSHIP_ENDS', '관계 3개가 빠진 타입에 걸려 있습니다'],
    ['REMOVED_CLAIM_PREDICATE', '이 종류의 주장 3개가 정의 없이 남습니다'],
    ['NARROWED_CLAIM_TYPES', '주장 3개의 주체나 대상이 빠진 타입입니다'],
  ]

  it.each(expected)('%s 문장에 개수를 채운다', (kind, text) => {
    expect(impactText(kind, 3)).toBe(text)
  })
})
