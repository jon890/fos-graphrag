// docs/api-contract.md 의 응답 모양을 그대로 옮긴 타입이다.

export type ReviewStatus = 'DRAFT' | 'REVIEWED' | 'REJECTED'
/** 온톨로지가 reviewStatuses 를 주지 않을 때만 쓰는 값 목록. 평소에는 ontology.reviewStatuses 의 키를 쓴다 */
export const REVIEW_STATUSES: ReviewStatus[] = ['DRAFT', 'REVIEWED', 'REJECTED']

export type PropertyValue = string | number | boolean | null

export interface UserRef {
  id: string
  email: string
  displayName: string
}

export type Role = 'VIEWER' | 'EDITOR' | 'ADMIN'
export const ROLES: Role[] = ['VIEWER', 'EDITOR', 'ADMIN']

/** GET /api/auth/me */
export interface CurrentUser extends UserRef {
  role: Role
  /** 첫 접속 가이드를 끝냈거나 건너뛴 시각. 아직이면 null */
  guideDoneAt: string | null
}

/** GET /api/users 의 한 행. ADMIN 만 받는다 */
export interface UserView {
  id: string
  email: string
  displayName: string
  role: Role
  enabled: boolean
  /** Google sub 이 묶였는지. 첫 로그인 전에는 false */
  linked: boolean
  revision: number
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

/** GET /api/me/tokens 의 한 행. 원문은 없고 끝 네 자리만 있다 */
export interface IntegrationTokenView {
  id: string
  name: string
  /** 조회만(READ)인지 조회와 기록(READ_WRITE)인지. 발급한 뒤에는 바꿀 수 없다 */
  scope: TokenScope
  last4: string
  createdAt: string
  lastUsedAt: string | null
}

export type TokenScope = 'READ' | 'READ_WRITE'

/** GET /api/oauth/authorize 의 200. 동의 화면이 보일 내용이다 */
export interface AuthorizationPreview {
  clientName: string
  /** 돌아갈 곳이 이 컴퓨터의 앱(LOOPBACK)인지 https 주소(HTTPS)인지 */
  redirectKind: 'LOOPBACK' | 'HTTPS'
  redirectHost: string
  /** 요청한 범위로 고를 수 있는 가장 넓은 값. READ 면 「조회만」 만 고를 수 있다 */
  requestedScope: TokenScope
  user: { displayName: string }
}

/** POST /api/oauth/authorize 의 본문. 인가 요청의 query 값에 결정을 더한다 */
export interface ConsentDecision {
  response_type?: string
  client_id?: string
  redirect_uri?: string
  code_challenge?: string
  code_challenge_method?: string
  state?: string
  scope?: string
  resource?: string
  decision: 'ALLOW' | 'DENY'
  /** ALLOW 일 때만 보낸다 */
  grantedScope?: TokenScope
}

/** GET /api/me/connections 의 한 행. OAuth 로 연결한 앱 */
export interface ConnectionView {
  id: string
  clientName: string
  scope: TokenScope
  createdAt: string
  lastUsedAt: string | null
}

/** POST /api/me/tokens 의 응답. token 원문은 이 응답에서만 볼 수 있다 */
export interface IssuedIntegrationToken extends IntegrationTokenView {
  token: string
}

export interface PatchUserRequest {
  expectedRevision: number
  role?: Role
  displayName?: string
  enabled?: boolean
}

export interface NodeRef {
  id: string
  type: string
  label: string
  archived: boolean
}

/** GET /api/me/trades 의 한 행. 내 체결만 온다 */
export interface TradeView {
  id: string
  broker: string
  externalId: string
  side: 'BUY' | 'SELL'
  market: string
  ticker: string
  name: string | null
  quantity: number
  price: number
  currency: string
  amount: number
  fee: number | null
  executedAt: string
  createdAt: string
  createdVia: string
  /** 이어진 종목. 없으면 null. 보관된 것도 담는다 */
  security: NodeRef | null
  decisions: NodeRef[]
}

export type ProposalKind = 'CREATE_NODE' | 'CREATE_RELATIONSHIP' | 'LINK_TRADE_DECISION' | 'STUDY_NOTE'
export type ProposalStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED'

/** GET /api/me/proposals 의 한 행. payload 의 모양은 kind 마다 다르다(docs/api-contract.md 「제안 내용」) */
export interface ProposalView {
  id: string
  kind: ProposalKind
  status: ProposalStatus
  payload: Record<string, unknown>
  rationale: string
  evidence: { nodeIds?: string[]; tradeIds?: string[]; urls?: string[] }
  createdAt: string
  createdVia: string
  token: { id: string | null; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  result: { nodeIds: string[]; relationshipIds: string[]; tradeIds: string[] } | null
  lastError: { code: string; message: string; at: string } | null
  /** 공유 지식을 만드는 제안이면 true. 열람자는 승인할 수 없다 */
  requiresEditor: boolean
  refs: { nodes: Record<string, NodeRef>; trades: Record<string, TradeView> }
}

/** GET /api/me/proposals/summary */
export interface ProposalSummary {
  pending: number
}

export interface NodeView {
  id: string
  type: string
  label: string
  properties: Record<string, PropertyValue>
  revision: number
  archived: boolean
  archivedAt: string | null
  createdAt: string
  /** 서버 DTO 가 UserRef? 다. 작성자 사용자를 찾지 못하면 null 이다 */
  createdBy: UserRef | null
  updatedAt: string
  updatedBy: UserRef | null
  reviewStatus: ReviewStatus | null
}

export interface DocumentSummary {
  id: string
  title: string
  url: string
  publisher?: string | null
  documentType?: string | null
  publishedAt?: string | null
  collectedAt: string | null
  archived: boolean
}

export interface ClaimView extends NodeView {
  reviewStatus: ReviewStatus
  reviewedBy: UserRef | null
  reviewedAt: string | null
  reviewNote: string | null
  subject: NodeRef | null
  object: NodeRef | null
  documents: DocumentSummary[]
  /** 마지막으로 내용을 고친 사람. 이 사람과 작성자는 검토할 수 없다 */
  contentUpdatedBy: UserRef | null
}

export interface RelationshipView {
  id: string
  type: string
  from: NodeRef
  to: NodeRef
  revision: number
  archived: boolean
  createdAt: string
  createdBy: UserRef | null
}

/** 노드가 쓰는 개념 하나. 노드에서 Concept 으로 나가는 보관되지 않은 관계의 끝이다 */
export interface ConceptRef {
  id: string
  label: string
  /** 개념의 한 줄 정의. 없으면 null */
  summary: string | null
  relationshipType: string
}

export interface NodeDetail {
  node: NodeView
  claim: ClaimView | null
  relationships: RelationshipView[]
  claims: ClaimView[]
  concepts: ConceptRef[]
  /** 서버 상한을 넘어 목록을 잘랐는지 */
  relationshipsTruncated: boolean
  claimsTruncated: boolean
  limits: { maxRelationships: number; maxClaims: number }
}

export type KnowledgeLevel = 'KNOWN' | 'UNSURE' | 'LEARNING'

/** 요청한 사람의 이해 표시 하나. 표시가 없으면 level, note, updatedAt 이 null 이다 */
export interface KnowledgeMark {
  nodeId: string
  level: KnowledgeLevel | null
  note: string | null
  updatedAt: string | null
}

/** 근거 따라가기 단계에 붙는 주장. label 은 「주체 → 대상 관계」 이름이다 */
export interface TraceClaim {
  id: string
  label: string
  predicate: string
  reviewStatus: ReviewStatus | null
}

/** 이 단계로 들어오는 관계가 하나도 없는 관계 종류와, 이을 만한 가까운 시작 노드 */
export interface TraceMissing {
  relationshipType: string
  candidates: NodeRef[]
}

export type TraceStatus = 'SUPPORTED' | 'PARTIAL' | 'MISSING'

/** 근거 따라가기의 한 단계. childId, relationshipId, relationshipType 은 한 단계 아래로 가는 처음 찾은 길이고 지금 항목은 null 이다 */
export interface TraceStep {
  node: NodeView
  depth: number
  childId: string | null
  relationshipId: string | null
  relationshipType: string | null
  status: TraceStatus
  documents: DocumentSummary[]
  claims: TraceClaim[]
  concepts: ConceptRef[]
  missing: TraceMissing[]
  /** 내 이해 표시. 없으면 null */
  knowledge: KnowledgeMark | null
}

/** 지금 항목에서 나가는 관계의 끝. 이 항목에 기대는 아래쪽 항목이다 */
export interface TraceDependent {
  node: NodeRef
  relationshipId: string
  relationshipType: string
}

/** GET /api/nodes/{id}/trace */
export interface TraceView {
  rootId: string
  steps: TraceStep[]
  dependents: TraceDependent[]
  truncated: boolean
  dependentsTruncated: boolean
  limits: { maxDepth: number; maxSteps: number; maxDependents: number; maxCandidates: number }
}

/** 공부 항목을 근거 단계로 가지는 투자 결정. depth 는 결정에서 이 항목까지의 단계 수다 */
export interface StudyContext {
  decision: NodeRef
  depth: number
}

/** GET /api/me/knowledge 의 한 행 */
export interface StudyItem {
  node: NodeRef
  level: KnowledgeLevel
  note: string | null
  updatedAt: string
  contexts: StudyContext[]
  documents: DocumentSummary[]
  concepts: ConceptRef[]
}

/** GET /api/me/knowledge/summary. counts 는 KNOWN, UNSURE, LEARNING 을 모두 담는다 */
export interface KnowledgeSummary {
  counts: Record<KnowledgeLevel, number>
  /** total 은 센 결정 수, understood 는 그 가운데 모든 단계를 KNOWN 으로 표시한 결정 수다 */
  decisions: { total: number; understood: number }
  decisionsTruncated: boolean
}

export interface Page<T> {
  items: T[]
  page: number
  size: number
  totalItems: number
  totalPages: number
}

/** GET /api/nodes/counts. 보관하지 않은 노드 수. 온톨로지의 모든 타입 키가 있고 없는 타입은 0 이다 */
export interface NodeCounts {
  counts: Record<string, number>
}

export interface GraphNode {
  id: string
  type: string
  label: string
  reviewStatus: ReviewStatus | null
  /** Claim 일 때만 값이 있다 */
  predicate?: string | null
}

export interface GraphEdge {
  id: string
  type: string
  source: string
  target: string
}

export interface GraphLimits {
  maxHops: number
  maxNodes: number
  maxRelationships: number
}

export interface GraphView {
  centerId: string
  hops: number
  nodes: GraphNode[]
  edges: GraphEdge[]
  truncated: boolean
  limits: GraphLimits
}

export type ChangeAction = 'CREATE' | 'UPDATE' | 'REVIEW' | 'ARCHIVE' | 'RESTORE'

/** 변경 이력 안 노드나 사용자 ID 를 지금 이름으로 바꾼 참조 */
export interface ChangeRef {
  id: string
  type: string
  label: string
  archived: boolean
}

export interface ChangeEventView {
  id: string
  at: string
  /** 첫 관리자를 만든 이력처럼 작성자가 사용자 목록에 없으면 null 이다. 서버 ChangeEventView.actor 는 UserRef? 다 */
  actor: UserRef | null
  action: ChangeAction
  targetId: string
  targetKind: 'NODE' | 'RELATIONSHIP' | 'USER' | 'ONTOLOGY'
  targetType: string
  targetLabel: string
  revision: number
  changes: Record<string, { before: unknown; after: unknown }> | null
  note: string | null
  /** changes 안 노드 ID 의 지금 이름 */
  refs: Record<string, ChangeRef>
}

export type PropertyType = 'string' | 'text' | 'url' | 'enum' | 'date' | 'datetime' | 'number' | 'integer' | 'boolean'

/** 온톨로지 YAML 의 표시 이름. 없으면 화면은 키를 그대로 보인다 */
export interface LabelDef {
  label: string
  description?: string
}

export interface PropertyDef {
  type: PropertyType
  /** 화면에 보일 이름 */
  label?: string
  required: boolean
  maxLength?: number
  values?: string[]
  /** enum 값의 표시 이름. 저장되는 값은 values 의 키 그대로다 */
  valueLabels?: Record<string, string>
  min?: number
  max?: number
  description?: string
  /** enum 값의 예전 표기. 서버가 시작할 때 쓰고 화면은 쓰지 않는다 */
  valueAliases?: Record<string, string[]>
}

/** 그래프 노드와 배지의 표시. shape 는 Cytoscape 노드 모양 이름이다 */
export interface NodeDisplayDef {
  color?: string | null
  shape?: string | null
}

export interface NodeTypeDef {
  label?: string
  description: string
  labelProperty: string
  managedBy?: string
  /** 이름 옆에 함께 보일 속성. 같은 이름의 항목을 구분하게 한다 */
  hintProperties?: string[]
  /** 검색이 이름 말고 함께 보는 속성 */
  searchProperties?: string[]
  display?: NodeDisplayDef | null
  properties: Record<string, PropertyDef>
}

export interface CreatePickerDef {
  label: string
  description?: string | null
}

export interface RelationshipTypeDef {
  label?: string | null
  description: string
  from: string[]
  to: string[]
  /** 관계 문장 틀. {from}, {to} 자리에 두 항목 이름이 들어간다 */
  sentence?: string | null
  /** 끝(to) 타입 만들기 폼에 시작(from) 노드를 고르는 칸 */
  createPicker?: CreatePickerDef | null
}

export interface ClaimRelationshipDef {
  label?: string | null
  description: string
  from?: string[]
  to?: string[]
}

export interface ClaimPredicateDef {
  label?: string | null
  description: string
  subjectTypes: string[]
  objectTypes: string[]
  /** 주장 문장 틀. {subject}, {object} 자리에 고르기 칸이 들어간다 */
  sentence?: string | null
}

export interface Ontology {
  schemaVersion: string
  /** 온톨로지 버전 번호. 저장할 때마다 1씩 늘어난다 */
  version: number
  versionCreatedAt: string
  /** 서버가 만든 버전이면 null */
  versionCreatedBy: UserRef | null
  nodeTypes: Record<string, NodeTypeDef>
  relationshipTypes: Record<string, RelationshipTypeDef>
  claimRelationships?: Record<string, ClaimRelationshipDef>
  claimPredicates: Record<string, ClaimPredicateDef>
  /** Claim 검토 상태(DRAFT 등)의 표시 이름 */
  reviewStatuses?: Record<string, LabelDef>
  /** 변경 이력 작업(CREATE 등)의 표시 이름 */
  changeActions?: Record<string, LabelDef>
  /** 변경 이력 키의 표시 이름 */
  changeFields?: Record<string, LabelDef>
}

/** 서버에 보내는 온톨로지 정의. Ontology 에서 버전 정보를 뺀 모양이다 */
export type OntologyDefinition = Omit<Ontology, 'version' | 'versionCreatedAt' | 'versionCreatedBy'>

export interface OntologyVersionSummary {
  version: number
  createdAt: string
  createdBy: UserRef | null
  note: string | null
  restoredFrom: number | null
}

export interface OntologyVersionDetail extends OntologyVersionSummary {
  yaml: string
}

export type OntologyImpactKind =
  | 'REMOVED_NODE_TYPE'
  | 'REMOVED_PROPERTY'
  | 'NOW_REQUIRED'
  | 'REMOVED_ENUM_VALUE'
  | 'CHANGED_PROPERTY_TYPE'
  | 'NARROWED_RANGE'
  | 'REMOVED_RELATIONSHIP_TYPE'
  | 'NARROWED_RELATIONSHIP_ENDS'
  | 'REMOVED_CLAIM_PREDICATE'
  | 'NARROWED_CLAIM_TYPES'

export interface OntologyImpact {
  path: string
  kind: OntologyImpactKind
  count: number
}

/** POST /api/ontology/preview 의 응답 */
export interface OntologyPreview {
  valid: boolean
  errors: string[]
  added: string[]
  removed: string[]
  changed: string[]
  impacts: OntologyImpact[]
  codeOwnedIgnored: string[]
  yaml: string | null
  definition: OntologyDefinition | null
}

/** 미리보기와 저장의 본문. yaml 과 definition 은 하나만 보낸다. note 와 confirm 은 저장만 읽는다 */
export interface OntologyEditRequest {
  baseVersion: number
  yaml?: string
  definition?: OntologyDefinition
  note?: string
  confirm?: boolean
}

export interface ApiErrorBody {
  code: string
  message: string
  details?: Record<string, unknown> | null
}

export interface CreateClaimRequest {
  predicate: string
  subjectId: string
  objectId: string
  documentIds: string[]
  description: string
  evidenceText: string
  validFrom: string | null
  validTo: string | null
  authoringMethod?: 'MANUAL' | 'AI'
  extractionConfidence?: number | null
}

export interface PatchClaimRequest {
  expectedRevision: number
  description?: string
  evidenceText?: string
  validFrom?: string | null
  validTo?: string | null
  extractionConfidence?: number | null
}
