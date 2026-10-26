import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('같은 속성의 utility class 가 겹치면 뒤의 것만 남긴다', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('false 와 undefined 는 빼고 이어 붙인다', () => {
    expect(cn('text-sm', false && 'hidden', undefined)).toBe('text-sm')
  })

  it('인자가 없으면 빈 문자열이다', () => {
    expect(cn()).toBe('')
  })
})
