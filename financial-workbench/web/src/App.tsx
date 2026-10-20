import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage, setUnauthorizedHandler } from './api/client'
import type { Ontology, UserRef } from './api/types'
import { AppContext } from './context'
import { LoginView } from './components/LoginView'
import { Workspace } from './components/Workspace'
import { ListTab } from './components/ListTab'
import { ReviewTab } from './components/ReviewTab'
import { ChangesTab } from './components/ChangesTab'
import { OntologyTab } from './components/OntologyTab'

export type TabKey = 'workspace' | 'list' | 'review' | 'changes' | 'ontology'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'workspace', label: '작업 공간' },
  { key: 'list', label: '목록' },
  { key: 'review', label: '검토 대기' },
  { key: 'changes', label: '변경 이력' },
  { key: 'ontology', label: '온톨로지' },
]

type AuthState = { status: 'checking' } | { status: 'anonymous'; notice?: string } | { status: 'signed-in'; user: UserRef }

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' })
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
      .then((user) => setAuth({ status: 'signed-in', user }))
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
    setTab('workspace')
    setAuth({ status: 'anonymous' })
  }

  if (auth.status === 'checking') {
    return <div className="center-message" data-testid="app-loading">불러오는 중…</div>
  }
  if (auth.status === 'anonymous') {
    return <LoginView notice={auth.notice} onLoggedIn={(user) => setAuth({ status: 'signed-in', user })} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">금융 온톨로지 워크벤치</div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? 'tab active' : 'tab'}
              data-testid={`tab-${t.key}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="user-box">
          <span data-testid="current-user-name">{auth.user.displayName}</span>
          <span className="muted"> ({auth.user.username})</span>
          <button className="link-button" data-testid="logout-button" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>
      <main className="app-main">
        {ontologyError && <div className="error-box" data-testid="ontology-error">{ontologyError}</div>}
        {!ontology && !ontologyError && <div className="center-message">온톨로지를 불러오는 중…</div>}
        {ontology && (
          <AppContext.Provider value={{ user: auth.user, ontology }}>
            {tab === 'workspace' && (
              <Workspace
                centerId={centerId}
                focusSeq={focusSeq}
                selectedId={selectedId}
                onFocus={focusNode}
                onSelect={setSelectedId}
                onOpenHistory={openHistory}
              />
            )}
            {tab === 'list' && <ListTab onOpen={openNode} />}
            {tab === 'review' && <ReviewTab onOpen={openNode} />}
            {tab === 'changes' && (
              <ChangesTab targetId={changesTargetId} onTargetIdChange={setChangesTargetId} onOpen={openNode} />
            )}
            {tab === 'ontology' && <OntologyTab />}
          </AppContext.Provider>
        )}
      </main>
    </div>
  )
}
