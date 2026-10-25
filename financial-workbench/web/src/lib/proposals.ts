import type { NodeRef, Ontology, ProposalKind, ProposalView, TradeView } from '../api/types'
import { formatDate } from './format'
import { typeLabel, valueLabel, withEulReul, withJosa } from './labels'
import { relationSentence } from './relationSentence'
import { formatMoney, formatQuantity, sideLabel } from './trades'

// 제안 내용을 화면 문장으로 바꾸는 규칙. payload 의 모양은 docs/api-contract.md 「제안 내용」 이다.

const KIND_LABEL: Record<ProposalKind, string> = {
  CREATE_NODE: '항목 만들기',
  CREATE_RELATIONSHIP: '관계 잇기',
  LINK_TRADE_DECISION: '체결과 결정 잇기',
  STUDY_NOTE: '공부 메모',
}

const LEVEL_LABEL: Record<string, string> = { KNOWN: '이해함', UNSURE: '잘 모름', LEARNING: '공부 중' }

const MISSING = '찾을 수 없는 항목'

export function kindLabel(kind: ProposalKind): string {
  return KIND_LABEL[kind] ?? kind
}

/** 공부 메모의 표시 이름 */
export function levelLabel(level: string): string {
  return LEVEL_LABEL[level] ?? level
}

/** refs 에 없는 id 는 「찾을 수 없는 항목」 이다 */
export function nodeName(p: ProposalView, id: string): string {
  return p.refs.nodes[id]?.label ?? MISSING
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** CREATE_NODE 의 타입과 속성 */
export function createNodeParts(p: ProposalView): { type: string; properties: Record<string, unknown> } {
  const props = p.payload.properties
  return { type: str(p.payload.type), properties: props && typeof props === 'object' ? (props as Record<string, unknown>) : {} }
}

/** 새 노드의 이름. 타입의 labelProperty 값이고 선택지면 표시 이름이다 */
function newNodeName(o: Ontology, type: string, properties: Record<string, unknown>): string {
  const labelProperty = o.nodeTypes[type]?.labelProperty
  const name = labelProperty ? valueLabel(o, type, labelProperty, properties[labelProperty]) : ''
  return name || '이름 없음'
}

/** 제안 한 줄 요약. 합니다체다 */
export function proposalSummary(o: Ontology, p: ProposalView): string {
  switch (p.kind) {
    case 'CREATE_NODE': {
      const { type, properties } = createNodeParts(p)
      return `${withEulReul(`${typeLabel(o, type)} 「${newNodeName(o, type, properties)}」`)} 만듭니다`
    }
    case 'CREATE_RELATIONSHIP':
      return relationSentence(o, str(p.payload.type), nodeName(p, str(p.payload.fromId)), nodeName(p, str(p.payload.toId)))
    case 'LINK_TRADE_DECISION':
      return `체결 ${strings(p.payload.tradeIds).length}건을 「${nodeName(p, str(p.payload.decisionId))}」에 잇습니다`
    case 'STUDY_NOTE':
      return `${withEulReul(`「${nodeName(p, str(p.payload.nodeId))}」`)} ${withJosa(`「${levelLabel(str(p.payload.level))}」`, '으로(로)')} 표시합니다`
  }
}

/** 항목 만들기가 이어 만들 관계 문장. 새 노드의 이름을 한쪽 끝에 넣는다 */
export function proposalLinkSentences(o: Ontology, p: ProposalView): string[] {
  if (p.kind !== 'CREATE_NODE') return []
  const { type, properties } = createNodeParts(p)
  const created = newNodeName(o, type, properties)
  const links = Array.isArray(p.payload.links) ? (p.payload.links as Record<string, unknown>[]) : []
  return links.map((link) => {
    const relationship = str(link.type)
    return typeof link.fromId === 'string'
      ? relationSentence(o, relationship, nodeName(p, link.fromId), created)
      : relationSentence(o, relationship, created, nodeName(p, str(link.toId)))
  })
}

/** 「{날짜} {종목} {매수|매도} {수량}주 {금액} {통화}」 */
export function tradeLine(t: TradeView): string {
  const security = t.security?.label ?? t.name ?? t.ticker
  return `${formatDate(t.executedAt)} ${security} ${sideLabel(t.side)} ${formatQuantity(t.quantity)}주 ${formatMoney(t.amount, t.currency)}`
}

/** 열람자는 공유 지식을 만드는 제안을 승인할 수 없다. 서버도 403 으로 막는다 */
export function canAccept(role: string, p: ProposalView): boolean {
  return !p.requiresEditor || role === 'EDITOR' || role === 'ADMIN'
}

/** 제안이 가리키는 체결 id. 항목 만들기의 tradeIds 와 체결과 결정 잇기의 tradeIds 다 */
export function payloadTradeIds(p: ProposalView): string[] {
  return strings(p.payload.tradeIds)
}

/** 근거 노드 참조. refs 에 없는 id 는 빠진다 */
export function evidenceNodes(p: ProposalView): NodeRef[] {
  return strings(p.evidence.nodeIds).flatMap((id) => (p.refs.nodes[id] ? [p.refs.nodes[id]] : []))
}
