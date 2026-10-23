import { CSRF_COOKIE, CSRF_HEADER, readCookie } from './csrf'
import type {
  ApiErrorBody,
  ChangeEventView,
  ClaimView,
  CreateClaimRequest,
  GraphView,
  NodeDetail,
  NodeView,
  Ontology,
  OntologyEditRequest,
  OntologyPreview,
  OntologyVersionDetail,
  OntologyVersionSummary,
  Page,
  PatchClaimRequest,
  PatchUserRequest,
  PropertyValue,
  RelationshipView,
  ReviewStatus,
  CurrentUser,
  Role,
  UserRef,
  UserView,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown> | null

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.details = body.details ?? null
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

let unauthorizedHandler: (() => void) | null = null
/** 세션이 끊겨 401 이 오면 부른다. App 이 로그인 화면으로 돌아가게 등록한다. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

let ontologyVersionListener: ((version: number) => void) | null = null
/** 모든 응답의 X-Ontology-Version 을 받는다. App 이 최신 버전 번호를 알아 「다시 읽기」 안내를 보이게 등록한다. */
export function setOntologyVersionListener(listener: ((version: number) => void) | null): void {
  ontologyVersionListener = listener
}

function reportOntologyVersion(res: Response): void {
  const header = res.headers.get('X-Ontology-Version')
  if (header !== null && /^\d+$/.test(header)) ontologyVersionListener?.(Number(header))
}

function cookieToken(): string | null {
  return typeof document === 'undefined' ? null : readCookie(document.cookie, CSRF_COOKIE)
}

/** CSRF 쿠키를 새로 받는다. 토큰 값은 응답 본문이 아니라 XSRF-TOKEN 쿠키에서 읽는다. */
export async function refreshCsrf(): Promise<string | null> {
  await fetch('/api/auth/csrf', { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } })
  return cookieToken()
}

async function csrfToken(): Promise<string | null> {
  return cookieToken() ?? (await refreshCsrf())
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody = { code: `HTTP_${res.status}`, message: `요청이 실패했습니다 (HTTP ${res.status}).` }
  try {
    const parsed = (await res.json()) as Partial<ApiErrorBody>
    if (parsed && typeof parsed.code === 'string') {
      body = { code: parsed.code, message: parsed.message ?? body.message, details: parsed.details ?? null }
    }
  } catch {
    // 본문이 JSON 이 아니면 기본 메시지를 쓴다.
  }
  return new ApiError(res.status, body)
}

interface RequestOptions {
  /** 401 이어도 로그인 화면으로 보내지 않는다. 최초 /me 확인과 로그아웃에 쓴다. */
  noAuthRedirect?: boolean
}

async function request<T>(method: Method, path: string, body?: unknown, options: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') {
    const token = await csrfToken()
    if (token) headers[CSRF_HEADER] = token
  }
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  reportOntologyVersion(res)
  if (res.ok) {
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
  const error = await toApiError(res)
  if (error.code === 'CSRF_REJECTED' && !retried) {
    // 토큰이 만료됐거나 세션이 바뀌었다. 한 번만 새 토큰으로 다시 보낸다.
    await refreshCsrf()
    return request<T>(method, path, body, options, true)
  }
  if (res.status === 401 && !options.noAuthRedirect) unauthorizedHandler?.()
  throw error
}

export function buildQuery(params: Record<string, string | number | boolean | null | undefined | string[]>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(','))
    } else {
      search.set(key, String(value))
    }
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

const enc = encodeURIComponent

/** 최신 버전을 파일로 받는 주소. 링크의 href 로 쓴다 */
export const ONTOLOGY_EXPORT_URL = '/api/ontology/export'

/** 그 버전의 YAML 을 financial-ontology-v<n>.yaml 로 내려받는다 */
export async function ontologyVersionDownload(n: number): Promise<void> {
  const detail = await api.ontology.version(n)
  const url = URL.createObjectURL(new Blob([detail.yaml], { type: 'application/yaml;charset=UTF-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `financial-ontology-v${n}.yaml`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const GOOGLE_LOGIN_PATH = '/oauth2/authorization/google'

export interface NodeSearchParams {
  q?: string
  types?: string[]
  reviewStatus?: ReviewStatus | ''
  includeArchived?: boolean
  page?: number
  size?: number
}

export interface NeighborhoodParams {
  id: string
  hops?: number
  types?: string[]
  reviewStatus?: ReviewStatus | ''
}

export const api = {
  auth: {
    me: () => request<CurrentUser>('GET', '/api/auth/me', undefined, { noAuthRedirect: true }),
    /** Google OIDC 로그인. fetch 가 아니라 브라우저 이동이다. 서버가 끝나면 / 나 /?login=denied 로 돌려보낸다. */
    startGoogleLogin(): void {
      window.location.href = GOOGLE_LOGIN_PATH
    },
    logout: () => request<void>('POST', '/api/auth/logout', undefined, { noAuthRedirect: true }),
    /** 첫 접속 가이드를 끝냈다고 기록한다. 이미 기록돼 있으면 서버가 처음 값을 그대로 둔다 */
    guideDone: () => request<CurrentUser>('POST', '/api/auth/me/guide-done'),
  },
  users: {
    list: () => request<UserView[]>('GET', '/api/users'),
    create: (email: string, displayName: string, role: Role) =>
      request<UserView>('POST', '/api/users', { email, displayName, role }),
    patch: (id: string, body: PatchUserRequest) => request<UserView>('PATCH', `/api/users/${enc(id)}`, body),
  },
  ontology: {
    get: () => request<Ontology>('GET', '/api/ontology'),
    versions: (page: number) => request<Page<OntologyVersionSummary>>('GET', `/api/ontology/versions${buildQuery({ page, size: 20 })}`),
    version: (n: number) => request<OntologyVersionDetail>('GET', `/api/ontology/versions/${n}`),
    preview: (body: OntologyEditRequest) => request<OntologyPreview>('POST', '/api/ontology/preview', body),
    save: (body: OntologyEditRequest) => request<OntologyVersionSummary>('POST', '/api/ontology/versions', body),
    restore: (n: number, body: { baseVersion: number; note?: string; confirm?: boolean }) =>
      request<OntologyVersionSummary>('POST', `/api/ontology/versions/${n}/restore`, body),
  },
  nodes: {
    search: (p: NodeSearchParams) =>
      request<Page<NodeView>>(
        'GET',
        `/api/nodes${buildQuery({
          q: p.q?.trim(),
          types: p.types,
          reviewStatus: p.reviewStatus,
          includeArchived: p.includeArchived ? true : undefined,
          page: p.page,
          size: p.size,
        })}`,
      ),
    get: (id: string) => request<NodeDetail>('GET', `/api/nodes/${enc(id)}`),
    create: (type: string, properties: Record<string, PropertyValue>) =>
      request<NodeView>('POST', '/api/nodes', { type, properties }),
    patch: (id: string, expectedRevision: number, properties: Record<string, PropertyValue>) =>
      request<NodeView>('PATCH', `/api/nodes/${enc(id)}`, { expectedRevision, properties }),
    archive: (id: string, expectedRevision: number, reason?: string) =>
      request<NodeView>('POST', `/api/nodes/${enc(id)}/archive`, { expectedRevision, reason: reason || null }),
    restore: (id: string, expectedRevision: number) =>
      request<NodeView>('POST', `/api/nodes/${enc(id)}/restore`, { expectedRevision }),
  },
  relationships: {
    create: (type: string, fromId: string, toId: string) =>
      request<RelationshipView>('POST', '/api/relationships', { type, fromId, toId }),
    archive: (id: string, expectedRevision: number, reason?: string) =>
      request<RelationshipView>('POST', `/api/relationships/${enc(id)}/archive`, { expectedRevision, reason: reason || null }),
    restore: (id: string, expectedRevision: number) =>
      request<RelationshipView>('POST', `/api/relationships/${enc(id)}/restore`, { expectedRevision }),
  },
  claims: {
    list: (p: { reviewStatus?: ReviewStatus; includeArchived?: boolean; scope?: 'reviewable' | 'mine'; page?: number; size?: number }) =>
      request<Page<ClaimView>>(
        'GET',
        `/api/claims${buildQuery({ reviewStatus: p.reviewStatus, includeArchived: p.includeArchived ? true : undefined, scope: p.scope, page: p.page, size: p.size })}`,
      ),
    get: (id: string) => request<ClaimView>('GET', `/api/claims/${enc(id)}`),
    create: (body: CreateClaimRequest) => request<ClaimView>('POST', '/api/claims', body),
    patch: (id: string, body: PatchClaimRequest) => request<ClaimView>('PATCH', `/api/claims/${enc(id)}`, body),
    review: (id: string, expectedRevision: number, status: ReviewStatus, note: string | null) =>
      request<ClaimView>('POST', `/api/claims/${enc(id)}/review`, { expectedRevision, status, note }),
  },
  graph: {
    neighborhood: (p: NeighborhoodParams) =>
      request<GraphView>(
        'GET',
        `/api/graph/neighborhood${buildQuery({ id: p.id, hops: p.hops, types: p.types, reviewStatus: p.reviewStatus })}`,
      ),
  },
  changes: {
    list: (p: { targetId?: string; actor?: string; page?: number; size?: number }) =>
      request<Page<ChangeEventView>>(
        'GET',
        `/api/changes${buildQuery({ targetId: p.targetId?.trim(), actor: p.actor?.trim(), page: p.page, size: p.size })}`,
      ),
    actors: () => request<UserRef[]>('GET', '/api/changes/actors'),
  },
}

/** 화면에 보일 오류 문장. 서버 message 를 그대로 쓴다. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return `요청을 처리하지 못했습니다: ${e.message}`
  return '알 수 없는 오류가 발생했습니다.'
}
