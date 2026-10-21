import type { PropertyDef, PropertyValue } from '../api/types'
import { toInputValue, type FormValues } from './formValues'

/** 409 를 받았을 때 화면이 들고 있던 것. revision 은 편집을 시작한 revision 이다 */
export interface EditDraft {
  nodeId: string
  revision: number
  base: Record<string, PropertyValue>
  mine: FormValues
}

export type ConflictKind = 'theirs' | 'mine' | 'both'

export interface ConflictField {
  name: string
  kind: ConflictKind
  /** 입력칸 문자열 */
  mine: string
  latest: string
}

/**
 * 편집 시작 값, 내 입력, 최신 값을 칸마다 비교한다. text 가 아니면 앞뒤 공백을 무시한다.
 * 둘 다 안 바꿨거나 같은 값으로 바꾼 칸은 넣지 않는다. 순서는 defs 순서다.
 */
export function compareConflict(
  defs: Record<string, PropertyDef>,
  base: Record<string, PropertyValue>,
  mine: FormValues,
  latest: Record<string, PropertyValue>,
): ConflictField[] {
  const fields: ConflictField[] = []
  for (const [name, def] of Object.entries(defs)) {
    const norm = (s: string) => (def.type === 'text' ? s : s.trim())
    const b = norm(toInputValue(def, base[name]))
    const m = norm(mine[name] ?? '')
    const l = norm(toInputValue(def, latest[name]))
    const mineChanged = m !== b
    const latestChanged = l !== b
    const mineText = mine[name] ?? ''
    const latestText = toInputValue(def, latest[name])
    if (!mineChanged && latestChanged) fields.push({ name, kind: 'theirs', mine: mineText, latest: latestText })
    else if (mineChanged && !latestChanged) fields.push({ name, kind: 'mine', mine: mineText, latest: latestText })
    else if (mineChanged && latestChanged && m !== l) fields.push({ name, kind: 'both', mine: mineText, latest: latestText })
  }
  return fields
}

/** 최신 값으로 만든 입력에 'mine' 칸과 choices 가 'mine' 인 'both' 칸의 내 입력을 넣는다 */
export function applyConflict(latestValues: FormValues, fields: ConflictField[], choices: Record<string, 'mine' | 'latest'>): FormValues {
  const result = { ...latestValues }
  for (const f of fields) {
    if (f.kind === 'mine' || (f.kind === 'both' && choices[f.name] === 'mine')) result[f.name] = f.mine
  }
  return result
}

/** 다시 적용할 칸('mine', 'both')이 하나라도 있는가 */
export function hasReapplicable(fields: ConflictField[]): boolean {
  return fields.some((f) => f.kind !== 'theirs')
}
