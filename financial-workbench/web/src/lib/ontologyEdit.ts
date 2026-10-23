import type { OntologyImpactKind } from '../api/types'

const IMPACT_TEXT: Record<OntologyImpactKind, string> = {
  REMOVED_NODE_TYPE: '이 타입의 노드 {n}개가 정의 없이 남습니다',
  REMOVED_PROPERTY: '노드 {n}개가 이 속성 값을 가지고 있습니다',
  NOW_REQUIRED: '노드 {n}개에 이 속성 값이 없습니다',
  REMOVED_ENUM_VALUE: '노드 {n}개가 이 값을 쓰고 있습니다',
  CHANGED_PROPERTY_TYPE: '노드 {n}개의 값이 예전 타입으로 남습니다',
  NARROWED_RANGE: '노드 {n}개의 값이 새 범위를 넘습니다',
  REMOVED_RELATIONSHIP_TYPE: '이 종류의 관계 {n}개가 정의 없이 남습니다',
  NARROWED_RELATIONSHIP_ENDS: '관계 {n}개가 빠진 타입에 걸려 있습니다',
  REMOVED_CLAIM_PREDICATE: '이 종류의 주장 {n}개가 정의 없이 남습니다',
  NARROWED_CLAIM_TYPES: '주장 {n}개의 주체나 대상이 빠진 타입입니다',
}

/** 영향 한 줄의 설명 문장. 서버가 모르는 kind 를 주면 kind 와 개수를 그대로 보인다 */
export function impactText(kind: OntologyImpactKind, count: number): string {
  const template = IMPACT_TEXT[kind]
  return template ? template.replace('{n}', String(count)) : `${kind} ${count}`
}

/** 온톨로지 편집 초안. App 이 들고 있어 탭을 옮겨도 남는다. baseVersion 은 초안을 시작한 버전이다 */
export interface OntologyDraft {
  baseVersion: number
  yaml: string
  /** 사람이 고친 적이 있는가. 고친 초안이 있으면 창을 닫기 전에 묻는다 */
  dirty: boolean
}
