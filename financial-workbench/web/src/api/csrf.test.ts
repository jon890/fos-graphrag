import { describe, expect, it } from 'vitest'
import { readCookie } from './csrf'
import { buildQuery } from './client'

describe('readCookie', () => {
  it('이름이 정확히 같은 쿠키 값을 돌려준다', () => {
    expect(readCookie('a=1; XSRF-TOKEN=abc-123; b=2', 'XSRF-TOKEN')).toBe('abc-123')
  })

  it('비슷한 이름의 쿠키와 헷갈리지 않는다', () => {
    expect(readCookie('MY-XSRF-TOKEN=nope; XSRF-TOKEN-OLD=x', 'XSRF-TOKEN')).toBeNull()
  })

  it('URL 인코딩된 값을 풀고 값의 = 를 보존한다', () => {
    expect(readCookie('XSRF-TOKEN=a%2Bb%3D%3D', 'XSRF-TOKEN')).toBe('a+b==')
    expect(readCookie('XSRF-TOKEN=abc==', 'XSRF-TOKEN')).toBe('abc==')
  })

  it('없거나 비어 있으면 null 이다', () => {
    expect(readCookie('', 'XSRF-TOKEN')).toBeNull()
    expect(readCookie('XSRF-TOKEN=', 'XSRF-TOKEN')).toBeNull()
    expect(readCookie('other=1', 'XSRF-TOKEN')).toBeNull()
  })

  it('잘못된 인코딩은 원문을 돌려준다', () => {
    expect(readCookie('XSRF-TOKEN=%E0%A4%A', 'XSRF-TOKEN')).toBe('%E0%A4%A')
  })
})

describe('buildQuery', () => {
  it('빈 값은 빼고 배열은 쉼표로 잇는다', () => {
    expect(buildQuery({ q: '', types: ['Company', 'Security'], page: 0, x: undefined, flag: true })).toBe(
      '?types=Company%2CSecurity&page=0&flag=true',
    )
    expect(buildQuery({ types: [] })).toBe('')
  })
})
