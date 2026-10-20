// docs/api-contract.md 의 응답 모양을 그대로 옮긴 타입이다.

export type ReviewStatus = 'DRAFT' | 'REVIEWED' | 'REJECTED'
export const REVIEW_STATUSES: ReviewStatus[] = ['DRAFT', 'REVIEWED', 'REJECTED']

export const NODE_TYPES = ['Company', 'Security', 'Sector', 'Document', 'Claim'] as const
export type NodeType = (typeof NODE_TYPES)[number]

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
  createdBy: UserRef
  updatedAt: string
  updatedBy: UserRef
  reviewStatus: ReviewStatus | null
}

export interface DocumentSummary {
  id: string
  title: string
  url: string
  publisher?: string | null
  documentType?: string | null
  publishedAt?: string | null
  collectedAt: string
  archived: boolean
}

export interface ClaimView extends NodeView {
  reviewStatus: ReviewStatus
  reviewedBy: UserRef | null
  reviewedAt: string | null
  reviewNote: string | null
  subject: NodeRef
  object: NodeRef
  documents: DocumentSummary[]
}

export interface RelationshipView {
  id: string
  type: string
  from: NodeRef
  to: NodeRef
  revision: number
  archived: boolean
  createdAt: string
  createdBy: UserRef
}

export interface NodeDetail {
  node: NodeView
  claim: ClaimView | null
  relationships: RelationshipView[]
  claims: ClaimView[]
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
  actor: UserRef
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

export interface PropertyDef {
  type: PropertyType
  required: boolean
  maxLength?: number
  values?: string[]
  min?: number
  max?: number
  description?: string
}

export interface NodeTypeDef {
  description: string
  labelProperty: string
  managedBy?: string
  properties: Record<string, PropertyDef>
}

export interface RelationshipTypeDef {
  description: string
  from: string[]
  to: string[]
}

export interface ClaimRelationshipDef {
  description: string
  from?: string[]
  to?: string[]
}

export interface ClaimPredicateDef {
  description: string
  subjectTypes: string[]
  objectTypes: string[]
}

export interface Ontology {
  schemaVersion: string
  nodeTypes: Record<string, NodeTypeDef>
  relationshipTypes: Record<string, RelationshipTypeDef>
  claimRelationships?: Record<string, ClaimRelationshipDef>
  claimPredicates: Record<string, ClaimPredicateDef>
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
