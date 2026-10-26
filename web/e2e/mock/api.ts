import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page, Request, Route } from '@playwright/test'

// 화면 테스트의 가짜 API. 서버 테스트가 남긴 응답 스냅샷(web/e2e/fixtures)을 요청에 맞춰 돌려준다.
// 서버 규칙을 두 벌 두지 않으려고 상태를 들고 있지 않는다. 쓰기는 기록만 하고 스냅샷이나 테스트가 준 응답을 돌려준다.

export type Role = 'VIEWER' | 'EDITOR' | 'ADMIN'

export type MockOptions = {
  /** 처음 로그인 상태. null 이면 로그아웃 상태다. 기본은 EDITOR */
  role?: Role | null
  /** 「Google 로 로그인」 을 눌렀을 때 들어갈 역할. 기본은 EDITOR */
  signedInRole?: Role
  /** denied 면 로그인을 허용하지 않고 `/?login=denied` 로 돌려보낸다 */
  loginResult?: 'success' | 'denied'
}

export interface RecordedRequest {
  method: string
  path: string
  /** URLSearchParams 로 다시 쓴 query. `?` 는 붙지 않는다 */
  query: string
  /** JSON 이면 읽은 값, 아니면 원문, 본문이 없으면 null */
  body: unknown
}

export interface MockResponse {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

export type MockHandler = (request: RecordedRequest) => MockResponse | Promise<MockResponse>

interface Snapshot {
  name: string
  request: { method: string; path: string; query: string }
  status: number
  body: unknown
  /** 같은 요청의 다른 응답이 있어 요청만 보고 주지 않는다. 테스트가 fixture 로 골라 on 에 넘긴다 */
  namedOnly?: boolean
}

interface Override {
  method: string
  path: string
  /** null 이면 query 와 상관없이 맞는다 */
  query: string | null
  response: MockResponse | MockHandler
}

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
const CSRF_COOKIE = 'XSRF-TOKEN'
const CSRF_HEADER = 'X-XSRF-TOKEN'
const CSRF_VALUE = 'mock-csrf'
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']
const LOGIN_PATH = '/oauth2/authorization/google'
/** 개발 서버가 API 서버로 넘기는 경로(web/vite.config.ts 의 proxy). 이 밖의 요청은 Vite 가 답한다 */
const API_PREFIXES = ['/api/', '/oauth2/', '/login/oauth2/', '/oauth/', '/.well-known/']

function normalizeQuery(query: string): string {
  return new URLSearchParams(query).toString()
}

function keyOf(method: string, pathname: string, query: string): string {
  return query ? `${method} ${pathname}?${query}` : `${method} ${pathname}`
}

let snapshotCache: { byKey: Map<string, Snapshot>; byName: Map<string, Snapshot> } | null = null

/**
 * 스냅샷을 한 번만 읽는다. 같은 요청을 가리키는 스냅샷이 둘이면 실패한다.
 * auth-me-* 는 로그인 규칙이 고르고, namedOnly 스냅샷은 테스트가 이름으로 고른다
 */
function loadSnapshots(): { byKey: Map<string, Snapshot>; byName: Map<string, Snapshot> } {
  if (snapshotCache) return snapshotCache
  const byKey = new Map<string, Snapshot>()
  const byName = new Map<string, Snapshot>()
  for (const file of fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const name = file.slice(0, -'.json'.length)
    const parsed = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8')) as Omit<Snapshot, 'name'>
    const snapshot: Snapshot = { name, ...parsed, request: { ...parsed.request, query: normalizeQuery(parsed.request.query) } }
    byName.set(name, snapshot)
    if (name.startsWith('auth-me-') || snapshot.namedOnly) continue
    const key = keyOf(snapshot.request.method, snapshot.request.path, snapshot.request.query)
    const other = byKey.get(key)
    if (other) throw new Error(`스냅샷 ${other.name} 과 ${name} 이 같은 요청(${key})을 가리킨다`)
    byKey.set(key, snapshot)
  }
  snapshotCache = { byKey, byName }
  return snapshotCache
}

function parseBody(request: Request): unknown {
  const raw = request.postData()
  if (raw === null || raw === '') return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function cookieValue(cookieHeader: string | undefined, name: string): string | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const eq = part.indexOf('=')
    if (eq >= 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

export class MockApi {
  readonly requests: RecordedRequest[] = []
  readonly missing: string[] = []
  private readonly overrides: Override[] = []
  private role: Role | null
  private readonly options: MockOptions

  constructor(
    private readonly page: Page,
    options: MockOptions,
  ) {
    this.options = options
    this.role = options.role === undefined ? 'EDITOR' : options.role
  }

  /**
   * 요청 하나의 응답을 덮어쓴다. 나중에 준 것이 먼저다.
   * path 에 `?` 가 있으면 query 까지 같아야 맞고, 없으면 query 와 상관없이 맞는다.
   */
  on(method: string, pathAndQuery: string, response: MockResponse | MockHandler): void {
    const q = pathAndQuery.indexOf('?')
    this.overrides.unshift({
      method: method.toUpperCase(),
      path: q < 0 ? pathAndQuery : pathAndQuery.slice(0, q),
      query: q < 0 ? null : normalizeQuery(pathAndQuery.slice(q + 1)),
      response,
    })
  }

  /** 스냅샷의 body 를 깊은 복사로 돌려준다. 고쳐서 on 에 넘긴다 */
  fixture<T = any>(name: string): T {
    const snapshot = loadSnapshots().byName.get(name)
    if (!snapshot) throw new Error(`스냅샷 ${name} 이 없다. web/e2e/fixtures 를 본다`)
    return structuredClone(snapshot.body) as T
  }

  /** 스냅샷이 답하는 요청(method, path, query). 화면을 스냅샷과 같은 주소로 열 때 쓴다 */
  fixtureRequest(name: string): Snapshot['request'] {
    const snapshot = loadSnapshots().byName.get(name)
    if (!snapshot) throw new Error(`스냅샷 ${name} 이 없다. web/e2e/fixtures 를 본다`)
    return { ...snapshot.request }
  }

  /** method 와 path(query 제외)가 같은 마지막 요청. 없으면 받은 요청 목록과 함께 실패한다 */
  lastRequest(method: string, pathname: string): RecordedRequest {
    const found = [...this.requests].reverse().find((r) => r.method === method.toUpperCase() && r.path === pathname)
    if (!found) {
      throw new Error(`${method} ${pathname} 요청을 받지 않았다. 받은 요청:\n${this.describeRequests()}`)
    }
    return found
  }

  assertNoMissing(): void {
    if (this.missing.length === 0) return
    throw new Error(
      `스냅샷에도 덮어쓰기에도 없는 요청이 있다:\n${this.missing.map((m) => `  ${m}`).join('\n')}\n받은 요청:\n${this.describeRequests()}`,
    )
  }

  private describeRequests(): string {
    return this.requests.map((r) => `  ${keyOf(r.method, r.path, r.query)}`).join('\n')
  }

  async install(): Promise<void> {
    loadSnapshots()
    await this.page.route(
      (url) => url.pathname === '/mcp' || API_PREFIXES.some((p) => url.pathname.startsWith(p)),
      (route) => this.handle(route),
    )
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request()
    const url = new URL(request.url())
    const recorded: RecordedRequest = {
      method: request.method(),
      path: url.pathname,
      query: normalizeQuery(url.search),
      body: parseBody(request),
    }
    this.requests.push(recorded)
    const response = await this.respond(recorded, request, url.origin)
    await route.fulfill({
      status: response.status ?? 200,
      headers: response.headers,
      contentType: response.body === undefined ? undefined : 'application/json',
      body: response.body === undefined ? undefined : JSON.stringify(response.body),
    })
  }

  private async respond(req: RecordedRequest, request: Request, origin: string): Promise<MockResponse> {
    if (this.csrfRequired(req)) {
      const headers = await request.allHeaders()
      const cookie = cookieValue(headers.cookie, CSRF_COOKIE)
      const header = headers[CSRF_HEADER.toLowerCase()]
      if (!cookie || header !== cookie) {
        return { status: 403, body: { code: 'CSRF_REJECTED', message: 'CSRF 토큰이 없거나 맞지 않습니다.', details: {} } }
      }
    }

    const override = this.overrides.find(
      (o) => o.method === req.method && o.path === req.path && (o.query === null || o.query === req.query),
    )
    if (override) return typeof override.response === 'function' ? override.response(req) : override.response

    if (req.method === 'GET' && req.path === '/api/auth/csrf') {
      await this.page.context().addCookies([{ name: CSRF_COOKIE, value: CSRF_VALUE, url: origin }])
      return { status: 200, body: { headerName: CSRF_HEADER, cookieName: CSRF_COOKIE } }
    }
    if (req.method === 'GET' && req.path === LOGIN_PATH) {
      if (this.options.loginResult === 'denied') return { status: 302, headers: { location: `${origin}/?login=denied` } }
      this.role = this.options.signedInRole ?? 'EDITOR'
      return { status: 302, headers: { location: `${origin}/` } }
    }
    if (req.method === 'GET' && req.path === '/api/auth/me') {
      const snapshot = loadSnapshots().byName.get(this.role === null ? 'auth-me-anonymous' : `auth-me-${this.role.toLowerCase()}`)!
      return { status: snapshot.status, body: structuredClone(snapshot.body) }
    }

    const snapshot = loadSnapshots().byKey.get(keyOf(req.method, req.path, req.query))
    if (snapshot) return { status: snapshot.status, body: structuredClone(snapshot.body) }

    const key = keyOf(req.method, req.path, req.query)
    this.missing.push(key)
    return { status: 501, body: { code: 'MOCK_MISSING', request: key } }
  }

  /** 서버가 CSRF 를 보는 요청. /api 밖(/oauth/token, /oauth/register)과 Bearer 전용 /api/v1 은 보지 않는다 */
  private csrfRequired(req: RecordedRequest): boolean {
    return WRITE_METHODS.includes(req.method) && req.path.startsWith('/api/') && !req.path.startsWith('/api/v1/')
  }
}

export async function mockApi(page: Page, options: MockOptions): Promise<MockApi> {
  const api = new MockApi(page, options)
  await api.install()
  return api
}
