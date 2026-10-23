import { describe, expect, it } from 'vitest'
import type { CurrentUser, Ontology } from '../api/types'
import { testOntology } from '../components/testSupport'
import {
  archiveOrder,
  BROWSE_STEPS,
  clearProgress,
  practiceDocumentValues,
  practiceNames,
  practicePredicateCandidates,
  practiceSteps,
  readProgress,
  shouldAutoStart,
  writeProgress,
  type GuideProgress,
} from './guide'
import { predicateLabel, typeLabel } from './labels'

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

/** 산업 타입, 자료 종류, 「속한다」 를 더한 온톨로지 */
function practiceOntology(): Ontology {
  const o: Ontology = structuredClone(testOntology)
  o.nodeTypes.Sector = { label: '산업', description: '산업', labelProperty: 'name', properties: { name: { type: 'string', label: '산업 이름', required: true } } }
  o.nodeTypes.Document.properties.documentType = { type: 'enum', label: '자료 종류', required: false, values: ['NEWS', 'OTHER'] }
  o.claimPredicates.BELONGS_TO_SECTOR = { label: '속한다', description: '', subjectTypes: ['Company'], objectTypes: ['Sector'] }
  return o
}

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

  it('진행 중인 따라하기가 있으면 끝낸 기록이 있어도 저절로 연다', () => {
    const user: CurrentUser = { id: 'u1', email: 'a@example.com', displayName: 'A', role: 'EDITOR', guideDoneAt: '2026-10-23T01:02:03Z' }
    const practice: GuideProgress = { ...progress, kind: 'practice', plan: { predicate: 'BELONGS_TO_SECTOR', objectType: 'Sector' } }
    expect(shouldAutoStart(user, practice)).toBe(true)
    expect(shouldAutoStart(user, progress)).toBe(false)
  })

  it('따라하기 진행 상태는 고른 주장 종류와 함께 읽고, 주장 종류가 없으면 null 이다', () => {
    const s = fakeStorage()
    const practice: GuideProgress = {
      ...progress,
      kind: 'practice',
      created: { company: 'c' },
      plan: { predicate: 'BELONGS_TO_SECTOR', objectType: 'Sector' },
    }
    writeProgress(practice, s)
    expect(readProgress('u1', s)).toEqual(practice)
    s.setItem('workbench.guide', JSON.stringify({ ...practice, plan: undefined }))
    expect(readProgress('u1', s)).toBeNull()
  })

  it('연습 이름은 표시 이름과 시작한 지역 시각의 MMDD-HHmm 이다', () => {
    const names = practiceNames('관리자', new Date(2026, 9, 23, 14, 5))
    expect(names.company).toBe('[연습] 관리자 기업 1023-1405')
    expect(names.document).toBe('[연습] 관리자 메모 1023-1405')
  })

  it('주장 종류 후보는 「속한다」 가 먼저고, 기업 타입이 없으면 빈 목록이다', () => {
    const o = practiceOntology()
    expect(practicePredicateCandidates(o)).toEqual(['BELONGS_TO_SECTOR', 'SUPPLIES_TO'])
    const withoutSector = practiceOntology()
    delete withoutSector.claimPredicates.BELONGS_TO_SECTOR
    expect(practicePredicateCandidates(withoutSector)).toEqual(['SUPPLIES_TO'])
    const withoutCompany = practiceOntology()
    delete withoutCompany.nodeTypes.Company
    expect(practicePredicateCandidates(withoutCompany)).toEqual([])
  })

  it('연습 근거 문서는 기타가 있을 때만 자료 종류를 채운다', () => {
    const o = practiceOntology()
    expect(practiceDocumentValues(o, '메모')).toEqual({ title: '메모', url: 'https://example.com/practice', documentType: 'OTHER' })
    o.nodeTypes.Document.properties.documentType.values = ['NEWS']
    expect(practiceDocumentValues(o, '메모')).not.toHaveProperty('documentType')
  })

  it('보관은 주장, 근거 문서, 기업 순서로 있는 ID 만 한다', () => {
    expect(archiveOrder({ company: 'c', document: 'd', claim: 'm' })).toEqual(['m', 'd', 'c'])
    expect(archiveOrder({ company: 'c' })).toEqual(['c'])
  })

  it('따라하기 단계는 만들기 단추와 그래프를 가리키고 대상 타입 이름을 말풍선에 넣는다', () => {
    const o = practiceOntology()
    const steps = practiceSteps({ type: (t) => typeLabel(o, t), predicate: (p) => predicateLabel(o, p) }, { predicate: 'BELONGS_TO_SECTOR', objectType: 'Sector' })
    expect(steps.map((s) => s.id)).toEqual(['intro', 'company', 'document', 'claim', 'done'])
    expect(steps.map((s) => s.target)).toEqual([null, 'create-submit', 'create-submit', 'claim-add-submit', 'graph-canvas'])
    expect(steps.map((s) => s.pane)).toEqual([null, 'search', 'search', 'detail', 'graph'])
    expect(steps[3].body).toContain('대상에 산업 하나를 고르고')
    expect(steps[3].title).toContain('속한다')
  })
})
