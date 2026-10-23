import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api } from '../../api/client'
import type { CurrentUser, Ontology } from '../../api/types'
import { BROWSE_STEPS, clearProgress, shouldAutoStart, writeProgress, type GuideKind, type GuideStep } from '../../lib/guide'
import { parseWorkspaceQuery, TAB_PATHS, tabOfPath, workspaceSearch } from '../../routes'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { GuideBubble } from './GuideBubble'

export interface GuideContextValue {
  active: boolean
  kind: GuideKind
  step: number
  steps: GuideStep[]
  /** 끝낸 기록을 보내는 동안 참. 단추를 꺼 두 번 보내지 않게 한다 */
  busy: boolean
  message: string | null
  start: (kind: GuideKind) => void
  next: () => void
  finish: () => void
  skip: () => void
}

const noop = () => {}

// 가이드가 없는 렌더링(단위 테스트)에서도 쓰는 쪽이 그대로 동작하게 기본값을 둔다.
const GuideContext = createContext<GuideContextValue>({
  active: false,
  kind: 'browse',
  step: 0,
  steps: BROWSE_STEPS,
  busy: false,
  message: null,
  start: noop,
  next: noop,
  finish: noop,
  skip: noop,
})

export function useGuide(): GuideContextValue {
  return useContext(GuideContext)
}

const DONE_FAILED = '가이드를 끝냈다는 기록을 남기지 못했습니다. 다음 로그인 때 다시 열릴 수 있습니다.'

interface Props {
  user: CurrentUser
  onUserChange: (user: CurrentUser) => void
  /** 받기 전에는 null. 작업 공간이 그려진 뒤에 저절로 연다 */
  ontology: Ontology | null
  children: ReactNode
}

/** 첫 접속 가이드의 상태. 가이드가 바꾸는 주소는 모두 여기서만 바꾼다 */
export function GuideProvider({ user, onUserChange, ontology, children }: Props) {
  const [active, setActive] = useState(false)
  const [kind, setKind] = useState<GuideKind>('browse')
  const [step, setStep] = useState(0)
  // 같은 단계로 다시 들어가도(처음부터 다시 열기) 단계 진입 처리가 돌게 한다.
  const [entry, setEntry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const startedAtRef = useRef('')
  const busyRef = useRef(false)
  // 이 세션에서 저절로 연 적이 있는지. 끝낸 기록을 남기지 못했어도 다시 저절로 열지 않는다.
  const autoTriedRef = useRef(false)
  const wide = useMediaQuery('(min-width: 1024px)')
  const location = useLocation()
  const navigate = useNavigate()
  const locationRef = useRef(location)
  locationRef.current = location
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const onUserChangeRef = useRef(onUserChange)
  onUserChangeRef.current = onUserChange

  const steps = BROWSE_STEPS
  const tab = tabOfPath(location.pathname)

  const start = useCallback((k: GuideKind) => {
    if (busyRef.current) return
    if (locationRef.current.pathname !== TAB_PATHS.workspace) navigateRef.current(TAB_PATHS.workspace)
    startedAtRef.current = new Date().toISOString()
    setMessage(null)
    setKind(k)
    setStep(0)
    setEntry((n) => n + 1)
    setActive(true)
  }, [])

  const next = useCallback(() => {
    if (busyRef.current) return
    setStep((s) => Math.min(s + 1, steps.length - 1))
    setEntry((n) => n + 1)
  }, [steps.length])

  const end = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    clearProgress()
    try {
      const updated = await api.auth.guideDone()
      onUserChangeRef.current(updated)
    } catch {
      setMessage(DONE_FAILED)
    } finally {
      busyRef.current = false
      setBusy(false)
      setActive(false)
    }
  }, [])

  const finish = useCallback(() => void end(), [end])
  const skip = useCallback(() => void end(), [end])

  useEffect(() => {
    if (autoTriedRef.current || !shouldAutoStart(user) || tab !== 'workspace' || ontology === null) return
    autoTriedRef.current = true
    start('browse')
  }, [user, tab, ontology, start])

  useEffect(() => {
    if (active) writeProgress({ userId: user.id, kind, step, startedAt: startedAtRef.current, created: {} })
  }, [active, kind, step, user.id])

  // 단계에 들어갈 때 한 번만 좁은 화면의 탭을 옮긴다. 그 뒤 사용자가 다른 탭을 눌러도 되돌리지 않는다.
  useEffect(() => {
    if (!active || wide) return
    const pane = steps[step]?.pane
    const here = locationRef.current
    if (!pane || here.pathname !== TAB_PATHS.workspace) return
    const query = parseWorkspaceQuery(here.search)
    if (query.pane === pane) return
    navigateRef.current(TAB_PATHS.workspace + workspaceSearch({ ...query, pane }), { replace: true })
    // entry 가 바뀔 때만 돈다. 주소나 폭이 바뀌어도 다시 옮기지 않는다.
  }, [entry])

  const value = useMemo<GuideContextValue>(
    () => ({ active, kind, step, steps, busy, message, start, next, finish, skip }),
    [active, kind, step, steps, busy, message, start, next, finish, skip],
  )

  const current = steps[step]
  return (
    <GuideContext.Provider value={value}>
      {children}
      {active && current && (
        <GuideBubble
          step={current}
          index={step}
          total={steps.length}
          busy={busy}
          wide={wide}
          onNext={next}
          onFinish={finish}
          onSkip={skip}
        />
      )}
    </GuideContext.Provider>
  )
}

/** 머리글 아래의 가이드 안내. 끝낸 기록을 남기지 못했을 때 보인다 */
export function GuideMessage() {
  const { message } = useGuide()
  if (!message) return null
  return (
    <Alert role={undefined} variant="destructive" className="m-2 w-auto shrink-0" data-testid="guide-message">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/** 머리글의 「사용법」. 작업 공간으로 옮겨 가이드를 처음부터 연다 */
export function GuideOpenButton() {
  const { start, busy } = useGuide()
  return (
    <Button
      variant="link"
      size="sm"
      className="mr-2 h-auto px-1 py-0 text-blue-300"
      data-testid="guide-open"
      disabled={busy}
      onClick={() => start('browse')}
    >
      사용법
    </Button>
  )
}
