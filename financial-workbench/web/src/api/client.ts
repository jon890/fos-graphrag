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
  Page,
  PatchClaimRequest,
  PropertyValue,
  RelationshipView,
  ReviewStatus,
  UserRef,
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

// 쿠키를 읽지 못하는 환경을 대비해 /api/auth/csrf 본문의 토큰도 기억해 둔다.
let lastToken: string | null = null

function cookieToken(): string | null {
  return typeof document === 'undefined' ? null : readCookie(document.cookie, CSRF_COOKIE)
}

/** CSRF 토큰을 새로 받는다. 로그인, 로그아웃 뒤와 CSRF_REJECTED 재시도 때 부른다. */
export async function refreshCsrf(): Promise<string | null> {
  const res = await fetch('/api/auth/csrf', { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (res.ok) {
    try {
      const body = (await res.json()) as { token?: string }
      lastToken = body.token ?? null
    } catch {
      lastToken = null
    }
  }
  return cookieToken() ?? lastToken
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
  /** 401 이어도 로그인 화면으로 보내지 않는다. 로그인 요청과 최초 /me 확인에 쓴다. */
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
    me: () => request<UserRef>('GET', '/api/auth/me', undefined, { noAuthRedirect: true }),
    async login(username: string, password: string): Promise<UserRef> {
      await refreshCsrf()
      const user = await request<UserRef>('POST', '/api/auth/login', { username, password }, { noAuthRedirect: true })
      // 로그인하면 세션 ID 가 바뀌므로 CSRF 토큰도 다시 받는다.
      await refreshCsrf()
      return user
    },
    async logout(): Promise<void> {
      try {
        await request<void>('POST', '/api/auth/logout', undefined, { noAuthRedirect: true })
      } finally {
        lastToken = null
      }
    },
  },
  ontology: () => request<Ontology>('GET', '/api/ontology'),
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
    list: (p: { reviewStatus?: ReviewStatus; includeArchived?: boolean; page?: number; size?: number }) =>
      request<Page<ClaimView>>(
        'GET',
        `/api/claims${buildQuery({ reviewStatus: p.reviewStatus, includeArchived: p.includeArchived ? true : undefined, page: p.page, size: p.size })}`,
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
  },
}

/** 화면에 보일 오류 문장. 서버 message 를 그대로 쓴다. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return `요청을 처리하지 못했습니다: ${e.message}`
  return '알 수 없는 오류가 발생했습니다.'
}
