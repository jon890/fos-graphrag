/** 화면 경로와 query 를 읽고 쓰는 순수 함수. 경로와 query 이름은 docs/flow.md 「주소와 뒤로가기」 의 표와 같다 */

export type TabKey = 'map' | 'workspace' | 'list' | 'study' | 'trace' | 'review' | 'changes' | 'ontology' | 'users' | 'tokens' | 'proposals' | 'trades'

export const TAB_PATHS: Record<TabKey, string> = {
  map: '/map',
  workspace: '/workspace',
  list: '/list',
  study: '/study',
  /** 근거 따라가기. 탭과 더보기 메뉴에는 없고 상세, 개념 지도, 공부 목록에서 연다 */
  trace: '/trace',
  review: '/review',
  changes: '/changes',
  ontology: '/ontology',
  users: '/users',
  tokens: '/tokens',
  proposals: '/proposals',
  trades: '/trades',
}

/** 앱 연결 동의 화면. 탭이 아니라 메뉴에 없고, 서버의 /oauth/authorize 가 인가 요청의 query 를 붙여 보낸다 */
export const CONNECT_PATH = '/connect'

/** 첫 화면. `/`, 모르는 경로, 권한 없는 화면 경로를 여기로 바꿔 연다 */
export const LANDING_PATH = TAB_PATHS.map

/** 머리글에 탭으로 늘 보이는 화면 */
export const TOP_TABS: TabKey[] = ['map', 'workspace', 'list', 'study']

/** 「더보기」 메뉴의 화면. 검토 대기는 EDITOR 와 ADMIN, 사용자는 ADMIN 에게만 보이고 연동과 제안, 내 체결은 모든 역할에 보인다 */
export function moreItems(role: string): TabKey[] {
  const items: TabKey[] = ['changes', 'ontology']
  if (role === 'EDITOR' || role === 'ADMIN') items.push('review')
  if (role === 'ADMIN') items.push('users')
  items.push('tokens', 'proposals', 'trades')
  return items
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

export interface MapQuery {
  type: string
}

export interface ListQuery {
  type: string
  q: string
  archived: boolean
  page: number
}

/** 공부 목록에서 보이는 표시. null 이면 UNSURE 와 LEARNING 둘 다다 */
export type StudyLevel = 'UNSURE' | 'LEARNING'

export interface StudyQuery {
  level: StudyLevel | null
  page: number
}

export interface TraceQuery {
  node: string | null
}

export interface ReviewQuery {
  page: number
  minePage: number
}

export type ProposalsStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED'

export interface ProposalsQuery {
  status: ProposalsStatus
  page: number
}

export interface TradesQuery {
  ticker: string
  page: number
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

export function parseMapQuery(search: string): MapQuery {
  return { type: text(new URLSearchParams(search), 'type') }
}

export function mapSearch(q: MapQuery): string {
  return build([['type', q.type || null]])
}

export function parseTraceQuery(search: string): TraceQuery {
  return { node: nonEmpty(new URLSearchParams(search), 'node') }
}

export function traceSearch(q: TraceQuery): string {
  return build([['node', q.node || null]])
}

const STUDY_LEVELS: StudyLevel[] = ['UNSURE', 'LEARNING']

/** 모르는 level 은 null(둘 다)이다 */
export function parseStudyQuery(search: string): StudyQuery {
  const p = new URLSearchParams(search)
  const level = p.get('level')
  return { level: STUDY_LEVELS.find((x) => x === level) ?? null, page: pageOf(p, 'page') }
}

export function studySearch(q: StudyQuery): string {
  return build([
    ['level', q.level],
    ['page', q.page > 0 ? String(q.page) : null],
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

const PROPOSAL_STATUSES: ProposalsStatus[] = ['PENDING', 'ACCEPTED', 'REJECTED']

/** 없거나 모르는 status 는 PENDING(대기)이다 */
export function parseProposalsQuery(search: string): ProposalsQuery {
  const p = new URLSearchParams(search)
  const status = p.get('status')
  return { status: PROPOSAL_STATUSES.find((x) => x === status) ?? 'PENDING', page: pageOf(p, 'page') }
}

/** 기본값(PENDING, 0쪽)은 쓰지 않는다 */
export function proposalsSearch(q: ProposalsQuery): string {
  return build([
    ['status', q.status === 'PENDING' ? null : q.status],
    ['page', q.page > 0 ? String(q.page) : null],
  ])
}

export function parseTradesQuery(search: string): TradesQuery {
  const p = new URLSearchParams(search)
  return { ticker: text(p, 'ticker'), page: pageOf(p, 'page') }
}

export function tradesSearch(q: TradesQuery): string {
  return build([
    ['ticker', q.ticker || null],
    ['page', q.page > 0 ? String(q.page) : null],
  ])
}

export interface OntologyQuery {
  view?: 'yaml' | 'history'
  version?: number
}

export function parseOntologyQuery(search: string): OntologyQuery {
  const p = new URLSearchParams(search)
  const view = p.get('view')
  const version = p.get('version')
  const q: OntologyQuery = {}
  // 예전 주소 view=form 은 yaml 로 읽는다
  if (view === 'form' || view === 'yaml') q.view = 'yaml'
  else if (view === 'history') q.view = 'history'
  if (version !== null && /^\d+$/.test(version)) q.version = Number(version)
  return q
}

export function ontologySearch(q: OntologyQuery): string {
  return build([
    ['view', q.view ?? null],
    ['version', q.version !== undefined ? String(q.version) : null],
  ])
}

/** 옛 /?node=<id> 를 새 주소로. 해당 없으면 null */
export function legacyRedirect(pathname: string, search: string): string | null {
  if (pathname !== '/') return null
  const node = new URLSearchParams(search).get('node')
  if (!node) return null
  return `${TAB_PATHS.workspace}${workspaceSearch({ ...DEFAULT_WORKSPACE_QUERY, node, pane: 'detail' })}`
}

/** 로그인 뒤 돌아갈 주소로 받아도 되는가. ? 앞의 경로가 TAB_PATHS 의 값이나 CONNECT_PATH 와 정확히 같을 때만 참이다 */
export function isSafeReturnTo(path: string): boolean {
  const pathname = path.split('?')[0]
  return pathname === CONNECT_PATH || Object.values(TAB_PATHS).includes(pathname)
}
