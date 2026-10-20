import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage, setUnauthorizedHandler } from './api/client'
import type { CurrentUser, Ontology } from './api/types'
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

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuth({ status: 'anonymous', notice: '세션이 만료되었습니다. 다시 로그인하세요.' })
    })
    api.auth
      .me()
      .then((user) => {
        // 로그인에 성공했으면 주소창의 ?login=denied 같은 흔적을 지운다.
        if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
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
      .then(setOntology)
      .catch((e) => setOntologyError(errorMessage(e)))
  }, [signedIn])

  const focusNode = useCallback((id: string | null) => {
    setCenterId(id)
    setSelectedId(id)
    setFocusSeq((n) => n + 1)
  }, [])

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
    return <div className="center-message" data-testid="app-loading">불러오는 중…</div>
  }
  if (auth.status === 'anonymous') {
    return <LoginView denied={denied} notice={auth.notice} />
  }

  const user = auth.user
  const canEdit = canEditRole(user.role)
  const visibleTabs = TABS.filter((t) => t.key !== 'users' || user.role === 'ADMIN')
  const activeTab: TabKey = visibleTabs.some((t) => t.key === tab) ? tab : 'workspace'

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">금융 온톨로지 워크벤치</div>
        <nav className="tabs" role="tablist">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              className={activeTab === t.key ? 'tab active' : 'tab'}
              data-testid={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="user-box">
          <span data-testid="current-user-name">{user.displayName}</span>
          <span className="muted" data-testid="current-user-email">
            {' '}
            {user.email}
          </span>
          <span className={`role-badge role-${user.role.toLowerCase()}`} data-testid="current-user-role" data-role={user.role}>
            {ROLE_LABEL[user.role] ?? user.role}
          </span>
          <button className="link-button" data-testid="logout-button" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="app-main">
        {ontologyError && <div className="error-box" data-testid="ontology-error">{ontologyError}</div>}
        {!ontology && !ontologyError && <div className="center-message">온톨로지를 불러오는 중…</div>}
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
