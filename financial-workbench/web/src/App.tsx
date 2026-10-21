import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage, setUnauthorizedHandler } from './api/client'
import type { CurrentUser, Ontology } from './api/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { nodeFromSearch, rememberPendingNode, takePendingNode } from './lib/links'
import { AppContext, canEditRole, ROLE_LABEL } from './context'
import { LoginView } from './components/LoginView'
import { Workspace } from './components/Workspace'
import { ListTab } from './components/ListTab'
import { ReviewTab } from './components/ReviewTab'
import { ChangesTab } from './components/ChangesTab'
import { OntologyTab } from './components/OntologyTab'
import { UsersTab } from './components/UsersTab'
import { ErrorBoundary } from './components/ErrorBoundary'

export type TabKey = 'workspace' | 'list' | 'review' | 'changes' | 'ontology' | 'users'

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
  const [tab, setTab] = useState<TabKey>('workspace')
  // centerId 는 주변 그래프의 중심, selectedId 는 오른쪽 패널에 연 노드다.
  const [centerId, setCenterId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 같은 노드를 다시 골라도 그래프와 상세를 새로 읽게 한다.
  const [focusSeq, setFocusSeq] = useState(0)
  const [changesTargetId, setChangesTargetId] = useState('')
  // 링크(/?node=)로 들어왔을 때 로그인과 온톨로지 읽기가 끝난 뒤 열 항목이다.
  const pendingNodeRef = useRef<string | null>(null)

  useEffect(() => {
    // 로그인 화면을 거쳐도 남도록 먼저 탭 저장소에 둔다.
    const linked = nodeFromSearch(window.location.search)
    if (linked) rememberPendingNode(linked)
    setUnauthorizedHandler(() => {
      setAuth({ status: 'anonymous', notice: '세션이 만료되었습니다. 다시 로그인하세요.' })
    })
    api.auth
      .me()
      .then((user) => {
        // 로그인에 성공했으면 주소창의 ?login=denied 같은 흔적을 지운다.
        if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
        // StrictMode 에서 이 콜백이 두 번 돌아도 둘째 호출이 첫 값을 덮어쓰지 않게 한다.
        const pending = takePendingNode()
        if (pending) pendingNodeRef.current = pending
        setAuth({ status: 'signed-in', user })
      })
      .catch(() => setAuth({ status: 'anonymous' }))
    return () => setUnauthorizedHandler(null)
  }, [])

  const focusNode = useCallback((id: string | null) => {
    setCenterId(id)
    setSelectedId(id)
    setFocusSeq((n) => n + 1)
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
        const id = pendingNodeRef.current
        if (id) {
          pendingNodeRef.current = null
          focusNode(id)
          setTab('workspace')
        }
      })
      .catch((e) => setOntologyError(errorMessage(e)))
  }, [signedIn, focusNode])

  const openNode = useCallback(
    (id: string) => {
      focusNode(id)
      setTab('workspace')
    },
    [focusNode],
  )

  const openHistory = useCallback((id: string) => {
    setChangesTargetId(id)
    setTab('changes')
  }, [])

  const logout = async () => {
    try {
      await api.auth.logout()
    } catch {
      // 세션이 이미 끊겼어도 로그인 화면으로 간다.
    }
    focusNode(null)
    setOntology(null)
    setDenied(false)
    setTab('workspace')
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
  const activeTab: TabKey = visibleTabs.some((t) => t.key === tab) ? tab : 'workspace'

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
              onClick={() => setTab(t.key)}
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
            <ErrorBoundary resetKey={activeTab}>
              {activeTab === 'workspace' && (
                <Workspace
                  centerId={centerId}
                  focusSeq={focusSeq}
                  selectedId={selectedId}
                  onFocus={focusNode}
                  onSelect={setSelectedId}
                  onOpenHistory={openHistory}
                />
              )}
              {activeTab === 'list' && <ListTab onOpen={openNode} />}
              {activeTab === 'review' && <ReviewTab onOpen={openNode} />}
              {activeTab === 'changes' && (
                <ChangesTab targetId={changesTargetId} onTargetIdChange={setChangesTargetId} onOpen={openNode} />
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
