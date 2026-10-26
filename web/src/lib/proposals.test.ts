import { describe, expect, it } from 'vitest'
import type { NodeRef, ProposalKind, ProposalView, TradeView } from '../api/types'
import { testOntology } from '../components/testSupport'
import { formatDate } from './format'
import { canAccept, editInitialValues, isStaleOntologyChange, kindLabel, nodeName, proposalLinkSentences, proposalSummary, tradeLine, updateNodeParts } from './proposals'

const ref = (id: string, type: string, label: string): NodeRef => ({ id, type, label, archived: false })

const trade: TradeView = {
  id: 't1',
  broker: 'TOSS',
  externalId: 'e1',
  side: 'BUY',
  market: 'US',
  ticker: 'FLNC',
  name: 'Fluence Energy',
  quantity: 10,
  price: 123.45,
  currency: 'USD',
  amount: 1234.5,
  fee: null,
  executedAt: '2026-10-24T12:00:00Z',
  createdAt: '2026-10-25T03:15:00Z',
  createdVia: 'AGENT',
  security: ref('s1', 'Security', 'Fluence Energy 보통주'),
  decisions: [],
}

function proposal(kind: ProposalKind, payload: Record<string, unknown>, extra: Partial<ProposalView> = {}): ProposalView {
  return {
    id: 'p1',
    kind,
    status: 'PENDING',
    payload,
    rationale: '',
    evidence: {},
    createdAt: '2026-10-25T03:15:00Z',
    createdVia: 'AGENT',
    token: { id: 'k1', name: 'Hermes' },
    decidedAt: null,
    decisionNote: null,
    result: null,
    lastError: null,
    requiresEditor: kind === 'CREATE_NODE' || kind === 'CREATE_RELATIONSHIP',
    requiredRole: kind === 'ONTOLOGY_CHANGE' ? 'ADMIN' : kind === 'STUDY_NOTE' || kind === 'LINK_TRADE_DECISION' ? 'VIEWER' : 'EDITOR',
    refs: {
      nodes: { s1: ref('s1', 'Security', '삼성전자'), d1: ref('d1', 'Decision', 'FLNC 첫 매수'), c1: ref('c1', 'Company', 'Apple'), b1: ref('b1', 'Bottleneck', '전력 병목') },
      relationships: {
        r1: { id: 'r1', type: 'HAS_DECISION', from: ref('s1', 'Security', '삼성전자'), to: ref('d1', 'Decision', 'FLNC 첫 매수'), revision: 1, archived: false, createdAt: '2026-10-24T00:00:00Z', createdBy: null },
      },
      trades: { t1: trade },
    },
    ...extra,
  }
}

describe('제안 문장', () => {
  it('종류 이름을 보인다', () => {
    expect(kindLabel('CREATE_NODE')).toBe('항목 만들기')
    expect(kindLabel('CREATE_RELATIONSHIP')).toBe('관계 잇기')
    expect(kindLabel('LINK_TRADE_DECISION')).toBe('체결과 결정 잇기')
    expect(kindLabel('STUDY_NOTE')).toBe('공부 메모')
    expect(kindLabel('UPDATE_NODE')).toBe('항목 고치기')
    expect(kindLabel('ARCHIVE_NODE')).toBe('항목 보관')
    expect(kindLabel('ARCHIVE_RELATIONSHIP')).toBe('관계 보관')
    expect(kindLabel('CREATE_CLAIM')).toBe('주장 만들기')
    expect(kindLabel('ONTOLOGY_CHANGE')).toBe('온톨로지 바꾸기')
  })

  it('항목 고치기와 보관은 타입 표시 이름과 이름이 든 문장이다', () => {
    expect(proposalSummary(testOntology, proposal('UPDATE_NODE', { nodeId: 'd1', expectedRevision: 1, properties: { title: '새 이름' } }))).toBe('투자 결정 「FLNC 첫 매수」의 속성을 고칩니다')
    expect(proposalSummary(testOntology, proposal('ARCHIVE_NODE', { nodeId: 'd1', expectedRevision: 1, reason: '중복' }))).toBe('투자 결정 「FLNC 첫 매수」를 보관합니다')
  })

  it('고칠 속성 목록에서 null 은 지우는 속성이다', () => {
    const p = proposal('UPDATE_NODE', { nodeId: 'd1', expectedRevision: 1, properties: { title: '새 이름', reason: null } })
    expect(updateNodeParts(p)).toEqual([
      { name: 'title', value: '새 이름' },
      { name: 'reason', value: null },
    ])
  })

  it('관계 보관은 보관할 관계의 문장이다', () => {
    const p = proposal('ARCHIVE_RELATIONSHIP', { relationshipId: 'r1', reason: '잘못 이음' })
    expect(proposalSummary(testOntology, p)).toBe('이 관계를 보관합니다: FLNC 첫 매수는 삼성전자에 대한 결정입니다')
    expect(proposalSummary(testOntology, proposal('ARCHIVE_RELATIONSHIP', { relationshipId: 'zz' }))).toBe('이 관계를 보관합니다: 찾을 수 없는 항목')
  })

  it('주장 만들기는 문장 틀에 주체와 대상 이름을 넣는다', () => {
    const p = proposal('CREATE_CLAIM', { predicate: 'SUPPLIES_TO', subjectId: 's1', objectId: 'b1', documentIds: [], description: '', evidenceText: '' })
    expect(proposalSummary(testOntology, p)).toBe('삼성전자가 전력 병목에 공급한다')
  })

  it('온톨로지 바꾸기는 기준 버전을 말한다', () => {
    expect(proposalSummary(testOntology, proposal('ONTOLOGY_CHANGE', { baseVersion: 3, yaml: 'a: 1' }))).toBe('버전 3을 바꾸는 제안입니다')
  })

  it('항목 만들기는 받침이 없는 이름 뒤에 를, 있는 이름 뒤에 을 붙인다', () => {
    const o = testOntology
    expect(proposalSummary(o, proposal('CREATE_NODE', { type: 'Decision', properties: { title: '추가 매입' } }))).toBe('투자 결정 「추가 매입」을 만듭니다')
    expect(proposalSummary(o, proposal('CREATE_NODE', { type: 'Decision', properties: { title: '추가 매수' } }))).toBe('투자 결정 「추가 매수」를 만듭니다')
  })

  it('관계 잇기는 관계 문장이다', () => {
    const p = proposal('CREATE_RELATIONSHIP', { type: 'HAS_DECISION', fromId: 's1', toId: 'd1' })
    expect(proposalSummary(testOntology, p)).toBe('FLNC 첫 매수는 삼성전자에 대한 결정입니다')
  })

  it('체결과 결정 잇기는 체결 수와 결정 이름이다', () => {
    const p = proposal('LINK_TRADE_DECISION', { tradeIds: ['t1', 't2'], decisionId: 'd1' })
    expect(proposalSummary(testOntology, p)).toBe('체결 2건을 「FLNC 첫 매수」에 잇습니다')
  })

  it('공부 메모는 항목 이름과 표시 이름이고 조사는 이름 끝소리로 고른다', () => {
    const p = proposal('STUDY_NOTE', { nodeId: 'c1', level: 'KNOWN', note: '' })
    expect(proposalSummary(testOntology, p)).toBe('「Apple」를 「이해함」으로 표시합니다')
    const withBatchim = proposal('STUDY_NOTE', { nodeId: 'b1', level: 'LEARNING', note: '' })
    expect(proposalSummary(testOntology, withBatchim)).toBe('「전력 병목」을 「공부 중」으로 표시합니다')
  })

  it('refs 에 없는 id 는 찾을 수 없는 항목이다', () => {
    const p = proposal('STUDY_NOTE', { nodeId: 'zz', level: 'UNSURE', note: '' })
    expect(nodeName(p, 'zz')).toBe('찾을 수 없는 항목')
    expect(proposalSummary(testOntology, p)).toContain('「찾을 수 없는 항목」')
  })

  it('이어 만들 관계 문장에 새 노드 이름을 넣는다', () => {
    const p = proposal('CREATE_NODE', { type: 'Decision', properties: { title: '추가 매수' }, links: [{ type: 'HAS_DECISION', fromId: 's1' }] })
    expect(proposalLinkSentences(testOntology, p)).toEqual(['추가 매수는 삼성전자에 대한 결정입니다'])
    expect(proposalLinkSentences(testOntology, proposal('STUDY_NOTE', {}))).toEqual([])
  })
})

describe('체결 줄', () => {
  it('날짜, 종목, 매수·매도, 수량, 금액 순서다', () => {
    expect(tradeLine(trade)).toBe(`${formatDate(trade.executedAt)} Fluence Energy 보통주 매수 10주 1,234.5 USD`)
  })

  it('이은 종목이 없으면 증권사 이름, 그것도 없으면 종목 코드를 쓴다', () => {
    expect(tradeLine({ ...trade, security: null })).toContain(' Fluence Energy 매수 ')
    expect(tradeLine({ ...trade, security: null, name: null })).toContain(' FLNC 매수 ')
  })
})

describe('승인할 수 있는 역할', () => {
  it('열람자는 공유 지식 제안을 승인할 수 없고 편집자는 있다', () => {
    const create = proposal('CREATE_NODE', {})
    expect(canAccept('VIEWER', create)).toBe(false)
    expect(canAccept('EDITOR', create)).toBe(true)
    expect(canAccept('ADMIN', create)).toBe(true)
  })

  it('온톨로지 변경은 관리자만 승인한다', () => {
    const change = proposal('ONTOLOGY_CHANGE', { baseVersion: 3 })
    expect(canAccept('VIEWER', change)).toBe(false)
    expect(canAccept('EDITOR', change)).toBe(false)
    expect(canAccept('ADMIN', change)).toBe(true)
  })

  it('기준 버전이 지금 버전과 다른 온톨로지 변경만 낡았다고 본다', () => {
    const change = proposal('ONTOLOGY_CHANGE', { baseVersion: 3 })
    expect(isStaleOntologyChange(change, 3)).toBe(false)
    expect(isStaleOntologyChange(change, 4)).toBe(true)
    expect(isStaleOntologyChange(proposal('CREATE_NODE', { baseVersion: 3 }), 4)).toBe(false)
  })

  it('열람자도 자기 이해 표시나 체결 잇기는 승인한다', () => {
    expect(canAccept('VIEWER', proposal('STUDY_NOTE', {}))).toBe(true)
    expect(canAccept('VIEWER', proposal('LINK_TRADE_DECISION', {}))).toBe(true)
  })
})

describe('고쳐서 승인 폼의 처음 값', () => {
  it('항목 만들기는 payload 의 속성을 입력칸 문자열로 담는다', () => {
    const p = proposal('CREATE_NODE', { type: 'Decision', properties: { title: '추가 매입' } })
    const defs = testOntology.nodeTypes.Decision.properties
    expect(editInitialValues(p, defs).values).toEqual({ title: '추가 매입', reason: '' })
  })

  it('payload 가 바뀌면 처음 값도 바뀐다', () => {
    const defs = testOntology.nodeTypes.Decision.properties
    const next = proposal('CREATE_NODE', { type: 'Decision', properties: { title: '고친 이름' } })
    expect(editInitialValues(next, defs).values.title).toBe('고친 이름')
  })

  it('공부 메모는 표시와 메모를 담고 없으면 잘 모름과 빈 메모다', () => {
    expect(editInitialValues(proposal('STUDY_NOTE', { nodeId: 'c1', level: 'LEARNING', note: '메모' }), undefined)).toMatchObject({ level: 'LEARNING', note: '메모' })
    expect(editInitialValues(proposal('STUDY_NOTE', {}), undefined)).toMatchObject({ level: 'UNSURE', note: '' })
  })
})
