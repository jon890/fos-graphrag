import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, errorMessage, setUnauthorizedHandler } from './api/client'
import type { CurrentUser, Ontology } from './api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { rememberReturnTo, takeReturnTo } from './lib/links'
import {
  DEFAULT_WORKSPACE_QUERY,
  TAB_PATHS,
  changesSearch,
  legacyRedirect,
  parseChangesQuery,
  parseWorkspaceQuery,
  tabOfPath,
  workspaceSearch,
  type TabKey,
} from './routes'
import { AppContext, canEditRole, ROLE_LABEL } from './context'
import { LoginView } from './components/LoginView'
import { Workspace } from './components/Workspace'
import { ListTab } from './components/ListTab'
import { ReviewTab } from './components/ReviewTab'
import { ChangesTab } from './components/ChangesTab'
import { OntologyTab } from './components/OntologyTab'
import { UsersTab } from './components/UsersTab'
import { ErrorBoundary } from './components/ErrorBoundary'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'workspace', label: '작업 공간' },
  { key: 'list', label: '목록' },
  { key: 'review', label: '검토 대기' },
  { key: 'changes', label: '변경 이력' },
  { key: 'ontology', label: '온톨로지' },
  { key: 'users', label: '사용자' },
]

const ROLE_BADGE_CLASS: Record<string, string> = {
  ADMIN: 'bg-[#7c2d12] text-[#ffedd5]',
  EDITOR: 'bg-[#1e3a8a] text-[#dbeafe]',
  VIEWER: 'bg-[#374151] text-[#e5e7eb]',
}

/** /?login=denied 인지 본다. 서버가 허용하지 않은 로그인 뒤 여기로 돌려보낸다. */
function readLoginDenied(): boolean {
  return new URLSearchParams(window.location.search).get('login') === 'denied'
}

type AuthState = { status: 'checking' } | { status: 'anonymous'; notice?: string } | { status: 'signed-in'; user: CurrentUser }

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' })
  const [denied, setDenied] = useState(readLoginDenied)
  const [ontology, setOntology] = useState<Ontology | null>(null)
  const [ontologyError, setOntologyError] = useState<string | null>(null)
  // 같은 노드를 다시 골라도 그래프와 상세를 새로 읽게 한다.
  const [focusSeq, setFocusSeq] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  // useNavigate 가 돌려주는 함수는 경로가 바뀔 때마다 새로 만들어진다. effect 와 콜백은 ref 로 최신 값을 쓴다.
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const locationRef = useRef(location)
  locationRef.current = location
  // 로그인 화면을 거쳐도 남은 주소다. 로그인과 온톨로지 읽기가 끝난 뒤 연다.
  const returnToRef = useRef<string | null>(null)
  // 탭마다 마지막으로 보던 주소. 화면 메모리에만 두고 새로고침하면 사라진다.
  const lastUrlOf = useRef<Partial<Record<TabKey, string>>>({})

  const tab = tabOfPath(location.pathname)
  const role = auth.status === 'signed-in' ? auth.user.role : null

  useEffect(() => {
    // 로그인 화면을 거쳐도 남도록 먼저 탭 저장소에 둔다.
    const { pathname, search } = window.location
    rememberReturnTo(legacyRedirect(pathname, search) ?? pathname + search)
    setUnauthorizedHandler(() => {
      rememberReturnTo(window.location.pathname + window.location.search)
      setAuth({ status: 'anonymous', notice: '세션이 만료되었습니다. 다시 로그인하세요.' })
    })
    api.auth
      .me()
      .then((user) => {
        // StrictMode 에서 이 콜백이 두 번 돌아도 둘째 호출이 첫 값을 덮어쓰지 않게 한다.
        const back = takeReturnTo()
        if (back) returnToRef.current = back
        setAuth({ status: 'signed-in', user })
      })
      .catch(() => setAuth({ status: 'anonymous' }))
    return () => setUnauthorizedHandler(null)
  }, [])

  const signedIn = auth.status === 'signed-in'
  useEffect(() => {
    if (!signedIn) return
    setOntologyError(null)
    api
      .ontology()
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
  }, [signedIn])

  // 모르는 경로(/ 포함)와 권한 없는 경로는 기록을 쌓지 않고 바꿔 연다.
  useEffect(() => {
    if (!signedIn) return
    if (tab === null) navigateRef.current(legacyRedirect(location.pathname, location.search) ?? TAB_PATHS.workspace, { replace: true })
    else if (tab === 'users' && role !== 'ADMIN') navigateRef.current(TAB_PATHS.workspace, { replace: true })
  }, [signedIn, tab, role, location.pathname, location.search])

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
    navigateRef.current(TAB_PATHS.workspace, { replace: true })
    setOntology(null)
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

  const user = auth.user
  const canEdit = canEditRole(user.role)
  const visibleTabs = TABS.filter((t) => t.key !== 'users' || user.role === 'ADMIN')
  // 모르는 경로나 권한 없는 경로는 위 effect 가 바꿔 열 때까지 아무 화면도 그리지 않는다.
  const activeTab: TabKey | null = visibleTabs.some((t) => t.key === tab) ? tab : null
  const workspaceQuery = parseWorkspaceQuery(location.search)
  const changesQuery = parseChangesQuery(location.search)

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 bg-slate-900 px-2 text-slate-200 lg:h-12 lg:flex-nowrap lg:gap-x-6 lg:px-4">
        <div className="min-w-0 flex-1 truncate py-2 font-bold lg:flex-none lg:py-0">금융 온톨로지 워크벤치</div>
        <nav className="order-3 flex min-w-0 basis-full flex-nowrap gap-1 overflow-x-auto lg:order-none lg:flex-1 lg:basis-auto" role="tablist">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              className="shrink-0 cursor-pointer rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-2.5 py-2.5 text-sm text-slate-300 aria-selected:border-blue-400 aria-selected:text-white lg:px-3 lg:py-3"
              data-testid={`tab-${t.key}`}
              onClick={() => openTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 text-sm">
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
      <main className="app-main min-h-0 flex-1 overflow-auto">
        {ontologyError && (
          <Alert role={undefined} variant="destructive" className="m-2 w-auto" data-testid="ontology-error">
            <AlertDescription>{ontologyError}</AlertDescription>
          </Alert>
        )}
        {!ontology && !ontologyError && <div className="p-12 text-center text-muted-foreground">온톨로지를 불러오는 중…</div>}
        {ontology && (
          <AppContext.Provider value={{ user, ontology, canEdit }}>
            <ErrorBoundary resetKey={activeTab ?? undefined}>
              {activeTab === 'workspace' && (
                <Workspace
                  centerId={workspaceQuery.center ?? workspaceQuery.node}
                  focusSeq={focusSeq}
                  selectedId={workspaceQuery.node}
                  onFocus={focusNode}
                  onSelect={selectNode}
                  onOpenHistory={openHistory}
                />
              )}
              {activeTab === 'list' && <ListTab onOpen={focusNode} />}
              {activeTab === 'review' && <ReviewTab onOpen={focusNode} />}
              {activeTab === 'changes' && (
                <ChangesTab
                  targetId={changesQuery.target}
                  onTargetIdChange={(id) => go(TAB_PATHS.changes + changesSearch({ ...changesQuery, target: id, page: 0 }), true)}
                  onOpen={focusNode}
                />
              )}
              {activeTab === 'ontology' && <OntologyTab />}
              {activeTab === 'users' && user.role === 'ADMIN' && <UsersTab onOpenHistory={openHistory} />}
            </ErrorBoundary>
          </AppContext.Provider>
        )}
      </main>
    </div>
  )
}
