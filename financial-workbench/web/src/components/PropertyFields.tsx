import type { PropertyDef } from '../api/types'
import type { FormValues } from '../lib/formValues'

const TYPE_HINT: Record<string, string> = {
  string: '문자열',
  text: '긴 글',
  url: 'URL',
  enum: '선택',
  date: '날짜',
  datetime: '날짜와 시각',
  number: '숫자',
  integer: '정수',
  boolean: '참/거짓',
}

interface Props {
  defs: Record<string, PropertyDef>
  values: FormValues
  errors?: Record<string, string>
  onChange: (name: string, value: string) => void
  /** data-testid 접두사. 같은 화면에 폼이 여럿 있어도 겹치지 않게 한다. 결과는 `${prefix}-${속성}` */
  testIdPrefix: string
  disabled?: boolean
  /** 서버가 관리해 사용자가 바꿀 수 없는 속성 */
  readOnlyNames?: string[]
}

export function PropertyFields({ defs, values, errors = {}, onChange, testIdPrefix, disabled, readOnlyNames = [] }: Props) {
  return (
    <div className="prop-fields">
      {Object.entries(defs).map(([name, def]) => {
        const id = `${testIdPrefix}-${name}`
        const value = values[name] ?? ''
        const readOnly = disabled || readOnlyNames.includes(name)
        const common = {
          id,
          'data-testid': id,
          value,
          disabled: readOnly,
          'aria-invalid': errors[name] ? true : undefined,
        }
        let input
        switch (def.type) {
          case 'text':
            input = <textarea {...common} rows={3} maxLength={def.maxLength} onChange={(e) => onChange(name, e.target.value)} />
            break
          case 'enum':
            input = (
              <select {...common} onChange={(e) => onChange(name, e.target.value)}>
                <option value="">{def.required ? '선택하세요' : '(없음)'}</option>
                {(def.values ?? []).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )
            break
          case 'boolean':
            input = (
              <select {...common} onChange={(e) => onChange(name, e.target.value)}>
                <option value="">(없음)</option>
                <option value="true">예</option>
                <option value="false">아니오</option>
              </select>
            )
            break
          case 'date':
            input = <input {...common} type="date" onChange={(e) => onChange(name, e.target.value)} />
            break
          case 'datetime':
            input = <input {...common} type="datetime-local" onChange={(e) => onChange(name, e.target.value)} />
            break
          case 'number':
          case 'integer':
            input = (
              <input
                {...common}
                type="number"
                step={def.type === 'integer' ? 1 : 'any'}
                min={def.min}
                max={def.max}
                onChange={(e) => onChange(name, e.target.value)}
              />
            )
            break
          case 'url':
            input = <input {...common} type="url" maxLength={def.maxLength} onChange={(e) => onChange(name, e.target.value)} />
            break
          default:
            input = <input {...common} type="text" maxLength={def.maxLength} onChange={(e) => onChange(name, e.target.value)} />
        }
        return (
          <div className="field" key={name}>
            <label htmlFor={id}>
              {name}
              {def.required && <span className="required"> *</span>}
              <span className="muted small"> {TYPE_HINT[def.type] ?? def.type}</span>
            </label>
            {input}
            {def.description && <div className="hint">{def.description}</div>}
            {errors[name] && (
              <div className="field-error" data-testid={`${id}-error`}>
                {errors[name]}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 서버 VALIDATION_FAILED 의 details.fieldErrors 를 꺼낸다. */
export function fieldErrorsOf(details: Record<string, unknown> | null | undefined): Record<string, string> {
  const raw = details?.fieldErrors
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.startsWith('properties.') ? k.slice('properties.'.length) : k
    out[key] = String(v)
  }
  return out
}
