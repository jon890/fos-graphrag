import type { NodeRef, Ontology, PropertyDef, PropertyValue, ProposalKind, ProposalView, Role, TradeView } from '../api/types'
import { formatDate } from './format'
import { initialFormValues, type FormValues } from './formValues'
import { claimSentenceParts, typeLabel, valueLabel, withEulReul, withJosa } from './labels'
import { relationSentence } from './relationSentence'
import { formatMoney, formatQuantity, sideLabel } from './trades'

// 제안 내용을 화면 문장으로 바꾸는 규칙. payload 의 모양은 docs/api-contract.md 「제안 내용」 이다.

const KIND_LABEL: Record<ProposalKind, string> = {
  CREATE_NODE: '항목 만들기',
  CREATE_RELATIONSHIP: '관계 잇기',
  LINK_TRADE_DECISION: '체결과 결정 잇기',
  STUDY_NOTE: '공부 메모',
  UPDATE_NODE: '항목 고치기',
  ARCHIVE_NODE: '항목 보관',
  ARCHIVE_RELATIONSHIP: '관계 보관',
  CREATE_CLAIM: '주장 만들기',
  ONTOLOGY_CHANGE: '온톨로지 바꾸기',
}

const ROLE_RANK: Record<Role, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 }

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

/** 「{타입 표시 이름} 「{이름}」」. 노드가 refs 에 없으면 「찾을 수 없는 항목」 만 쓴다 */
function typedNodeName(o: Ontology, p: ProposalView, id: string): string {
  const ref = p.refs.nodes[id]
  return ref ? `${typeLabel(o, ref.type)} 「${ref.label}」` : `「${MISSING}」`
}

/** CREATE_CLAIM 의 문장. 주장 종류의 문장 틀에 주체와 대상 이름을 넣는다 */
function claimSentence(o: Ontology, p: ProposalView): string {
  const names = { subject: nodeName(p, str(p.payload.subjectId)), object: nodeName(p, str(p.payload.objectId)) }
  return claimSentenceParts(o, str(p.payload.predicate), names)
    .map((part) => (part.kind === 'slot' ? names[part.slot] : part.text))
    .join('')
}

/** UPDATE_NODE 가 바꿀 속성. 값이 null 이면 그 속성을 지운다 */
export function updateNodeParts(p: ProposalView): { name: string; value: unknown }[] {
  const props = p.payload.properties
  return props && typeof props === 'object' ? Object.entries(props as Record<string, unknown>).map(([name, value]) => ({ name, value })) : []
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
    case 'UPDATE_NODE':
      return `${typedNodeName(o, p, str(p.payload.nodeId))}의 속성을 고칩니다`
    case 'ARCHIVE_NODE':
      return `${withEulReul(typedNodeName(o, p, str(p.payload.nodeId)))} 보관합니다`
    case 'ARCHIVE_RELATIONSHIP': {
      const r = p.refs.relationships?.[str(p.payload.relationshipId)]
      return `이 관계를 보관합니다: ${r ? relationSentence(o, r.type, r.from.label, r.to.label) : MISSING}`
    }
    case 'CREATE_CLAIM':
      return claimSentence(o, p)
    case 'ONTOLOGY_CHANGE':
      return `${withEulReul(`버전 ${p.payload.baseVersion}`)} 바꾸는 제안입니다`
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

/** 내 역할이 제안의 requiredRole 이상이어야 승인할 수 있다. 서버도 403 으로 막는다 */
export function canAccept(role: Role, p: ProposalView): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[p.requiredRole]
}

/** 온톨로지 변경 제안의 기준 버전이 지금 버전과 다르면 덮어쓰기가 되므로 승인할 수 없다 */
export function isStaleOntologyChange(p: ProposalView, currentVersion: number): boolean {
  return p.kind === 'ONTOLOGY_CHANGE' && p.payload.baseVersion !== currentVersion
}

/** 제안이 가리키는 체결 id. 항목 만들기의 tradeIds 와 체결과 결정 잇기의 tradeIds 다 */
export function payloadTradeIds(p: ProposalView): string[] {
  return strings(p.payload.tradeIds)
}

/** 근거 노드 참조. refs 에 없는 id 는 빠진다 */
export function evidenceNodes(p: ProposalView): NodeRef[] {
  return strings(p.evidence.nodeIds).flatMap((id) => (p.refs.nodes[id] ? [p.refs.nodes[id]] : []))
}

/** 「고쳐서 승인」 폼의 처음 값. 폼을 여는 시점의 payload 로 정한다 */
export function editInitialValues(p: ProposalView, defs: Record<string, PropertyDef> | undefined): { values: FormValues; level: string; note: string } {
  return {
    values: initialFormValues(defs ?? {}, createNodeParts(p).properties as Record<string, PropertyValue>),
    level: typeof p.payload.level === 'string' ? p.payload.level : 'UNSURE',
    note: typeof p.payload.note === 'string' ? p.payload.note : '',
  }
}
