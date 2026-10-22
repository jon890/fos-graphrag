/** 화면 경로와 query 를 읽고 쓰는 순수 함수. 경로와 query 이름은 docs/flow.md 「주소와 뒤로가기」 의 표와 같다 */

export type TabKey = 'workspace' | 'list' | 'review' | 'changes' | 'ontology' | 'users'

export const TAB_PATHS: Record<TabKey, string> = {
  workspace: '/workspace',
  list: '/list',
  review: '/review',
  changes: '/changes',
  ontology: '/ontology',
  users: '/users',
}

/** 경로의 탭. 모르는 경로면 null */
export function tabOfPath(pathname: string): TabKey | null {
  const entry = (Object.entries(TAB_PATHS) as [TabKey, string][]).find(([, p]) => p === pathname)
  return entry ? entry[0] : null
}

export type WorkspacePane = 'search' | 'graph' | 'detail'

export interface WorkspaceQuery {
  node: string | null
  center: string | null
  pane: WorkspacePane | null
  q: string
  types: string[] | null
  status: string
  archived: boolean
  hops: number
  claimsAsNodes: boolean
}

export const DEFAULT_WORKSPACE_QUERY: WorkspaceQuery = {
  node: null,
  center: null,
  pane: null,
  q: '',
  types: null,
  status: '',
  archived: false,
  hops: 1,
  claimsAsNodes: false,
}

export interface ListQuery {
  type: string
  q: string
  archived: boolean
  page: number
}

export interface ReviewQuery {
  page: number
  minePage: number
}

export interface ChangesQuery {
  target: string
  actor: string
  page: number
}

/** 키마다 encodeURIComponent 로 만든다. URLSearchParams.toString() 은 공백을 + 로 바꾼다 */
function build(pairs: [string, string | null][]): string {
  const parts = pairs.filter((p): p is [string, string] => p[1] !== null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
  return parts.length ? `?${parts.join('&')}` : ''
}

function text(params: URLSearchParams, key: string): string {
  return params.get(key) ?? ''
}

function nonEmpty(params: URLSearchParams, key: string): string | null {
  const v = params.get(key)
  return v ? v : null
}

/** 0 이상의 정수만 받는다. 그 밖은 0 */
function pageOf(params: URLSearchParams, key: string): number {
  const v = params.get(key)
  return v !== null && /^\d+$/.test(v) ? Number(v) : 0
}

const PANES: WorkspacePane[] = ['search', 'graph', 'detail']

export function parseWorkspaceQuery(search: string): WorkspaceQuery {
  const p = new URLSearchParams(search)
  const pane = p.get('pane')
  const types = (p.get('types') ?? '').split(',').filter(Boolean)
  const hops = p.get('hops')
  return {
    node: nonEmpty(p, 'node'),
    center: nonEmpty(p, 'center'),
    pane: PANES.find((x) => x === pane) ?? null,
    q: text(p, 'q'),
    types: types.length ? types : null,
    status: text(p, 'status'),
    archived: p.get('archived') === '1',
    hops: hops === '2' ? 2 : 1,
    claimsAsNodes: p.get('claims') === 'nodes',
  }
}

/** 기본값(빈 q, null types, 빈 status, false, hops 1, false)은 쓰지 않는다. 키 순서는 표 순서다 */
export function workspaceSearch(q: WorkspaceQuery): string {
  return build([
    ['node', q.node || null],
    ['center', q.center || null],
    ['pane', q.pane],
    ['q', q.q || null],
    ['types', q.types && q.types.length ? q.types.join(',') : null],
    ['status', q.status || null],
    ['archived', q.archived ? '1' : null],
    ['hops', q.hops === 2 ? '2' : null],
    ['claims', q.claimsAsNodes ? 'nodes' : null],
  ])
}

export function parseListQuery(search: string): ListQuery {
  const p = new URLSearchParams(search)
  return { type: text(p, 'type'), q: text(p, 'q'), archived: p.get('archived') === '1', page: pageOf(p, 'page') }
}

export function listSearch(q: ListQuery): string {
  return build([
    ['type', q.type || null],
    ['q', q.q || null],
    ['archived', q.archived ? '1' : null],
    ['page', q.page > 0 ? String(q.page) : null],
  ])
}

export function parseReviewQuery(search: string): ReviewQuery {
  const p = new URLSearchParams(search)
  return { page: pageOf(p, 'page'), minePage: pageOf(p, 'minePage') }
}

export function reviewSearch(q: ReviewQuery): string {
  return build([
    ['page', q.page > 0 ? String(q.page) : null],
    ['minePage', q.minePage > 0 ? String(q.minePage) : null],
  ])
}

export function parseChangesQuery(search: string): ChangesQuery {
  const p = new URLSearchParams(search)
  return { target: text(p, 'target'), actor: text(p, 'actor'), page: pageOf(p, 'page') }
}

export function changesSearch(q: ChangesQuery): string {
  return build([
    ['target', q.target || null],
    ['actor', q.actor || null],
    ['page', q.page > 0 ? String(q.page) : null],
  ])
}

/** 옛 /?node=<id> 를 새 주소로. 해당 없으면 null */
export function legacyRedirect(pathname: string, search: string): string | null {
  if (pathname !== '/') return null
  const node = new URLSearchParams(search).get('node')
  if (!node) return null
  return `${TAB_PATHS.workspace}${workspaceSearch({ ...DEFAULT_WORKSPACE_QUERY, node, pane: 'detail' })}`
}

/** 로그인 뒤 돌아갈 주소로 받아도 되는가. ? 앞의 경로가 TAB_PATHS 의 값과 정확히 같을 때만 참이다 */
export function isSafeReturnTo(path: string): boolean {
  const pathname = path.split('?')[0]
  return Object.values(TAB_PATHS).includes(pathname)
}
