import { describe, expect, it } from 'vitest'
import { readMediaQuery } from './useMediaQuery'

function fakeWindow(matches: boolean): Pick<Window, 'matchMedia'> {
  return { matchMedia: (query: string) => ({ matches, media: query }) as MediaQueryList }
}

describe('readMediaQuery', () => {
  it('matchMedia 가 없으면 fallback 을 돌려준다', () => {
    expect(readMediaQuery('(min-width: 1024px)', true, null)).toBe(true)
    expect(readMediaQuery('(min-width: 1024px)', false, null)).toBe(false)
  })

  it('matchMedia 가 맞지 않으면 false 다', () => {
    expect(readMediaQuery('(min-width: 1024px)', true, fakeWindow(false))).toBe(false)
  })

  it('matchMedia 가 맞으면 true 다', () => {
    expect(readMediaQuery('(min-width: 1024px)', false, fakeWindow(true))).toBe(true)
  })
})
