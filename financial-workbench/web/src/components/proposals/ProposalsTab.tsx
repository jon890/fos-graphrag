import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, ApiError, errorMessage } from '../../api/client'
import type { Page, ProposalView, PropertyValue } from '../../api/types'
import { useApp, useLabels } from '../../context'
import { buildCreateProperties, initialFormValues, type FormValues } from '../../lib/formValues'
import { formatDateTime } from '../../lib/format'
import { canAccept, createNodeParts, evidenceNodes, kindLabel, levelLabel, payloadTradeIds, proposalLinkSentences, proposalSummary, tradeLine } from '../../lib/proposals'
import { parseProposalsQuery, proposalsSearch, TAB_PATHS, type ProposalsQuery, type ProposalsStatus } from '../../routes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { fieldErrorsOf, PropertyFields } from '../PropertyFields'
import { Pager } from '../Pager'
import { useProposalCount } from './ProposalCountProvider'

const NOTE_MAX = 1000
const STATUS_CHIPS: { key: ProposalsStatus; label: string }[] = [
  { key: 'PENDING', label: '대기' },
  { key: 'ACCEPTED', label: '승인함' },
  { key: 'REJECTED', label: '거절함' },
]
const STATUS_TEXT: Record<string, string> = { PENDING: '대기', ACCEPTED: '승인함', REJECTED: '거절함' }
const LEVELS = ['KNOWN', 'UNSURE', 'LEARNING']
const EDITOR_REQUIRED = '편집 권한이 있어야 승인할 수 있습니다. 편집자에게 부탁하거나 거절하세요.'

type Message = { kind: 'success' | 'error'; text: string }
type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; value: Page<ProposalView> }

interface Props {
  /** 작업 공간에서 그 항목의 상세를 연다 */
  onOpenNode: (id: string) => void
}

/** 제안 화면(/proposals). 에이전트가 올린 내 제안을 보고 승인하거나 거절한다. 규칙은 docs/flow.md 「제안」 */
export function ProposalsTab({ onOpenNode }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const query = useMemo(() => parseProposalsQuery(location.search), [location.search])
  const { status, page: pageNo } = query
  const { refresh: refreshCount } = useProposalCount()
  const [list, setList] = useState<Load>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [message, setMessage] = useState<Message | null>(null)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  /** 주소만 바꾸고 기록을 쌓지 않는다. 상태를 바꾸면 쪽은 0 으로 돌린다 */
  const change = (patch: Partial<ProposalsQuery>) => {
    const url = TAB_PATHS.proposals + proposalsSearch({ ...query, page: 0, ...patch })
    if (url !== location.pathname + location.search) navigate(url, { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    setList((l) => (l.kind === 'done' ? l : { kind: 'loading' }))
    api.proposals
      .list(status, pageNo)
      .then((p) => {
        if (cancelled) return
        // 마지막 대기 제안을 처리해 끝 쪽이 비면 끝 쪽으로 바꿔 연다
        const last = Math.max(p.totalPages - 1, 0)
        if (last < pageNo) {
          navigateRef.current(TAB_PATHS.proposals + proposalsSearch({ status, page: last }), { replace: true })
          return
        }
        setList({ kind: 'done', value: p })
      })
      .catch((e) => !cancelled && setList({ kind: 'error', message: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [status, pageNo, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  /** 승인이나 거절이 끝난 뒤. 메시지를 보이고 목록과 배지를 다시 읽는다 */
  const decided = useCallback(
    (next: Message) => {
      setMessage(next)
      reload()
      refreshCount()
    },
    [reload, refreshCount],
  )

  /** 다른 탭에서 먼저 결정했으면 던지지 않고 안내와 다시 읽기로 마무리한다. 그 밖의 실패는 카드가 보인다 */
  const run = useCallback(
    async (action: () => Promise<unknown>, doneText: string) => {
      try {
        await action()
        decided({ kind: 'success', text: doneText })
      } catch (e) {
        if (e instanceof ApiError && e.code === 'PROPOSAL_NOT_PENDING') {
          decided({ kind: 'error', text: '이미 처리한 제안입니다' })
          return
        }
        throw e
      }
    },
    [decided],
  )

  return (
    <div className="mx-auto max-w-3xl min-w-0 p-4" data-testid="proposals-tab">
      <h2 className="m-0 mb-1 text-lg font-bold">제안</h2>
      <p className="my-1 text-xs text-muted-foreground">에이전트가 올린 제안입니다. 승인하면 실행하고, 거절하면 이유를 에이전트가 읽습니다.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <Button
            key={c.key}
            type="button"
            size="sm"
            variant={status === c.key ? 'default' : 'outline'}
            aria-pressed={status === c.key}
            data-testid={`proposals-status-${c.key}`}
            onClick={() => change({ status: c.key })}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {message && (
        <p
          role="status"
          className={cn('mt-3 text-sm', message.kind === 'error' ? 'text-red-700' : 'text-emerald-800')}
          data-testid="proposals-message"
          data-kind={message.kind}
        >
          {message.text}
        </p>
      )}

      {list.kind === 'loading' && <p className="mt-4 text-muted-foreground">불러오는 중…</p>}
      {list.kind === 'error' && (
        <div className="error-box mt-3" data-testid="proposals-error">
          <p>{list.message}</p>
          <Button type="button" size="sm" variant="outline" className="mt-2" data-testid="proposals-retry" onClick={reload}>
            다시 시도
          </Button>
        </div>
      )}
      {list.kind === 'done' &&
        (list.value.totalItems === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground" data-testid="proposals-empty">
            {status === 'PENDING' ? '대기 중인 제안이 없습니다. Hermes 가 체결을 보고 해석을 올리면 여기에 모입니다.' : '아직 없습니다'}
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3 p-0">
              {list.value.items.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  onOpenNode={onOpenNode}
                  onAccept={(payload) => run(() => api.proposals.accept(p.id, payload), '승인했습니다')}
                  onReject={(reason) => run(() => api.proposals.reject(p.id, reason), '거절했습니다')}
                />
              ))}
            </ul>
            <Pager page={list.value} onPage={(n) => change({ page: n })} testIdPrefix="proposals-page" />
          </>
        ))}
    </div>
  )
}

interface CardProps {
  proposal: ProposalView
  onOpenNode: (id: string) => void
  /** payload 가 있으면 고친 내용 전체로 승인한다. 실패하면 던진다 */
  onAccept: (payload?: Record<string, unknown>) => Promise<void>
  onReject: (reason?: string) => Promise<void>
}

/** 제안 카드. 요청 없이 props 로 그리고, 승인과 거절은 onAccept, onReject 로 넘긴다 */
export function ProposalCard({ proposal: p, onOpenNode, onAccept, onReject }: CardProps) {
  const { user, ontology } = useApp()
  const labels = useLabels()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  const { type: newType, properties } = createNodeParts(p)
  const defs = ontology.nodeTypes[newType]?.properties
  const [values, setValues] = useState<FormValues>(() => initialFormValues(defs ?? {}, properties as Record<string, PropertyValue>))
  const [level, setLevel] = useState(() => (typeof p.payload.level === 'string' ? p.payload.level : 'UNSURE'))
  const [note, setNote] = useState(() => (typeof p.payload.note === 'string' ? p.payload.note : ''))

  const pending = p.status === 'PENDING'
  const allowed = canAccept(user.role, p)
  const editable = (p.kind === 'CREATE_NODE' && defs !== undefined) || p.kind === 'STUDY_NOTE'

  const links = proposalLinkSentences(ontology, p)
  const tradeIds = payloadTradeIds(p)
  const evidenceTradeIds = p.evidence.tradeIds ?? []
  const urls = (p.evidence.urls ?? []).filter((u) => /^https?:\/\//i.test(u))
  const evNodes = evidenceNodes(p)

  const guarded = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
      if (e instanceof ApiError) setFieldErrors(fieldErrorsOf(e.details))
    } finally {
      setBusy(false)
    }
  }

  const submitEdited = () => {
    if (p.kind === 'CREATE_NODE' && defs) {
      const built = buildCreateProperties(defs, values)
      if (Object.keys(built.errors).length > 0) {
        setFieldErrors(built.errors)
        return
      }
      setFieldErrors({})
      void guarded(() => onAccept({ ...p.payload, properties: built.properties }))
    } else {
      void guarded(() => onAccept({ ...p.payload, level, note }))
    }
  }

  const reject = () =>
    void guarded(async () => {
      await onReject(reason.trim() || undefined)
      setRejectOpen(false)
    })

  const nodeLink = (id: string, text: string) => (
    <Button
      type="button"
      variant="link"
      className="h-auto min-w-0 px-0 py-0 text-left break-words whitespace-normal"
      data-testid="proposal-node-open"
      data-node-id={id}
      onClick={() => onOpenNode(id)}
    >
      {text}
    </Button>
  )

  const tradeRow = (id: string) => {
    const t = p.refs.trades[id]
    return (
      <li key={id} className="break-words" data-testid="proposal-trade" data-trade-id={id}>
        {t ? tradeLine(t) : '찾을 수 없는 체결'}
      </li>
    )
  }

  return (
    <li
      className="grid min-w-0 gap-2 rounded-md border bg-background p-3"
      data-testid="proposal-card"
      data-id={p.id}
      data-kind={p.kind}
      data-status={p.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold" data-testid="proposal-kind">
          {kindLabel(p.kind)}
        </span>
        <span className="text-xs text-muted-foreground">{STATUS_TEXT[p.status] ?? p.status}</span>
      </div>
      <p className="m-0 text-xs text-muted-foreground" data-testid="proposal-meta">
        {formatDateTime(p.createdAt)}
        {p.token?.name ? ` · ${p.token.name}` : ''}
      </p>

      <p className="m-0 text-sm font-semibold break-words" data-testid="proposal-summary">
        {proposalSummary(ontology, p)}
      </p>
      {p.kind === 'CREATE_NODE' && (
        <ul className="m-0 grid gap-0.5 pl-4 text-sm">
          {Object.entries(properties)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .map(([name, v]) => (
              <li key={name} className="break-words" data-testid="proposal-prop" data-prop={name}>
                {labels.property(newType, name)}: {labels.value(newType, name, v)}
              </li>
            ))}
        </ul>
      )}
      {links.length > 0 && (
        <ul className="m-0 grid gap-0.5 pl-4 text-sm">
          {links.map((s, i) => (
            <li key={i} className="break-words" data-testid="proposal-link">
              {s}
            </li>
          ))}
        </ul>
      )}
      {tradeIds.length > 0 && <ul className="m-0 grid gap-0.5 pl-4 text-sm">{tradeIds.map(tradeRow)}</ul>}
      {p.kind === 'CREATE_RELATIONSHIP' && (
        <div className="flex flex-wrap gap-x-3 text-sm">
          {[p.payload.fromId, p.payload.toId].map((id, i) => typeof id === 'string' && p.refs.nodes[id] && <span key={i}>{nodeLink(id, p.refs.nodes[id].label)}</span>)}
        </div>
      )}
      {p.kind === 'LINK_TRADE_DECISION' && typeof p.payload.decisionId === 'string' && p.refs.nodes[p.payload.decisionId] && (
        <div className="text-sm">{nodeLink(p.payload.decisionId, p.refs.nodes[p.payload.decisionId].label)}</div>
      )}
      {p.kind === 'STUDY_NOTE' && (
        <div className="grid gap-0.5 text-sm">
          {typeof p.payload.nodeId === 'string' && p.refs.nodes[p.payload.nodeId] && <div>{nodeLink(p.payload.nodeId, p.refs.nodes[p.payload.nodeId].label)}</div>}
          {typeof p.payload.note === 'string' && p.payload.note && <p className="m-0 whitespace-pre-wrap break-words">메모: {p.payload.note}</p>}
        </div>
      )}

      {p.rationale && (
        <p className="m-0 text-sm whitespace-pre-wrap break-words" data-testid="proposal-rationale">
          <span className="text-muted-foreground">에이전트가 붙인 까닭: </span>
          {p.rationale}
        </p>
      )}
      {(evNodes.length > 0 || evidenceTradeIds.length > 0 || urls.length > 0) && (
        <div className="grid gap-0.5 text-sm" data-testid="proposal-evidence">
          <span className="text-muted-foreground">근거</span>
          {evNodes.map((n) => (
            <div key={n.id}>{nodeLink(n.id, n.label)}</div>
          ))}
          {evidenceTradeIds.length > 0 && <ul className="m-0 grid gap-0.5 pl-4">{evidenceTradeIds.map(tradeRow)}</ul>}
          {urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="break-all">
              {u}
            </a>
          ))}
        </div>
      )}

      {p.lastError && (
        <p className="m-0 text-sm text-red-700" data-testid="proposal-last-error">
          승인하지 못했습니다: {p.lastError.message}
        </p>
      )}

      {pending && !allowed && (
        <p className="m-0 text-xs text-muted-foreground" data-testid="proposal-editor-required">
          {EDITOR_REQUIRED}
        </p>
      )}

      {pending && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" data-testid="proposal-accept" disabled={busy || !allowed} onClick={() => void guarded(() => onAccept())}>
            승인
          </Button>
          {editable && (
            <Button type="button" size="sm" variant="outline" data-testid="proposal-edit-open" disabled={busy || !allowed} onClick={() => setEditing(true)}>
              고쳐서 승인
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" data-testid="proposal-reject-open" disabled={busy} onClick={() => setRejectOpen(true)}>
            거절
          </Button>
        </div>
      )}

      {pending && editing && (
        <form
          className="grid gap-2 rounded-md border bg-muted/30 p-2"
          data-testid="proposal-edit-form"
          onSubmit={(e) => {
            e.preventDefault()
            submitEdited()
          }}
        >
          {p.kind === 'CREATE_NODE' && defs && (
            <PropertyFields
              defs={defs}
              values={values}
              errors={fieldErrors}
              disabled={busy}
              testIdPrefix="proposal-edit-prop"
              onChange={(name, v) => setValues((prev) => ({ ...prev, [name]: v }))}
            />
          )}
          {p.kind === 'STUDY_NOTE' && (
            <>
              <NativeSelect aria-label="표시" data-testid="proposal-edit-level" value={level} disabled={busy} onChange={(e) => setLevel(e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {levelLabel(l)}
                  </option>
                ))}
              </NativeSelect>
              <Textarea aria-label="메모" data-testid="proposal-edit-note" maxLength={NOTE_MAX} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" data-testid="proposal-edit-submit" disabled={busy}>
              이대로 승인
            </Button>
            <Button type="button" size="sm" variant="outline" data-testid="proposal-edit-cancel" disabled={busy} onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="m-0 text-sm text-red-700" role="alert" data-testid="proposal-card-error">
          {error}
        </p>
      )}

      {!pending && (
        <div className="grid gap-0.5 text-sm" data-testid="proposal-decided">
          <span>
            {STATUS_TEXT[p.status] ?? p.status} {formatDateTime(p.decidedAt)}
          </span>
          {p.decisionNote && <span className="break-words">거절 이유: {p.decisionNote}</span>}
          {p.result?.nodeIds.map((id) => (
            <span key={id}>
              <Button
                type="button"
                variant="link"
                className="h-auto min-w-0 px-0 py-0 text-left break-words whitespace-normal"
                data-testid="proposal-result-open"
                data-node-id={id}
                onClick={() => onOpenNode(id)}
              >
                {p.refs.nodes[id]?.label ?? '찾을 수 없는 항목'}
              </Button>
            </span>
          ))}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={(open) => !busy && setRejectOpen(open)}>
        <DialogContent data-testid="proposal-reject-dialog">
          <DialogHeader>
            <DialogTitle>제안 거절</DialogTitle>
            <DialogDescription>이유를 남기면 에이전트가 읽고 같은 제안을 다시 올리지 않습니다. 이유는 비워도 됩니다.</DialogDescription>
          </DialogHeader>
          <Textarea aria-label="거절 이유" data-testid="proposal-reject-reason" maxLength={NOTE_MAX} value={reason} disabled={busy} onChange={(e) => setReason(e.target.value)} />
          {error && <p className="m-0 text-sm text-red-700">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" data-testid="proposal-reject-cancel" disabled={busy}>
                취소
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" data-testid="proposal-reject-confirm" disabled={busy} onClick={reject}>
              거절
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}
