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

export interface NodeDetail {
  node: NodeView
  claim: ClaimView | null
  relationships: RelationshipView[]
  claims: ClaimView[]
  /** 서버 상한을 넘어 목록을 잘랐는지 */
  relationshipsTruncated: boolean
  claimsTruncated: boolean
  limits: { maxRelationships: number; maxClaims: number }
}

export interface Page<T> {
  items: T[]
  page: number
  size: number
  totalItems: number
  totalPages: number
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

export interface ChangeEventView {
  id: string
  at: string
  /** 첫 관리자를 만든 이력처럼 작성자가 사용자 목록에 없으면 null 이다. 서버 ChangeEventView.actor 는 UserRef? 다 */
  actor: UserRef | null
  action: ChangeAction
  targetId: string
  targetKind: 'NODE' | 'RELATIONSHIP' | 'USER'
  targetType: string
  targetLabel: string
  revision: number
  changes: Record<string, { before: unknown; after: unknown }> | null
  note: string | null
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

export interface NodeTypeDef {
  label?: string
  description: string
  labelProperty: string
  managedBy?: string
  /** 이름 옆에 함께 보일 속성. 같은 이름의 항목을 구분하게 한다 */
  hintProperties?: string[]
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
  nodeTypes: Record<string, NodeTypeDef>
  relationshipTypes: Record<string, RelationshipTypeDef>
  claimRelationships?: Record<string, ClaimRelationshipDef>
  claimPredicates: Record<string, ClaimPredicateDef>
  /** Claim 검토 상태(DRAFT 등)의 표시 이름 */
  reviewStatuses?: Record<string, LabelDef>
  /** 변경 이력 작업(CREATE 등)의 표시 이름 */
  changeActions?: Record<string, LabelDef>
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
