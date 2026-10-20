import type { PropertyDef, PropertyValue } from '../api/types'

/** 폼 입력은 모두 문자열로 들고 있다가 저장할 때 온톨로지 타입으로 바꾼다. */
export type FormValues = Record<string, string>

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** UTC ISO 시각을 datetime-local 입력값(로컬 시각, 분 단위)으로 바꾼다. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local 입력값(로컬 시각)을 UTC ISO 문자열로 바꾼다. 밀리초는 뺀다. */
export function localInputToIso(local: string): string | null {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** 서버 값을 입력란 문자열로 바꾼다. */
export function toInputValue(def: PropertyDef, value: PropertyValue | undefined): string {
  if (value === null || value === undefined) return ''
  switch (def.type) {
    case 'boolean':
      return value === true || value === 'true' ? 'true' : 'false'
    case 'datetime':
      return typeof value === 'string' ? isoToLocalInput(value) : ''
    default:
      return String(value)
  }
}

export interface ConvertResult {
  value: PropertyValue
  error: string | null
}

/**
 * 입력란 문자열을 API 로 보낼 값으로 바꾼다.
 * 빈 문자열(공백만 있는 것 포함)은 null 이다. number 와 integer 는 숫자로 바꾼다.
 */
export function fromInputValue(def: PropertyDef, raw: string): ConvertResult {
  const text = def.type === 'text' ? raw : raw.trim()
  if (text.trim() === '') {
    return { value: null, error: def.required ? '필수 값입니다.' : null }
  }
  switch (def.type) {
    case 'number':
    case 'integer': {
      const n = Number(text)
      if (!Number.isFinite(n)) return { value: null, error: '숫자를 입력하세요.' }
      if (def.type === 'integer' && !Number.isInteger(n)) return { value: null, error: '정수를 입력하세요.' }
      if (def.min !== undefined && n < def.min) return { value: n, error: `${def.min} 이상이어야 합니다.` }
      if (def.max !== undefined && n > def.max) return { value: n, error: `${def.max} 이하여야 합니다.` }
      return { value: n, error: null }
    }
    case 'boolean':
      return { value: text === 'true', error: null }
    case 'datetime': {
      const iso = localInputToIso(text)
      return iso ? { value: iso, error: null } : { value: null, error: '날짜와 시각 형식이 아닙니다.' }
    }
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(text)
        ? { value: text, error: null }
        : { value: null, error: 'YYYY-MM-DD 형식이어야 합니다.' }
    case 'enum':
      if (def.values && !def.values.includes(text)) return { value: null, error: '허용된 값이 아닙니다.' }
      return { value: text, error: null }
    default:
      if (def.maxLength !== undefined && text.length > def.maxLength) {
        return { value: text, error: `${def.maxLength}자 이하여야 합니다.` }
      }
      return { value: text, error: null }
  }
}

export interface FormConversion {
  properties: Record<string, PropertyValue>
  errors: Record<string, string>
}

/** 새 노드용. 값이 있는 속성만 담는다. */
export function buildCreateProperties(defs: Record<string, PropertyDef>, values: FormValues): FormConversion {
  const properties: Record<string, PropertyValue> = {}
  const errors: Record<string, string> = {}
  for (const [name, def] of Object.entries(defs)) {
    const { value, error } = fromInputValue(def, values[name] ?? '')
    if (error) errors[name] = error
    else if (value !== null) properties[name] = value
  }
  return { properties, errors }
}

/** 수정용. 원래 값과 달라진 속성만 담고, 지운 속성은 null 로 보낸다. */
export function buildPatchProperties(
  defs: Record<string, PropertyDef>,
  original: Record<string, PropertyValue>,
  values: FormValues,
): FormConversion {
  const properties: Record<string, PropertyValue> = {}
  const errors: Record<string, string> = {}
  for (const [name, def] of Object.entries(defs)) {
    const { value, error } = fromInputValue(def, values[name] ?? '')
    if (error) {
      errors[name] = error
      continue
    }
    const before = original[name] ?? null
    const same =
      def.type === 'datetime' && typeof before === 'string' && typeof value === 'string'
        ? toInputValue(def, before) === toInputValue(def, value)
        : before === value
    if (!same) properties[name] = value
  }
  return { properties, errors }
}

export function initialFormValues(defs: Record<string, PropertyDef>, properties: Record<string, PropertyValue> = {}): FormValues {
  const values: FormValues = {}
  for (const [name, def] of Object.entries(defs)) values[name] = toInputValue(def, properties[name])
  return values
}
