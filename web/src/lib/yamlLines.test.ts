import { describe, expect, it } from 'vitest'
import { lineRange } from './yamlLines'

describe('lineRange', () => {
  const text = 'ab\ncdef\ng'

  it('2번째 줄의 범위는 줄바꿈을 뺀 그 줄이다', () => {
    const { start, end } = lineRange(text, 2)
    expect(text.slice(start, end)).toBe('cdef')
  })

  it('줄 수를 넘는 번호는 마지막 줄이다', () => {
    const { start, end } = lineRange(text, 99)
    expect(text.slice(start, end)).toBe('g')
  })

  it('빈 문자열은 0 에서 0 이다', () => {
    expect(lineRange('', 1)).toEqual({ start: 0, end: 0 })
  })
})
