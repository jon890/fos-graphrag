import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, ApiError } from '../../api/client'
import type { CurrentUser, NodeView, Ontology } from '../../api/types'
import { canEditRole } from '../../context'
import {
  archiveOrder,
  BROWSE_STEPS,
  clearProgress,
  PRACTICE_ARCHIVE_REASON,
  PRACTICE_TEXT,
  practiceDocumentValues,
  practiceNames,
  practicePredicateCandidates,
  practiceSteps,
  readProgress,
  RESUME_STEP,
  shouldAutoStart,
  writeProgress,
  type GuideKind,
  type GuideStep,
  type PracticeCreated,
  type PracticePlan,
} from '../../lib/guide'
import { predicateLabel, typeLabel } from '../../lib/labels'
import { DEFAULT_WORKSPACE_QUERY, parseWorkspaceQuery, TAB_PATHS, tabOfPath, workspaceSearch, type WorkspaceQuery } from '../../routes'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { GuideBubble } from './GuideBubble'

/** 따라하기가 만들기 폼에 미리 채울 값. 노드 폼은 type 과 values, 주장 폼은 subjectId 부터 읽는다 */
export interface GuidePrefill {
  step: string
  type?: string
  values?: Record<string, string>
  subjectId?: string
  predicate?: string
  documentId?: string
  description?: string
  evidenceText?: string
}

export interface GuideReport {
  kind: 'node-created' | 'claim-created'
  node: NodeView
}

export interface GuideContextValue {
  active: boolean
  kind: GuideKind
  step: number
  steps: GuideStep[]
  /** 끝낸 기록을 보내거나 연습 항목을 보관하는 동안 참. 단추를 꺼 두 번 보내지 않게 한다 */
  busy: boolean
  message: string | null
  /** 보관하지 못한 연습 항목 */
  archiveFailed: { id: string; label: string }[]
  /** 지금 단계의 만들기 폼에 채울 값. 폼을 연 쪽이 consumePrefill() 하면 null 이 된다 */
  prefill: GuidePrefill | null
  /** 역할과 온톨로지로 따라하기와 둘러보기 가운데 하나를 연다. 진행 중인 따라하기가 있으면 이어서 할지 묻는다 */
  open: () => void
  next: () => void
  finish: () => void
  skip: () => void
  stop: () => void
  resume: () => void
  /** 항목을 만들었을 때. 지금 단계의 종류면 다음 단계로 간다 */
  report: (event: GuideReport) => void
  consumePrefill: () => void
  /** 만들기 폼을 닫았을 때. 말풍선에 「폼 다시 열기」 가 나온다 */
  cancelForm: () => void
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
  archiveFailed: [],
  prefill: null,
  open: noop,
  next: noop,
  finish: noop,
  skip: noop,
  stop: noop,
  resume: noop,
  report: noop,
  consumePrefill: noop,
  cancelForm: noop,
})

export function useGuide(): GuideContextValue {
  return useContext(GuideContext)
}

const DONE_FAILED = '가이드를 끝냈다는 기록을 남기지 못했습니다. 다음 로그인 때 다시 열릴 수 있습니다.'
const ARCHIVE_FAILED = '연습 항목을 보관하지 못했습니다. 이름을 눌러 직접 보관하세요.'

/** 주장 종류를 차례로 보며 대상 타입의 활성 항목이 하나라도 있는 첫 조합. 없으면 null 이다 */
async function choosePlan(ontology: Ontology): Promise<PracticePlan | null> {
  for (const predicate of practicePredicateCandidates(ontology)) {
    for (const objectType of ontology.claimPredicates[predicate].objectTypes) {
      try {
        const page = await api.nodes.search({ types: [objectType], size: 1 })
        if (page.items.length > 0) return { predicate, objectType }
      } catch {
        // 찾지 못한 타입으로 보고 다음 후보를 본다.
      }
    }
  }
  return null
}

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
  const [plan, setPlan] = useState<PracticePlan | null>(null)
  const [created, setCreated] = useState<PracticeCreated>({})
  // 저장된 따라하기를 이어서 할지 묻는 중이다. 이때 step 은 저장된 단계다.
  const [resuming, setResuming] = useState(false)
  // 지금 단계의 프리필을 폼이 가져갔는지, 그 폼을 취소했는지.
  const [prefillUsed, setPrefillUsed] = useState(false)
  const [formClosed, setFormClosed] = useState(false)
  // 같은 단계로 다시 들어가도(처음부터 다시 열기) 단계 진입 처리가 돌게 한다.
  const [entry, setEntry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [archiveFailed, setArchiveFailed] = useState<{ id: string; label: string }[]>([])
  const [startedAt, setStartedAt] = useState('')
  const busyRef = useRef(false)
  const openingRef = useRef(false)
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
  const ontologyRef = useRef(ontology)
  ontologyRef.current = ontology
  const userRef = useRef(user)
  userRef.current = user
  const wideRef = useRef(wide)
  wideRef.current = wide

  const steps = useMemo<GuideStep[]>(() => {
    if (kind !== 'practice' || !plan || !ontology) return BROWSE_STEPS
    return practiceSteps({ type: (t) => typeLabel(ontology, t), predicate: (p) => predicateLabel(ontology, p) }, plan)
  }, [kind, plan, ontology])
  const tab = tabOfPath(location.pathname)

  // 콜백이 이벤트 처리 중에 최신 상태를 읽게 한다.
  const stateRef = useRef({ active, kind, step, steps, resuming, created })
  stateRef.current = { active, kind, step, steps, resuming, created }

  const enter = useCallback((index: number) => {
    setStep(index)
    setPrefillUsed(false)
    setFormClosed(false)
    setEntry((n) => n + 1)
  }, [])

  const open = useCallback(async () => {
    if (busyRef.current || openingRef.current) return
    openingRef.current = true
    try {
      if (locationRef.current.pathname !== TAB_PATHS.workspace) navigateRef.current(TAB_PATHS.workspace)
      const me = userRef.current
      setMessage(null)
      setArchiveFailed([])
      const saved = readProgress(me.id)
      if (saved?.kind === 'practice' && saved.plan) {
        setKind('practice')
        setPlan(saved.plan)
        setCreated(saved.created)
        setStartedAt(saved.startedAt)
        setStep(saved.step)
        setResuming(true)
        setActive(true)
        return
      }
      const o = ontologyRef.current
      const chosen = o && canEditRole(me.role) ? await choosePlan(o) : null
      setKind(chosen ? 'practice' : 'browse')
      setPlan(chosen)
      setCreated({})
      setStartedAt(new Date().toISOString())
      setResuming(false)
      enter(0)
      setActive(true)
    } finally {
      openingRef.current = false
    }
  }, [enter])

  const next = useCallback(() => {
    if (busyRef.current) return
    const s = stateRef.current
    enter(Math.min(s.step + 1, s.steps.length - 1))
  }, [enter])

  const resume = useCallback(() => {
    if (busyRef.current) return
    const s = stateRef.current
    setResuming(false)
    enter(Math.min(Math.max(s.step, 0), s.steps.length - 1))
  }, [enter])

  const end = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const s = stateRef.current
    // 주장, 근거 문서, 기업 순서로 보관한다. 하나가 실패해도 나머지를 계속한다.
    const failed: { id: string; label: string }[] = []
    if (s.kind === 'practice') {
      for (const id of archiveOrder(s.created)) {
        let label = id
        try {
          const detail = await api.nodes.get(id)
          label = detail.node.label
          if (!detail.node.archived) await api.nodes.archive(id, detail.node.revision, PRACTICE_ARCHIVE_REASON)
        } catch (e) {
          if (!(e instanceof ApiError && (e.code === 'ARCHIVED' || e.code === 'NOT_FOUND'))) failed.push({ id, label })
        }
      }
    }
    clearProgress()
    setArchiveFailed(failed)
    try {
      const updated = await api.auth.guideDone()
      onUserChangeRef.current(updated)
    } catch {
      setMessage(DONE_FAILED)
    } finally {
      busyRef.current = false
      setBusy(false)
      setResuming(false)
      setActive(false)
    }
  }, [])

  const finish = useCallback(() => void end(), [end])
  const skip = useCallback(() => void end(), [end])
  const stop = useCallback(() => void end(), [end])

  const report = useCallback(
    (event: GuideReport) => {
      const s = stateRef.current
      if (!s.active || s.kind !== 'practice' || s.resuming || busyRef.current) return
      const id = s.steps[s.step]?.id
      const matched =
        (id === 'company' && event.kind === 'node-created' && event.node.type === 'Company') ||
        (id === 'document' && event.kind === 'node-created' && event.node.type === 'Document') ||
        (id === 'claim' && event.kind === 'claim-created')
      if (!matched) return
      setCreated((c) => ({ ...c, [id]: event.node.id }))
      enter(Math.min(s.step + 1, s.steps.length - 1))
    },
    [enter],
  )

  const consumePrefill = useCallback(() => {
    setPrefillUsed(true)
    setFormClosed(false)
  }, [])
  const cancelForm = useCallback(() => setFormClosed(true), [])
  const reopen = useCallback(() => {
    setPrefillUsed(false)
    setFormClosed(false)
  }, [])

  useEffect(() => {
    if (autoTriedRef.current || tab !== 'workspace' || ontology === null) return
    if (!shouldAutoStart(user, readProgress(user.id))) return
    autoTriedRef.current = true
    void open()
  }, [user, tab, ontology, open])

  useEffect(() => {
    // 이어서 할지 묻는 동안에는 저장된 값을 그대로 둔다.
    if (!active || resuming) return
    writeProgress({ userId: user.id, kind, step, startedAt, created, ...(kind === 'practice' && plan ? { plan } : {}) })
  }, [active, resuming, kind, step, startedAt, created, plan, user.id])

  // 단계에 들어갈 때 한 번만 주소를 바꾼다. 그 뒤 사용자가 다른 탭이나 항목을 눌러도 되돌리지 않는다.
  useEffect(() => {
    const s = stateRef.current
    if (!s.active || s.resuming) return
    const current = s.steps[s.step]
    const here = locationRef.current
    if (!current || here.pathname !== TAB_PATHS.workspace) return
    const narrowPane = wideRef.current ? null : current.pane
    let target: WorkspaceQuery | null = null
    if (s.kind === 'practice') {
      const company = s.created.company ?? null
      if (current.id === 'company' || current.id === 'document') target = { ...DEFAULT_WORKSPACE_QUERY, pane: narrowPane }
      else if (current.id === 'claim' && company) target = { ...DEFAULT_WORKSPACE_QUERY, node: company, pane: narrowPane }
      else if (current.id === 'done' && company) target = { ...DEFAULT_WORKSPACE_QUERY, node: company, center: company, pane: narrowPane }
    } else if (narrowPane) {
      const query = parseWorkspaceQuery(here.search)
      if (query.pane !== narrowPane) target = { ...query, pane: narrowPane }
    }
    if (!target) return
    const url = TAB_PATHS.workspace + workspaceSearch(target)
    // 만들기가 성공하면 작업 공간이 만든 항목을 여는 주소를 같은 이벤트에서 쌓는다. 아직 반영되지 않은 주소와 비교하면
    // 바꾸지 않고 넘어갈 수 있어, 따라하기는 비교하지 않고 언제나 바꾼다. replace 라 기록은 쌓이지 않는다.
    if (s.kind === 'practice' || url !== here.pathname + here.search) navigateRef.current(url, { replace: true })
    // entry 가 바뀔 때만 돈다. 주소나 폭이 바뀌어도 다시 옮기지 않는다.
  }, [entry])

  const prefill = useMemo<GuidePrefill | null>(() => {
    if (!active || resuming || kind !== 'practice' || prefillUsed || !plan || !ontology) return null
    const id = steps[step]?.id
    const names = practiceNames(user.displayName, new Date(startedAt))
    if (id === 'company') {
      const labelProperty = ontology.nodeTypes.Company?.labelProperty || 'name'
      return { step: id, type: 'Company', values: { [labelProperty]: names.company } }
    }
    if (id === 'document') return { step: id, type: 'Document', values: practiceDocumentValues(ontology, names.document) }
    if (id === 'claim' && created.company) {
      return {
        step: id,
        subjectId: created.company,
        predicate: plan.predicate,
        documentId: created.document,
        description: PRACTICE_TEXT,
        evidenceText: PRACTICE_TEXT,
      }
    }
    return null
  }, [active, resuming, kind, prefillUsed, plan, ontology, steps, step, user.displayName, startedAt, created])

  const openGuide = useCallback(() => void open(), [open])

  const value = useMemo<GuideContextValue>(
    () => ({
      active,
      kind,
      step,
      steps,
      busy,
      message,
      archiveFailed,
      prefill,
      open: openGuide,
      next,
      finish,
      skip,
      stop,
      resume,
      report,
      consumePrefill,
      cancelForm,
    }),
    [active, kind, step, steps, busy, message, archiveFailed, prefill, openGuide, next, finish, skip, stop, resume, report, consumePrefill, cancelForm],
  )

  const current = resuming ? RESUME_STEP : steps[step]
  return (
    <GuideContext.Provider value={value}>
      {children}
      {active && current && (
        <GuideBubble
          kind={kind}
          step={current}
          index={step}
          total={steps.length}
          busy={busy}
          wide={wide}
          onNext={next}
          onFinish={finish}
          onSkip={skip}
          onStop={stop}
          onResume={resume}
          onReopen={reopen}
          canReopen={formClosed}
        />
      )}
    </GuideContext.Provider>
  )
}

/** 머리글 아래의 가이드 안내. 끝낸 기록을 남기지 못했거나 연습 항목을 보관하지 못했을 때 보인다 */
export function GuideMessage() {
  const { message, archiveFailed } = useGuide()
  const navigate = useNavigate()
  if (!message && archiveFailed.length === 0) return null
  return (
    <Alert role={undefined} variant="destructive" className="m-2 w-auto shrink-0" data-testid="guide-message">
      <AlertDescription>
        {message && <p>{message}</p>}
        {archiveFailed.length > 0 && (
          <>
            <p>{ARCHIVE_FAILED}</p>
            <ul>
              {archiveFailed.map((item) => (
                <li key={item.id}>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0 py-0"
                    data-testid="guide-archive-failed"
                    onClick={() => navigate(TAB_PATHS.workspace + workspaceSearch({ ...DEFAULT_WORKSPACE_QUERY, node: item.id }))}
                  >
                    {item.label}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** 머리글의 「사용법」. 작업 공간으로 옮겨 가이드를 연다 */
export function GuideOpenButton() {
  const { open, busy } = useGuide()
  return (
    <Button
      variant="link"
      size="sm"
      className="mr-2 h-auto px-1 py-0 text-blue-300"
      data-testid="guide-open"
      disabled={busy}
      onClick={open}
    >
      사용법
    </Button>
  )
}
