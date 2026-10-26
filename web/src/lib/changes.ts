import type { ChangeRef, Ontology } from '../api/types'
import { ROLE_LABEL } from '../context'
import { formatDateTime, summarizeValue } from './format'
import { enumValueLabel, nodeDisplayLabel, propertyDef, propertyLabel, reviewStatusLabel } from './labels'

/** 값이 노드나 사용자 ID 인 이력 키. 서버가 refs 에 이 ID 들의 지금 이름을 싣는다 */
export const REF_KEYS = new Set(['subjectId', 'objectId', 'documentIds', 'fromId', 'toId', 'reviewedBy'])

/** 온톨로지 버전 이력의 키. 값은 바뀐 경로의 목록이다 */
const ONTOLOGY_PATH_KEYS = new Set(['added', 'removed', 'changed'])

/** 이력 키의 이름. 속성이면 속성 label, 아니면 changeFields label, 둘 다 없으면 키 */
export function changeFieldLabel(o: Ontology, targetType: string, key: string): string {
  const def = propertyDef(o, targetType, key)
  return def?.label || o.changeFields?.[key]?.label || propertyLabel(o, targetType, key)
}

function refName(o: Ontology, ref: ChangeRef | undefined): string {
  if (!ref) return '(찾을 수 없는 항목)'
  return ref.type === 'User' ? ref.label : nodeDisplayLabel(o, ref)
}

/** 이력 값 하나를 보일 말로. refs 에 있는 ID 는 이름, 목록은 쉼표로 잇는다 */
export function changeValueText(o: Ontology, targetType: string, key: string, value: unknown, refs: Record<string, ChangeRef>, targetKind?: string): string {
  if (value === null || value === undefined || value === '') return '(없음)'
  if (REF_KEYS.has(key)) {
    const ids = Array.isArray(value) ? value : [value]
    return ids.map((id) => refName(o, refs[String(id)])).join(', ')
  }
  if (targetKind === 'ONTOLOGY' && ONTOLOGY_PATH_KEYS.has(key) && Array.isArray(value)) return value.join(', ')
  if (key === 'reviewedAt') return formatDateTime(String(value))
  if (key === 'reviewStatus') return reviewStatusLabel(o, String(value))
  if (key === 'role') return ROLE_LABEL[String(value)] ?? String(value)
  if (value === true) return '예'
  if (value === false) return '아니오'
  const def = propertyDef(o, targetType, key)
  if (def?.type === 'enum' && typeof value === 'string') return enumValueLabel(def, value)
  return summarizeValue(value)
}
