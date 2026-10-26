import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, errorMessage, setOntologyVersionListener, setUnauthorizedHandler } from './api/client'
import type { CurrentUser, NodeView, Ontology } from './api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { rememberReturnTo, takeReturnTo } from './lib/links'
import type { OntologyDraft } from './lib/ontologyEdit'
import {
  CONNECT_PATH,
  DEFAULT_WORKSPACE_QUERY,
  LANDING_PATH,
  TAB_PATHS,
  changesSearch,
  legacyRedirect,
  parseChangesQuery,
  parseTraceQuery,
  parseWorkspaceQuery,
  tabOfPath,
  traceSearch,
  workspaceSearch,
  type TabKey,
} from './routes'
import { AppContext, canEditRole, ROLE_LABEL } from './context'
import { LoginView } from './components/LoginView'
import { ConnectPage } from './components/connect/ConnectPage'
import { Workspace } from './components/Workspace'
import { ListTab } from './components/ListTab'
import { ReviewTab } from './components/ReviewTab'
import { ChangesTab } from './components/ChangesTab'
import { OntologyTab } from './components/ontology/OntologyTab'
import { UsersTab } from './components/UsersTab'
import { TokensTab } from './components/tokens/TokensTab'
import { ProposalCountProvider, useProposalCount } from './components/proposals/ProposalCountProvider'
import { ProposalsTab } from './components/proposals/ProposalsTab'
import { TradesTab } from './components/trades/TradesTab'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConceptMapTab } from './components/map/ConceptMapTab'
import { StudyTab } from './components/learning/StudyTab'
import { TracePage } from './components/learning/TracePage'
import { MoreMenu } from './components/header/MoreMenu'
import { TopTabs } from './components/header/TopTabs'
import { GuideMessage, GuideOpenButton, GuideProvider } from './components/guide/GuideProvider'
import { AddProvider } from './components/add/AddProvider'
import { AddMenu } from './components/add/AddMenu'

const ROLE_BADGE_CLASS: Record<string, string> = {
  ADMIN: 'bg-[#7c2d12] text-[#ffedd5]',
  EDITOR: 'bg-[#1e3a8a] text-[#dbeafe]',
  VIEWER: 'bg-[#374151] text-[#e5e7eb]',
}

/** /?login=denied 인지 본다. 서버가 허용하지 않은 로그인 뒤 여기로 돌려보낸다. */
function readLoginDenied(): boolean {
  return new URLSearchParams(window.location.search).get('login') === 'denied'
}

/** 만든 직후 상세 위에 보일 안내 */
type Flash = { id: string; text: string; kind?: 'success' | 'error' }

/** 대기 중인 제안 수를 배지로 붙인 「더보기」 메뉴 */
function MoreMenuWithCount(props: Omit<ComponentProps<typeof MoreMenu>, 'pendingCount'>) {
  return <MoreMenu {...props} pendingCount={useProposalCount().count} />
}

/** 동의 화면에서 로그인한 사람에게 보일 로그인 안내 */
const CONNECT_LOGIN_NOTICE = '앱을 연결하려면 먼저 Google 로 로그인하세요.'

type AuthState = { status: 'checking' } | { status: 'anonymous'; notice?: string } | { status: 'signed-in'; user: CurrentUser }

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' })
  const [denied, setDenied] = useState(readLoginDenied)
  const [ontology, setOntology] = useState<Ontology | null>(null)
  const [ontologyError, setOntologyError] = useState<string | null>(null)
  // 서버 응답 헤더로 안 가장 큰 온톨로지 버전. 들고 있는 ontology.version 보다 크면 다시 읽기 안내를 보인다.
  const [latestVersion, setLatestVersion] = useState(0)
  // 온톨로지 편집 초안. 탭을 옮겨도 남고 새로고침하면 사라진다.
  const [ontologyDraft, setOntologyDraft] = useState<OntologyDraft | null>(null)
  // 같은 노드를 다시 골라도 그래프와 상세를 새로 읽게 한다.
  const [focusSeq, setFocusSeq] = useState(0)
  // 항목을 만든 직후 상세 위에 보일 안내. 만든 곳이 작업 공간 밖일 수 있어 여기서 든다. 다른 항목을 고르면 사라진다.
  const [flash, setFlash] = useState<Flash | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  // useNavigate 가 돌려주는 함수는 경로가 바뀔 때마다 새로 만들어진다. effect 와 콜백은 ref 로 최신 값을 쓴다.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const locationRef = useRef(location)
  locationRef.current = location
  // 로그인 화면을 거쳐도 남은 주소다. 로그인과 온톨로지 읽기가 끝난 뒤 연다.
  const returnToRef = useRef<string | null>(null)
  // 로그인 뒤 동의 화면으로 옮기는 동안 참이다. 그 사이 `/` 가 `/map` 이 되거나 온톨로지를 읽거나 가이드가 열리지 않게 한다.
  const connectPendingRef = useRef(false)
  // 탭마다 마지막으로 보던 주소. 화면 메모리에만 두고 새로고침하면 사라진다.
  const lastUrlOf = useRef<Partial<Record<TabKey, string>>>({})

  const isConnect = location.pathname === CONNECT_PATH
  if (isConnect) {
    connectPendingRef.current = false
    // 「첫 화면으로」 를 눌렀을 때 다시 동의 화면으로 끌려가지 않게 한다.
    returnToRef.current = null
  }
  const tab = tabOfPath(location.pathname)
  const role = auth.status === 'signed-in' ? auth.user.role : null
  const openNodeId = tab === 'workspace' ? parseWorkspaceQuery(location.search).node : null

  useEffect(() => {
    if (flash && flash.id !== openNodeId) setFlash(null)
  }, [flash, openNodeId])

  useEffect(() => {
    // 로그인 화면을 거쳐도 남도록 먼저 탭 저장소에 둔다.
    const { pathname, search } = window.location
    rememberReturnTo(legacyRedirect(pathname, search) ?? pathname + search)
    setUnauthorizedHandler(() => {
      rememberReturnTo(window.location.pathname + window.location.search)
      setAuth({ status: 'anonymous', notice: '세션이 만료되었습니다. 다시 로그인하세요.' })
    })
    setOntologyVersionListener((version) => setLatestVersion((v) => Math.max(v, version)))
    api.auth
      .me()
      .then((user) => {
        // StrictMode 에서 이 콜백이 두 번 돌아도 둘째 호출이 첫 값을 덮어쓰지 않게 한다.
        const back = takeReturnTo()
        if (back === CONNECT_PATH || back?.startsWith(`${CONNECT_PATH}?`)) {
          // 동의 화면은 온톨로지를 기다리지 않고 바로 연다. 이미 그 주소면 옮길 필요가 없다.
          if (window.location.pathname !== CONNECT_PATH) {
            connectPendingRef.current = true
            navigateRef.current(back, { replace: true })
          }
        } else if (back) returnToRef.current = back
        setAuth({ status: 'signed-in', user })
      })
      .catch(() => setAuth({ status: 'anonymous', notice: window.location.pathname === CONNECT_PATH ? CONNECT_LOGIN_NOTICE : undefined }))
    return () => {
      setUnauthorizedHandler(null)
      setOntologyVersionListener(null)
    }
  }, [])

  const signedIn = auth.status === 'signed-in'
  useEffect(() => {
    if (!signedIn || isConnect || connectPendingRef.current) return
    setOntologyError(null)
    api.ontology
      .get()
      .then((o) => {
        setOntology(o)
        // 같은 콜백에서 열어야 Workspace 가 선택된 상태로 처음 그려져 좁은 화면의 첫 탭이 상세가 된다.
        const back = returnToRef.current
        if (back) {
          returnToRef.current = null
          navigateRef.current(back, { replace: true })
        }
      })
      .catch((e) => setOntologyError(errorMessage(e)))
  }, [signedIn, isConnect])

  /** 온톨로지만 다시 받는다. 주소와 열린 항목은 그대로다. 저장과 되돌리기가 끝났을 때도 부른다 */
  const reloadOntology = useCallback(async () => {
    const fresh = await api.ontology.get()
    setOntology(fresh)
    setLatestVersion((v) => Math.max(v, fresh.version))
  }, [])

  // 모르는 경로(/ 포함)와 권한 없는 경로는 기록을 쌓지 않고 바꿔 연다.
  useEffect(() => {
    if (!signedIn || isConnect || connectPendingRef.current) return
    if (tab === null) navigateRef.current(legacyRedirect(location.pathname, location.search) ?? LANDING_PATH, { replace: true })
    else if (tab === 'users' && role !== 'ADMIN') navigateRef.current(LANDING_PATH, { replace: true })
    else if (tab === 'ontology' && role !== 'ADMIN' && new URLSearchParams(location.search).has('view')) navigateRef.current(TAB_PATHS.ontology, { replace: true })
  }, [signedIn, isConnect, tab, role, location.pathname, location.search])

  // 고친 초안이 있으면 새로고침과 창 닫기 전에 브라우저가 떠날지 묻는다.
  const draftDirty = ontologyDraft?.dirty === true
  useEffect(() => {
    if (!draftDirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draftDirty])

  useEffect(() => {
    if (tab) lastUrlOf.current[tab] = location.pathname + location.search
  }, [tab, location.pathname, location.search])

  /** 같은 주소면 기록을 쌓지 않는다 */
  const go = useCallback((url: string, replace = false) => {
    const here = locationRef.current.pathname + locationRef.current.search
    navigateRef.current(url, { replace: replace || url === here })
  }, [])

  /** 작업 공간의 지금 query. 다른 탭에서 항목을 열어도 작업 공간의 검색 조건이 남게 한다 */
  const workspaceQueryNow = useCallback(() => {
    const here = locationRef.current
    if (here.pathname === TAB_PATHS.workspace) return parseWorkspaceQuery(here.search)
    const last = lastUrlOf.current.workspace
    return last ? parseWorkspaceQuery(new URL(last, 'http://localhost').search) : DEFAULT_WORKSPACE_QUERY
  }, [])

  /** 그래프 중심과 상세를 함께 바꾸며 작업 공간으로 간다 */
  const focusNode = useCallback(
    (id: string) => {
      go(TAB_PATHS.workspace + workspaceSearch({ ...workspaceQueryNow(), node: id, center: null, pane: 'detail' }))
      setFocusSeq((n) => n + 1)
    },
    [go, workspaceQueryNow],
  )

  /** 상세만 바꾼다. 그래프 중심은 그대로 둔다 */
  const selectNode = useCallback(
    (id: string) => {
      const q = workspaceQueryNow()
      go(TAB_PATHS.workspace + workspaceSearch({ ...q, node: id, center: q.center ?? q.node }))
    },
    [go, workspaceQueryNow],
  )

  /** 「＋ 추가」 로 만들었을 때. 안내를 채우고 작업 공간에서 새 항목을 연다 */
  const onCreated = useCallback(
    (node: NodeView, text: string, kind?: 'success' | 'error') => {
      setFlash({ id: node.id, text, kind })
      focusNode(node.id)
    },
    [focusNode],
  )

  /** 그 항목의 근거 따라가기를 연다. 상세, 개념 지도, 근거 따라가기 안에서 같은 주소를 쌓는다 */
  const openTrace = useCallback((id: string) => go(TAB_PATHS.trace + traceSearch({ node: id })), [go])

  const openHistory = useCallback(
    (id: string) => go(TAB_PATHS.changes + changesSearch({ target: id, actor: '', page: 0 })),
    [go],
  )

  const openTab = (key: TabKey) => {
    if (key === tab) return
    go(lastUrlOf.current[key] ?? TAB_PATHS[key])
  }

  const logout = async () => {
    try {
      await api.auth.logout()
    } catch {
      // 세션이 이미 끊겼어도 로그인 화면으로 간다.
    }
    lastUrlOf.current = {}
    navigateRef.current(LANDING_PATH, { replace: true })
    setOntology(null)
    setLatestVersion(0)
    setOntologyDraft(null)
    setDenied(false)
    setAuth({ status: 'anonymous' })
  }

  if (auth.status === 'checking') {
    return <div className="p-12 text-center text-muted-foreground" data-testid="app-loading">
        불러오는 중…
      </div>
  }
  if (auth.status === 'anonymous') {
    return <LoginView denied={denied} notice={auth.notice} />
  }

  // 동의 화면은 머리글, 탭, 첫 접속 가이드, 온톨로지 없이 이 화면만 그린다. 옮기는 동안에는 불러오는 중만 보인다.
  if (isConnect) return <ConnectPage />
  if (connectPendingRef.current) {
    return <div className="p-12 text-center text-muted-foreground" data-testid="app-loading">
        불러오는 중…
      </div>
  }

  const user = auth.user
  const canEdit = canEditRole(user.role)
  // 모르는 경로나 권한 없는 경로는 위 effect 가 바꿔 열 때까지 아무 화면도 그리지 않는다.
  // 열람자의 /review 는 메뉴에 없어도 주소로 열린다.
  const activeTab: TabKey | null = tab === 'users' && user.role !== 'ADMIN' ? null : tab
  const workspaceQuery = parseWorkspaceQuery(location.search)
  const changesQuery = parseChangesQuery(location.search)

  const header = (
    // 넓은 화면은 한 줄, 좁은 화면은 두 줄(제목과 사용자 상자 / 탭 셋과 더보기, 「＋ 추가」)이다
    <header className="flex shrink-0 flex-wrap items-center gap-x-2 bg-slate-900 px-2 text-slate-200 lg:h-12 lg:flex-nowrap lg:gap-x-6 lg:px-4">
      <div className="min-w-0 flex-1 truncate py-2 font-bold lg:flex-none lg:py-0">가치투자 온톨로지</div>
      <nav className="order-3 flex min-w-0 basis-full flex-nowrap items-center lg:order-none lg:flex-1 lg:basis-auto">
        <TopTabs activeTab={activeTab} onOpen={openTab} />
        {/* 「＋ 추가」 는 오른쪽 끝, 「더보기」 왼쪽이다. 온톨로지를 받기 전에는 그리지 않는다 */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {ontology && canEdit && (
            <AddMenu
              align="end"
              trigger={
                <Button size="sm" className="h-8 px-2.5" aria-label="추가" data-testid="add-open">
                  ＋<span className="hidden sm:inline"> 추가</span>
                </Button>
              }
            />
          )}
          <MoreMenuWithCount role={user.role} activeTab={activeTab} onOpen={openTab} />
        </div>
      </nav>
      <div className="flex shrink-0 items-center gap-1 text-sm">
        <GuideOpenButton />
        <span data-testid="current-user-name">{user.displayName}</span>
        <span className="hidden text-slate-400 lg:inline" data-testid="current-user-email">
          {' '}
          {user.email}
        </span>
        <Badge
          className={cn('ml-1.5 rounded-[3px] px-1.5 py-px', ROLE_BADGE_CLASS[user.role] ?? 'bg-slate-700 text-slate-200')}
          data-testid="current-user-role"
          data-role={user.role}
        >
          {ROLE_LABEL[user.role] ?? user.role}
        </Badge>
        <Button variant="link" size="sm" className="ml-2 h-auto px-1 py-0 text-blue-300" data-testid="logout-button" onClick={logout}>
          로그아웃
        </Button>
      </div>
    </header>
  )

  const main = (
    <main className="app-main min-h-0 flex-1 overflow-auto">
      {ontologyError && (
        <Alert role={undefined} variant="destructive" className="m-2 w-auto" data-testid="ontology-error">
          <AlertDescription>{ontologyError}</AlertDescription>
        </Alert>
      )}
      {ontology && latestVersion > ontology.version && (
        <Alert role={undefined} className="m-2 w-auto" data-testid="ontology-stale">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>온톨로지가 바뀌었습니다(버전 {latestVersion}). 다시 읽으면 바뀐 타입과 칸이 보입니다.</span>
            <Button type="button" size="sm" variant="outline" data-testid="ontology-reload" onClick={() => void reloadOntology().catch((e) => setOntologyError(errorMessage(e)))}>
              다시 읽기
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!ontology && !ontologyError && <div className="p-12 text-center text-muted-foreground">온톨로지를 불러오는 중…</div>}
      {ontology && (
        <ErrorBoundary resetKey={activeTab ?? undefined}>
          {activeTab === 'map' && <ConceptMapTab onOpenNode={focusNode} onTrace={openTrace} />}
          {activeTab === 'workspace' && (
            <Workspace
              centerId={workspaceQuery.center ?? workspaceQuery.node}
              focusSeq={focusSeq}
              selectedId={workspaceQuery.node}
              flash={flash}
              onFocus={focusNode}
              onSelect={selectNode}
              onOpenHistory={openHistory}
              onTrace={openTrace}
            />
          )}
          {activeTab === 'trace' && <TracePage nodeId={parseTraceQuery(location.search).node} onOpenNode={focusNode} onTrace={openTrace} />}
          {activeTab === 'list' && <ListTab onOpen={focusNode} />}
          {activeTab === 'study' && <StudyTab onOpenNode={focusNode} onTrace={openTrace} />}
          {activeTab === 'review' && <ReviewTab onOpen={focusNode} />}
          {activeTab === 'changes' && (
            <ChangesTab
              targetId={changesQuery.target}
              onTargetIdChange={(id) => go(TAB_PATHS.changes + changesSearch({ ...changesQuery, target: id, page: 0 }), true)}
              onOpen={focusNode}
            />
          )}
          {activeTab === 'ontology' && <OntologyTab draft={ontologyDraft} onDraftChange={setOntologyDraft} reloadOntology={reloadOntology} />}
          {activeTab === 'users' && user.role === 'ADMIN' && <UsersTab onOpenHistory={openHistory} />}
          {activeTab === 'tokens' && <TokensTab />}
          {activeTab === 'proposals' && <ProposalsTab onOpenNode={focusNode} />}
          {activeTab === 'trades' && <TradesTab onOpenNode={focusNode} />}
        </ErrorBoundary>
      )}
    </main>
  )

  const body = (
    <>
      {header}
      <GuideMessage />
      {main}
    </>
  )

  return (
    <ProposalCountProvider>
      <div className="flex h-screen flex-col">
        {/* 탭 단위 ErrorBoundary 바깥이라 탭을 옮겨도 가이드가 남는다. 로그인 화면이 되면 함께 사라진다 */}
        <GuideProvider user={user} onUserChange={(u) => setAuth({ status: 'signed-in', user: u })} ontology={ontology}>
          {/* 온톨로지를 받은 뒤에는 머리글의 「＋ 추가」 와 탭이 같은 만들기 창을 쓴다. 받기 전(불러오는 중, 오류)에는 Provider 없이 그린다 */}
          {ontology ? (
            <AppContext.Provider value={{ user, ontology, canEdit }}>
              <AddProvider onCreated={onCreated} onOpenNode={focusNode}>
                {body}
              </AddProvider>
            </AppContext.Provider>
          ) : (
            body
          )}
        </GuideProvider>
      </div>
    </ProposalCountProvider>
  )
}
