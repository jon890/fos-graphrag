import { describe, expect, it } from 'vitest'
import type { CurrentUser } from '../api/types'
import { BROWSE_STEPS, clearProgress, readProgress, shouldAutoStart, writeProgress, type GuideProgress } from './guide'

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

const progress: GuideProgress = { userId: 'u1', kind: 'browse', step: 2, startedAt: '2026-10-23T01:02:03.000Z', created: {} }

describe('첫 접속 가이드', () => {
  it('둘러보기는 소개, 검색 입력칸, 그래프, 상세 칸 순서로 가리킨다', () => {
    expect(BROWSE_STEPS.map((s) => s.target)).toEqual([null, 'search-input', 'graph-canvas', 'workspace-pane-detail'])
    expect(BROWSE_STEPS.map((s) => s.pane)).toEqual([null, 'search', 'graph', 'detail'])
  })

  it('같은 사용자는 쓴 진행 상태를 그대로 읽고 다른 사용자는 null 이다', () => {
    const s = fakeStorage()
    writeProgress(progress, s)
    expect(readProgress('u1', s)).toEqual(progress)
    expect(readProgress('u2', s)).toBeNull()
    clearProgress(s)
    expect(readProgress('u1', s)).toBeNull()
  })

  it('깨진 값은 null 이다', () => {
    const s = fakeStorage()
    s.setItem('workbench.guide', '{not json')
    expect(readProgress('u1', s)).toBeNull()
    s.setItem('workbench.guide', JSON.stringify({ userId: 'u1', kind: 'other', step: 0, startedAt: '' }))
    expect(readProgress('u1', s)).toBeNull()
  })

  it('저장소가 막혀 있으면 읽기는 null 이고 쓰기와 지우기는 조용히 끝난다', () => {
    expect(readProgress('u1', broken)).toBeNull()
    expect(() => writeProgress(progress, broken)).not.toThrow()
    expect(() => clearProgress(broken)).not.toThrow()
  })

  it('저장소가 null 이면 아무것도 하지 않는다', () => {
    expect(readProgress('u1', null)).toBeNull()
    expect(() => writeProgress(progress, null)).not.toThrow()
    expect(() => clearProgress(null)).not.toThrow()
  })

  it('끝낸 기록이 없을 때만 저절로 연다', () => {
    const user: CurrentUser = { id: 'u1', email: 'a@example.com', displayName: 'A', role: 'VIEWER', guideDoneAt: null }
    expect(shouldAutoStart(user)).toBe(true)
    expect(shouldAutoStart({ ...user, guideDoneAt: '2026-10-23T01:02:03Z' })).toBe(false)
  })
})
