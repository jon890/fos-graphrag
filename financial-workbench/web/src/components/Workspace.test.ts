import { describe, expect, it } from 'vitest'
import { initialMobileTab } from './Workspace'

describe('initialMobileTab', () => {
  it('고른 노드가 없으면 검색 탭에서 시작한다', () => {
    expect(initialMobileTab(null)).toBe('search')
  })

  it('고른 노드가 있으면 상세 탭에서 시작한다', () => {
    expect(initialMobileTab('id-1')).toBe('detail')
  })
})
