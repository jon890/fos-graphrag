import { describe, expect, it } from 'vitest'
import { nodeFromSearch, nodeLink, rememberPendingNode, takePendingNode } from './links'

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
    expect(nodeLink('a b', 'https://x.io')).toBe('https://x.io/?node=a%20b')
  })

  it('nodeFromSearch 는 node 값을 꺼내고 없거나 비면 null 이다', () => {
    expect(nodeFromSearch('?node=abc&x=1')).toBe('abc')
    expect(nodeFromSearch('?login=denied')).toBeNull()
    expect(nodeFromSearch('?node=')).toBeNull()
  })

  it('둔 항목은 한 번만 꺼낼 수 있다', () => {
    const s = fakeStorage()
    rememberPendingNode('n1', s)
    expect(takePendingNode(s)).toBe('n1')
    expect(takePendingNode(s)).toBeNull()
  })

  it('저장소가 막혀 있어도 예외를 내지 않는다', () => {
    expect(takePendingNode(broken)).toBeNull()
    expect(() => rememberPendingNode('n1', broken)).not.toThrow()
  })
})
