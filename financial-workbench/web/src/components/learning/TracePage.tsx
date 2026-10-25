import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, ApiError, errorMessage } from '../../api/client'
import type { KnowledgeMark, NodeRef, TraceMissing, TraceStatus, TraceStep, TraceView } from '../../api/types'
import { useApp, useLabels } from '../../context'
import { relationSentenceParts } from '../../lib/relationSentence'
import { stepCards, stepRole, traceSummary, withStepKnowledge, type StepRole } from '../../lib/trace'
import { TAB_PATHS } from '../../routes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StatusBadge, TypeBadge } from '../TypeBadge'
import { ConceptChips } from './ConceptChips'
import { KnowledgeMarkControls } from './KnowledgeMarkControls'

/** 결정 타입은 설명 칸 대신 이유(reason)를 보인다. 서버 LearningRules 의 결정 타입 이름과 같다 */
const DECISION_TYPE = 'Decision'

const STATUS_TEXT: Record<TraceStatus, string> = { SUPPORTED: '근거 있음', PARTIAL: '초안 주장만', MISSING: '근거 없음' }
const STATUS_CLASS: Record<TraceStatus, string> = {
  SUPPORTED: 'border-green-700 bg-green-50 text-green-800',
  PARTIAL: 'border-orange-600 bg-orange-50 text-orange-800',
  MISSING: 'border-red-700 bg-red-50 text-red-800',
}
const ROLE_TEXT: Record<StepRole, string | null> = { root: '지금 보는 항목', origin: '출발점', middle: null }

interface Props {
  /** 주소의 node. 없으면 안내를 보인다 */
  nodeId: string | null
  /** 작업 공간에서 그 항목의 상세를 연다 */
  onOpenNode: (id: string) => void
  /** 그 항목을 기준으로 다시 따라간다 */
  onTrace: (id: string) => void
}

type Load = { kind: 'loading' } | { kind: 'not-found' } | { kind: 'error'; message: string } | { kind: 'done'; view: TraceView }
/** 그 항목을 읽은 결과. 다른 항목의 결과면 아직 읽지 않은 것이다 */
type Loaded = { nodeId: string; load: Load }

/**
 * 화면에 보일 상태. 항목을 처음 읽을 때만 「불러오는 중」 이고,
 * 같은 항목을 다시 읽는 동안(후보를 이은 뒤, 다시 시도)에는 응답이 올 때까지 앞의 결과를 그대로 둔다
 */
export function shownLoad(loaded: Loaded | null, nodeId: string): Load {
  return loaded?.nodeId === nodeId ? loaded.load : { kind: 'loading' }
}

/** 근거 따라가기 화면(/trace?node=). 규칙은 docs/flow.md 「근거 따라가기」 */
export function TracePage({ nodeId, onOpenNode, onTrace }: Props) {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!nodeId) return
    let cancelled = false
    api.nodes
      .trace(nodeId)
      .then((view) => !cancelled && setLoaded({ nodeId, load: { kind: 'done', view } }))
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404) setLoaded({ nodeId, load: { kind: 'not-found' } })
        else setLoaded({ nodeId, load: { kind: 'error', message: errorMessage(e) } })
      })
    return () => {
      cancelled = true
    }
  }, [nodeId, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const changeMark = useCallback(
    (id: string, mark: KnowledgeMark) =>
      setLoaded((l) => (l?.load.kind === 'done' ? { nodeId: l.nodeId, load: { kind: 'done', view: withStepKnowledge(l.load.view, id, mark) } } : l)),
    [],
  )

  if (!nodeId) {
    return (
      <div className="mx-auto max-w-3xl p-4" data-testid="trace-empty">
        <p>작업 공간에서 항목을 고른 뒤 「근거 따라가기」 를 누르세요.</p>
        <Button type="button" size="sm" variant="outline" className="mt-3" data-testid="trace-open-workspace" onClick={() => navigate(TAB_PATHS.workspace)}>
          작업 공간으로
        </Button>
      </div>
    )
  }

  const load = shownLoad(loaded, nodeId)
  return (
    <div className="mx-auto max-w-3xl min-w-0 p-4" data-testid="trace-page" data-node-id={nodeId}>
      {load.kind === 'loading' && <p className="text-muted-foreground">불러오는 중…</p>}
      {load.kind === 'not-found' && (
        <p className="error-box" data-testid="trace-not-found">
          이 항목을 찾을 수 없거나 보관되었습니다.
        </p>
      )}
      {load.kind === 'error' && (
        <div className="error-box" data-testid="trace-error">
          <p>{load.message}</p>
          <Button type="button" size="sm" variant="outline" className="mt-2" data-testid="trace-retry" onClick={reload}>
            다시 시도
          </Button>
        </div>
      )}
      {load.kind === 'done' && <TraceBody view={load.view} onOpenNode={onOpenNode} onTrace={onTrace} onReload={reload} onMarkChange={changeMark} />}
    </div>
  )
}

interface BodyProps {
  view: TraceView
  onOpenNode: (id: string) => void
  onTrace: (id: string) => void
  /** 관계를 이은 뒤 다시 읽는다 */
  onReload: () => void
  /** 그 단계의 이해 표시가 바뀌었다 */
  onMarkChange: (nodeId: string, mark: KnowledgeMark) => void
}

/** 받은 응답을 그리는 부분. 요청 없이 props 만으로 그린다 */
export function TraceBody({ view, onOpenNode, onTrace, onReload, onMarkChange }: BodyProps) {
  const labels = useLabels()
  const { ontology } = useApp()
  const root = view.steps.find((s) => s.node.id === view.rootId)?.node ?? view.steps[0]?.node
  const summary = traceSummary(view)
  const cards = stepCards(view)
  const rootName = root ? labels.node(root) : ''

  return (
    <>
      <header className="flex flex-wrap items-center gap-2">
        {root && <TypeBadge type={root.type} />}
        <h2 className="min-w-0 text-lg font-bold break-words" data-testid="trace-title">
          {`${rootName}: 이 판단은 어디서 왔나`}
        </h2>
        <Button type="button" size="sm" variant="outline" className="ml-auto" data-testid="trace-open-workspace" onClick={() => onOpenNode(view.rootId)}>
          작업 공간에서 보기
        </Button>
      </header>

      <p
        className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm"
        data-testid="trace-summary"
        data-steps={summary.steps}
        data-supported={summary.supported}
        data-partial={summary.partial}
        data-missing={summary.missing}
        data-unsure={summary.unsure}
      >
        <span>전체 {summary.steps}단계</span>
        <span className="text-green-800">근거 있음 {summary.supported}단계</span>
        <span className="text-orange-800">초안 주장만 {summary.partial}단계</span>
        <span className="text-red-800">근거 없음 {summary.missing}단계</span>
        <span>잘 모르겠어요 {summary.unsure}단계</span>
      </p>
      {view.truncated && (
        <p className="info-box mt-2" data-testid="trace-truncated">
          단계가 많아 깊이 {view.limits.maxDepth}, {view.limits.maxSteps}단계까지만 보입니다.
        </p>
      )}

      <ol className="mt-4 grid gap-3">
        {cards.map((step) => (
          <StepCard
            key={step.node.id}
            view={view}
            step={step}
            role={stepRole(view, step)}
            onOpenNode={onOpenNode}
            onTrace={onTrace}
            onReload={onReload}
            onMarkChange={onMarkChange}
          />
        ))}
      </ol>

      <section className="mt-6" data-testid="trace-dependents">
        <h3 className="font-semibold">이 항목에 기대는 것</h3>
        {view.dependents.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">지금은 이 항목을 근거로 삼은 항목이 없습니다.</p>
        ) : (
          <ul className="mt-1 grid gap-1 text-sm">
            {view.dependents.map((d) => (
              <li key={d.relationshipId} className="break-words" data-testid="trace-dependent" data-node-id={d.node.id}>
                <TypeBadge type={d.node.type} />{' '}
                {relationSentenceParts(ontology, d.relationshipType, rootName, labels.node(d.node)).map((part, i) =>
                  part.kind === 'text' ? (
                    <span key={i}>{part.text}</span>
                  ) : part.slot === 'from' ? (
                    <strong key={i}>{part.text}</strong>
                  ) : (
                    <Button key={i} type="button" variant="link" size="sm" className="h-auto px-0 py-0 whitespace-normal" onClick={() => onTrace(d.node.id)}>
                      {part.text}
                    </Button>
                  ),
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

interface StepProps {
  view: TraceView
  step: TraceStep
  role: StepRole
  onOpenNode: (id: string) => void
  onTrace: (id: string) => void
  onReload: () => void
  onMarkChange: (nodeId: string, mark: KnowledgeMark) => void
}

function StepCard({ view, step, role, onOpenNode, onTrace, onReload, onMarkChange }: StepProps) {
  const { ontology, canEdit } = useApp()
  const labels = useLabels()
  const { node } = step
  const name = labels.node(node)
  const child = step.childId ? view.steps.find((s) => s.node.id === step.childId)?.node : undefined
  // 설명 칸은 그 타입에 그 속성이 있을 때만 보인다. 적힌 글은 해석하지 않는다
  const descriptionKey = node.type === DECISION_TYPE ? 'reason' : 'description'
  const descriptionValue = node.properties[descriptionKey]
  const description =
    ontology.nodeTypes[node.type]?.properties[descriptionKey] && typeof descriptionValue === 'string' && descriptionValue.trim() ? descriptionValue : null
  const noEvidence = step.documents.length === 0 && step.claims.length === 0
  const roleText = ROLE_TEXT[role]

  return (
    <li
      className="grid min-w-0 gap-2 rounded-md border bg-background p-3"
      data-testid="trace-step"
      data-node-id={node.id}
      data-depth={step.depth}
      data-status={step.status}
      data-role={role}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={node.type} />
        <Button
          type="button"
          variant="link"
          className="h-auto max-w-full min-w-0 shrink px-0 py-0 text-left font-bold break-words whitespace-normal"
          data-testid="trace-step-name"
          onClick={() => onTrace(node.id)}
        >
          {name}
        </Button>
        {roleText && <span className="text-xs text-muted-foreground">{roleText}</span>}
        <span className={cn('rounded-[3px] border px-1.5 text-xs', STATUS_CLASS[step.status])}>{STATUS_TEXT[step.status]}</span>
      </div>

      {step.relationshipType && child && (
        <p className="text-sm break-words" data-testid="trace-step-sentence">
          {relationSentenceParts(ontology, step.relationshipType, name, labels.node(child)).map((part, i) =>
            part.kind === 'slot' && part.slot === 'from' ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
          )}
        </p>
      )}

      {description && (
        <p className="text-sm whitespace-pre-wrap break-words" data-testid="trace-step-description">
          {description}
        </p>
      )}

      {step.documents.length > 0 && (
        <ul className="grid gap-0.5 text-sm">
          {step.documents.map((d) => (
            <li key={d.id} className="break-words">
              <a href={d.url} target="_blank" rel="noreferrer" data-testid="trace-step-document" data-document-id={d.id}>
                {d.title}
              </a>
              {d.publisher && <span className="text-muted-foreground"> {d.publisher}</span>}
            </li>
          ))}
        </ul>
      )}
      {step.claims.length > 0 && (
        <ul className="grid gap-0.5 text-sm">
          {step.claims.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-1.5 break-words" data-testid="trace-step-claim" data-review-status={c.reviewStatus ?? ''}>
              <span className="min-w-0">{c.label}</span>
              <StatusBadge status={c.reviewStatus} />
            </li>
          ))}
        </ul>
      )}
      {noEvidence && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground" data-testid="trace-step-no-evidence">
            근거 문서가 아직 없습니다.
          </span>
          {canEdit && (
            <Button type="button" size="xs" variant="outline" data-testid="trace-step-attach" onClick={() => onOpenNode(node.id)}>
              ＋ 근거 문서 붙이기
            </Button>
          )}
        </div>
      )}

      {step.missing.map((m) => (
        <MissingRow key={m.relationshipType} missing={m} stepId={node.id} onOpenNode={onOpenNode} onReload={onReload} />
      ))}

      <ConceptChips concepts={step.concepts} onOpen={onOpenNode} />
      <KnowledgeMarkControls nodeId={node.id} mark={step.knowledge} onChange={(mark) => onMarkChange(node.id, mark)} />
    </li>
  )
}

function MissingRow({ missing, stepId, onOpenNode, onReload }: { missing: TraceMissing; stepId: string; onOpenNode: (id: string) => void; onReload: () => void }) {
  const { canEdit } = useApp()
  const labels = useLabels()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const link = async (candidate: NodeRef) => {
    setBusy(true)
    setError(null)
    try {
      await api.relationships.create(missing.relationshipType, candidate.id, stepId)
      onReload()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-1 rounded-sm bg-muted/50 p-2 text-sm" data-testid="trace-missing" data-relationship={missing.relationshipType}>
      <span>아직 이어지지 않은 {labels.relationship(missing.relationshipType)}</span>
      {canEdit && (
        <div className="flex flex-wrap gap-1.5">
          {missing.candidates.map((c) => (
            <Button
              key={c.id}
              type="button"
              size="xs"
              variant="outline"
              className="h-auto min-h-6 shrink break-words whitespace-normal"
              data-testid="trace-candidate-link"
              data-candidate-id={c.id}
              disabled={busy}
              onClick={() => void link(c)}
            >
              {labels.node(c)} 잇기
            </Button>
          ))}
          {missing.candidates.length === 0 && (
            <Button type="button" size="xs" variant="outline" data-testid="trace-missing-open" onClick={() => onOpenNode(stepId)}>
              ＋ 잇기
            </Button>
          )}
        </div>
      )}
      {error && (
        <span className="text-destructive" role="alert" data-testid="trace-missing-error">
          {error}
        </span>
      )}
    </div>
  )
}
