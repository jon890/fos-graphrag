import { describe, expect, it } from 'vitest'
import { initialMobileTab, mobileTabOf } from './Workspace'

describe('initialMobileTab', () => {
  it('고른 노드가 없으면 검색 탭에서 시작한다', () => {
    expect(initialMobileTab(null)).toBe('search')
  })

  it('고른 노드가 있으면 상세 탭에서 시작한다', () => {
    expect(initialMobileTab('id-1')).toBe('detail')
  })
})

describe('mobileTabOf', () => {
  it('주소의 pane 이 있으면 그것을 쓴다', () => {
    expect(mobileTabOf('graph', 'n1')).toBe('graph')
  })

  it('pane 이 없으면 고른 노드로 정한다', () => {
    expect(mobileTabOf(null, 'n1')).toBe('detail')
    expect(mobileTabOf(null, null)).toBe('search')
  })
})
