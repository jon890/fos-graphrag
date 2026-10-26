import { describe, expect, it } from 'vitest'
import type { PropertyDef } from '../api/types'
import { applyConflict, compareConflict, hasReapplicable } from './conflict'

const str = (): PropertyDef => ({ type: 'string', label: '', required: false })
const defs: Record<string, PropertyDef> = { a: str(), b: str(), c: str(), d: str(), e: str() }

describe('compareConflict', () => {
  const base = { a: '1', b: '1', c: '1', d: '1', e: '1' }
  const mine = { a: '1', b: '1', c: '2', d: '2', e: '2' }
  const latest = { a: '1', b: '3', c: '1', d: '2', e: '3' }

  it('칸마다 다른 쪽만, 나만, 둘 다 바꾼 것을 가르고 같은 값으로 바꾼 칸은 뺀다', () => {
    const fields = compareConflict(defs, base, mine, latest)
    expect(fields.map((f) => [f.name, f.kind])).toEqual([
      ['b', 'theirs'],
      ['c', 'mine'],
      ['e', 'both'],
    ])
  })

  it('text 가 아니면 앞뒤 공백을 무시하고 text 는 다르게 본다', () => {
    const plain = compareConflict({ a: str() }, { a: '1' }, { a: ' 1 ' }, { a: '1' })
    expect(plain).toEqual([])
    const text = compareConflict({ a: { type: 'text', label: '', required: false } }, { a: '1' }, { a: ' 1 ' }, { a: '1' })
    expect(text.map((f) => f.kind)).toEqual(['mine'])
  })
})

describe('applyConflict', () => {
  const fields = compareConflict(
    defs,
    { a: '1', b: '1', c: '1', d: '1', e: '1' },
    { a: '1', b: '1', c: '2', d: '2', e: '2' },
    { a: '1', b: '3', c: '1', d: '2', e: '3' },
  )
  const latestValues = { a: '1', b: '3', c: '1', d: '2', e: '3' }

  it('mine 칸과 내 값을 고른 both 칸만 내 값으로 바꾼다', () => {
    expect(applyConflict(latestValues, fields, { e: 'mine' })).toEqual({ a: '1', b: '3', c: '2', d: '2', e: '2' })
  })

  it('고르지 않은 both 칸은 최신 값이다', () => {
    expect(applyConflict(latestValues, fields, {}).e).toBe('3')
  })
})

describe('hasReapplicable', () => {
  it('theirs 만 있으면 거짓이다', () => {
    const fields = compareConflict(defs, { b: '1' }, { b: '1' }, { b: '3' })
    expect(fields).toHaveLength(1)
    expect(hasReapplicable(fields)).toBe(false)
  })

  it('mine 이 있으면 참이다', () => {
    expect(hasReapplicable(compareConflict(defs, { b: '1' }, { b: '2' }, { b: '1' }))).toBe(true)
  })
})
