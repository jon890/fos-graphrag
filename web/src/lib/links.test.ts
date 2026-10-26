import { describe, expect, it } from 'vitest'
import { nodeLink, rememberReturnTo, takeReturnTo } from './links'

function fakeStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  } as unknown as Storage
}

const broken = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
} as unknown as Storage

describe('링크 함수', () => {
  it('nodeLink 는 id 를 인코딩해 origin 뒤에 붙인다', () => {
    expect(nodeLink('a b', 'https://x.io')).toBe('https://x.io/workspace?node=a%20b')
  })

  it('둔 주소는 한 번만 꺼낼 수 있다', () => {
    const s = fakeStorage()
    rememberReturnTo('/changes?target=n1', s)
    expect(takeReturnTo(s)).toBe('/changes?target=n1')
    expect(takeReturnTo(s)).toBeNull()
  })

  it('동의 화면 주소는 query 까지 그대로 돌려준다', () => {
    const s = fakeStorage()
    const url = '/connect?response_type=code&client_id=c1&redirect_uri=http%3A%2F%2Flocalhost%3A1%2Fcb'
    rememberReturnTo(url, s)
    expect(takeReturnTo(s)).toBe(url)
  })

  it('안전하지 않은 주소는 저장하지 않고, 저장소에 든 안전하지 않은 값도 꺼내지 않는다', () => {
    const s = fakeStorage()
    rememberReturnTo('//evil.example', s)
    rememberReturnTo('https://x.io/workspace', s)
    expect(takeReturnTo(s)).toBeNull()
    s.setItem('workbench.returnTo', '//evil.example')
    expect(takeReturnTo(s)).toBeNull()
  })

  it('저장소가 막혀 있어도 예외를 내지 않는다', () => {
    expect(takeReturnTo(broken)).toBeNull()
    expect(() => rememberReturnTo('/workspace', broken)).not.toThrow()
  })
})
