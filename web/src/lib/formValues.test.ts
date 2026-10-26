import { describe, expect, it } from 'vitest'
import {
  buildCreateProperties,
  buildPatchProperties,
  fromInputValue,
  initialFormValues,
  isoToLocalInput,
  initialCreateValues,
  localInputToIso,
  toInputValue,
} from './formValues'
import type { PropertyDef } from '../api/types'

const str: PropertyDef = { type: 'string', required: false, maxLength: 5 }
const req: PropertyDef = { type: 'string', required: true, maxLength: 200 }
const num: PropertyDef = { type: 'number', required: false, min: 0, max: 1 }
const int: PropertyDef = { type: 'integer', required: false }
const bool: PropertyDef = { type: 'boolean', required: false }
const date: PropertyDef = { type: 'date', required: false }
const en: PropertyDef = { type: 'enum', required: true, values: ['KRX_KOSPI', 'NYSE'] }
const dt: PropertyDef = { type: 'datetime', required: true }

describe('fromInputValue', () => {
  it('빈 문자열과 공백은 null 이다', () => {
    expect(fromInputValue(str, '')).toEqual({ value: null, error: null })
    expect(fromInputValue(str, '   ')).toEqual({ value: null, error: null })
    expect(fromInputValue(num, '')).toEqual({ value: null, error: null })
    expect(fromInputValue(date, '')).toEqual({ value: null, error: null })
  })

  it('필수 값이 비면 오류다', () => {
    expect(fromInputValue(req, '').error).toBe('필수 값입니다.')
  })

  it('number 와 integer 는 숫자로 바꾼다', () => {
    expect(fromInputValue(num, '0.75')).toEqual({ value: 0.75, error: null })
    expect(fromInputValue(int, '42')).toEqual({ value: 42, error: null })
    expect(fromInputValue(int, '4.2').error).toBe('정수를 입력하세요.')
    expect(fromInputValue(num, 'abc').error).toBe('숫자를 입력하세요.')
    expect(fromInputValue(num, '1.5').error).toBe('1 이하여야 합니다.')
    expect(fromInputValue(num, '-0.1').error).toBe('0 이상이어야 합니다.')
  })

  it('boolean, date, enum, maxLength 를 처리한다', () => {
    expect(fromInputValue(bool, 'true').value).toBe(true)
    expect(fromInputValue(bool, 'false').value).toBe(false)
    expect(fromInputValue(date, '2026-03-15').value).toBe('2026-03-15')
    expect(fromInputValue(date, '2026/03/15').error).not.toBeNull()
    expect(fromInputValue(en, 'NYSE').value).toBe('NYSE')
    expect(fromInputValue(en, 'XXX').error).not.toBeNull()
    expect(fromInputValue(str, 'abcdef').error).toBe('5자 이하여야 합니다.')
    expect(fromInputValue(str, '  KR  ').value).toBe('KR')
  })

  it('datetime-local 입력을 UTC ISO 로 바꾸고 되돌릴 수 있다', () => {
    const iso = localInputToIso('2026-10-20T12:34')
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
    expect(isoToLocalInput(iso!)).toBe('2026-10-20T12:34')
    expect(fromInputValue(dt, '2026-10-20T12:34').value).toBe(iso)
    expect(toInputValue(dt, iso)).toBe('2026-10-20T12:34')
  })
})

describe('buildCreateProperties / buildPatchProperties', () => {
  const defs: Record<string, PropertyDef> = { name: req, country: { type: 'string', required: false, maxLength: 2 }, score: num }

  it('생성은 값이 있는 속성만 담는다', () => {
    const r = buildCreateProperties(defs, { name: '가상전자', country: '', score: '0.5' })
    expect(r.errors).toEqual({})
    expect(r.properties).toEqual({ name: '가상전자', score: 0.5 })
  })

  it('생성 시 필수 값이 비면 오류를 모은다', () => {
    expect(buildCreateProperties(defs, { name: '' }).errors).toEqual({ name: '필수 값입니다.' })
  })

  it('수정은 바뀐 속성만 담고 지운 값은 null 로 보낸다', () => {
    const original = { name: '가상전자', country: 'KR', score: 0.5 }
    const values = initialFormValues(defs, original)
    expect(values).toEqual({ name: '가상전자', country: 'KR', score: '0.5' })
    const r = buildPatchProperties(defs, original, { ...values, country: '', score: '0.5' })
    expect(r.properties).toEqual({ country: null })
  })
})

describe('url 입력', () => {
  const url: PropertyDef = { type: 'url', required: true, maxLength: 2000 }

  it('scheme 이 없으면 https:// 를 붙이고 있으면 그대로 둔다', () => {
    expect(fromInputValue(url, 'example.com/a')).toEqual({ value: 'https://example.com/a', error: null })
    expect(fromInputValue(url, 'http://example.com')).toEqual({ value: 'http://example.com', error: null })
    expect(fromInputValue(url, 'HTTPS://x.io')).toEqual({ value: 'HTTPS://x.io', error: null })
  })

  it('공백만 있으면 필수 오류다', () => {
    expect(fromInputValue(url, '   ')).toEqual({ value: null, error: '필수 값입니다.' })
  })
})

describe('buildPatchProperties 의 바꾸지 않은 칸', () => {
  const defs: Record<string, PropertyDef> = {
    en: { type: 'enum', required: false, values: ['KRX_KOSPI', 'NYSE'] },
    note: { type: 'string', required: false, maxLength: 20 },
  }

  it('목록 밖 예전 값이 남아도 바꾼 칸만 담긴다', () => {
    const r = buildPatchProperties(defs, { en: 'KOR', note: 'a' }, { en: 'KOR', note: 'b' })
    expect(r.errors).toEqual({})
    expect(r.properties).toEqual({ note: 'b' })
  })

  it('그 칸을 목록 안 값으로 바꾸면 담긴다', () => {
    const r = buildPatchProperties(defs, { en: 'KOR', note: 'a' }, { en: 'NYSE', note: 'a' })
    expect(r.properties).toEqual({ en: 'NYSE' })
  })
})

describe('initialCreateValues', () => {
  it('필수 datetime 칸만 지금 시각으로 채운다', () => {
    const defs: Record<string, PropertyDef> = {
      at: { type: 'datetime', required: true },
      opt: { type: 'datetime', required: false },
    }
    const r = initialCreateValues(defs, new Date('2026-10-21T03:04:00Z'))
    expect(r.at).toBe(isoToLocalInput('2026-10-21T03:04:00Z'))
    expect(r.opt).toBe('')
  })
})
