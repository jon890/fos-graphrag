import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, errorMessage } from '../../api/client'
import type { KnowledgeLevel, KnowledgeSummary, Page, StudyItem } from '../../api/types'
import { useLabels } from '../../context'
import { competenceText, studyContextText, studyTodos } from '../../lib/trace'
import { parseStudyQuery, studySearch, TAB_PATHS, type StudyLevel, type StudyQuery } from '../../routes'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Pager } from '../Pager'
import { TypeBadge } from '../TypeBadge'

const NOTE_MAX = 1000
const PAGE_SIZE = 20
const STUDY_LEVELS: StudyLevel[] = ['UNSURE', 'LEARNING']
const LEVEL_TEXT: Record<KnowledgeLevel, string> = { UNSURE: '잘 모름', LEARNING: '공부 중', KNOWN: '이해함' }

interface Props {
  /** 작업 공간에서 그 항목의 상세를 연다 */
  onOpenNode: (id: string) => void
  onTrace: (id: string) => void
}

export type Load<T> = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; value: T }

/** 공부 탭(/study). 내가 「잘 모르겠어요」, 「공부 중」 으로 표시한 항목을 모은다. 규칙은 docs/flow.md 「공부」 */
export function StudyTab({ onOpenNode, onTrace }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const query = useMemo(() => parseStudyQuery(location.search), [location.search])
  const { level, page: pageNo } = query
  const [list, setList] = useState<Load<Page<StudyItem>>>({ kind: 'loading' })
  const [summary, setSummary] = useState<Load<KnowledgeSummary>>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  /** 주소만 바꾸고 기록을 쌓지 않는다. 쪽 번호가 아닌 조건을 바꾸면 쪽은 0 으로 돌린다 */
  const change = (patch: Partial<StudyQuery>) => {
    const url = TAB_PATHS.study + studySearch({ ...query, page: 0, ...patch })
    if (url !== location.pathname + location.search) navigate(url, { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    setList((l) => (l.kind === 'done' ? l : { kind: 'loading' }))
    api.me.knowledge
      .list({ levels: level ? [level] : STUDY_LEVELS, page: pageNo, size: PAGE_SIZE })
      .then((p) => {
        if (cancelled) return
        // 「이해했어요」 로 끝 쪽이 비면 끝 쪽으로 바꿔 연다.
        const last = Math.max(p.totalPages - 1, 0)
        if (last < pageNo) {
          navigateRef.current(TAB_PATHS.study + studySearch({ level, page: last }), { replace: true })
          return
        }
        setList({ kind: 'done', value: p })
      })
      .catch((e) => !cancelled && setList({ kind: 'error', message: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [level, pageNo, reloadKey])

  useEffect(() => {
    let cancelled = false
    api.me.knowledge
      .summary()
      .then((s) => !cancelled && setSummary({ kind: 'done', value: s }))
      .catch((e) => !cancelled && setSummary({ kind: 'error', message: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  /** 쓰고 나면 요약과 목록을 다시 읽는다. 실패는 카드가 보인다 */
  const write = useCallback(
    async (nodeId: string, next: KnowledgeLevel, note: string | null) => {
      await api.me.knowledge.put(nodeId, next, note)
      reload()
    },
    [reload],
  )

  // 처음에는 둘 다 보인다. 하나만 보일 때 그 칩을 다시 누르면 둘 다로 돌아간다
  const toggleLevel = (target: StudyLevel) => change({ level: level === target ? null : target })

  return (
    <div className="mx-auto max-w-3xl min-w-0 p-4" data-testid="study-tab">
      <StudySummary load={summary} onRetry={reload} />

      <div className="mt-3 flex flex-wrap gap-2">
        {STUDY_LEVELS.map((l) => (
          <Button
            key={l}
            type="button"
            size="sm"
            variant={level === null || level === l ? 'default' : 'outline'}
            aria-pressed={level === null || level === l}
            data-testid="study-filter"
            data-level={l}
            onClick={() => toggleLevel(l)}
          >
            {LEVEL_TEXT[l]}
          </Button>
        ))}
      </div>

      {list.kind === 'loading' && <p className="mt-4 text-muted-foreground">불러오는 중…</p>}
      {list.kind === 'error' && <LoadError message={list.message} onRetry={reload} />}
      {list.kind === 'done' &&
        (list.value.totalItems === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground" data-testid="study-empty">
            아직 공부할 항목이 없습니다. 근거 따라가기나 상세에서 「잘 모르겠어요」 를 누르면 여기에 모입니다.
          </p>
        ) : (
          <>
            <ul className="mt-4 grid gap-3">
              {list.value.items.map((item) => (
                <StudyCard key={item.node.id} item={item} onOpenNode={onOpenNode} onTrace={onTrace} onWrite={write} />
              ))}
            </ul>
            <Pager page={list.value} onPage={(p) => change({ page: p })} testIdPrefix="study-page" />
          </>
        ))}
    </div>
  )
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-box mt-3" data-testid="study-error">
      <p>{message}</p>
      <Button type="button" size="sm" variant="outline" className="mt-2" data-testid="study-retry" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  )
}

/** 위쪽 요약. 개수 줄과 능력 범위 줄이다. 받지 못하면 그 자리에 오류를 보인다 */
export function StudySummary({ load, onRetry }: { load: Load<KnowledgeSummary>; onRetry: () => void }) {
  if (load.kind === 'loading') return <p className="text-muted-foreground">불러오는 중…</p>
  if (load.kind === 'error') return <LoadError message={load.message} onRetry={onRetry} />
  const s = load.value
  const competence = competenceText(s)
  return (
    <section className="grid gap-1">
      <p
        className="flex flex-wrap gap-x-3 gap-y-1 text-sm"
        data-testid="study-counts"
        data-known={s.counts.KNOWN}
        data-unsure={s.counts.UNSURE}
        data-learning={s.counts.LEARNING}
      >
        <span>잘 모름 {s.counts.UNSURE}</span>
        <span>공부 중 {s.counts.LEARNING}</span>
        <span>이해함 {s.counts.KNOWN}</span>
      </p>
      <p className="text-sm font-semibold" data-testid="study-competence" data-total={s.decisions.total} data-understood={s.decisions.understood}>
        {s.decisions.total === 0 ? competence : `내 능력 범위: ${competence}`}
      </p>
    </section>
  )
}

interface CardProps {
  item: StudyItem
  onOpenNode: (id: string) => void
  onTrace: (id: string) => void
  /** 표시를 쓰고 목록을 다시 읽는다. 실패하면 던진다 */
  onWrite: (nodeId: string, level: KnowledgeLevel, note: string | null) => Promise<void>
}

/** 공부 항목 카드. 요청 없이 props 로 그리고, 쓰기는 onWrite 로 넘긴다 */
export function StudyCard({ item, onOpenNode, onTrace, onWrite }: CardProps) {
  const labels = useLabels()
  const { node } = item
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')

  const write = async (level: KnowledgeLevel, note: string | null) => {
    setBusy(true)
    setError(null)
    try {
      await onWrite(node.id, level, note)
      setNoteOpen(false)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      className="grid min-w-0 gap-2 rounded-md border bg-background p-3"
      data-testid="study-item"
      data-node-id={node.id}
      data-level={item.level}
      data-archived={node.archived ? 'true' : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={node.type} />
        <Button
          type="button"
          variant="link"
          className="h-auto min-w-0 px-0 py-0 text-left font-bold whitespace-normal"
          data-testid="study-item-name"
          onClick={() => onOpenNode(node.id)}
        >
          {labels.node(node)}
        </Button>
        {node.archived && <span className="archived-badge">보관됨</span>}
        <span className="text-xs text-muted-foreground">{LEVEL_TEXT[item.level]}</span>
      </div>

      <p className="text-sm text-muted-foreground" data-testid="study-item-context">
        {studyContextText(item)}
      </p>

      {item.note && (
        <p className="text-sm whitespace-pre-wrap break-words" data-testid="study-item-note">
          내 메모: {item.note}
        </p>
      )}

      <ul className="grid gap-0.5 text-sm">
        {studyTodos(item).map(({ kind, label, url, id }, i) => (
          <li key={`${kind}-${id ?? i}`} className="break-words" data-testid="study-todo" data-kind={kind}>
            {kind === 'document' && (
              <a href={url} target="_blank" rel="noreferrer">
                {label}
              </a>
            )}
            {kind === 'concept' && id && (
              <Button type="button" variant="link" size="sm" className="h-auto px-0 py-0 whitespace-normal" onClick={() => onOpenNode(id)}>
                {label}
              </Button>
            )}
            {kind === 'attach' && <span className="text-muted-foreground">{label}</span>}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-1.5">
        {!node.archived && (
          <Button type="button" size="xs" variant="outline" data-testid="study-trace" onClick={() => onTrace(node.id)}>
            근거 따라가기에서 보기
          </Button>
        )}
        {item.level !== 'LEARNING' && (
          <Button type="button" size="xs" variant="outline" data-testid="study-learning" disabled={busy} onClick={() => void write('LEARNING', item.note)}>
            공부 중
          </Button>
        )}
        <Button type="button" size="xs" data-testid="study-known" disabled={busy} onClick={() => void write('KNOWN', item.note)}>
          이해했어요
        </Button>
        {!noteOpen && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            data-testid="study-note-open"
            disabled={busy}
            onClick={() => {
              setNoteText(item.note ?? '')
              setNoteOpen(true)
            }}
          >
            메모 남기기
          </Button>
        )}
        {error && (
          <span className="text-xs text-destructive" role="alert">
            {error}
          </span>
        )}
      </div>

      {noteOpen && (
        <div className="grid gap-1">
          <Textarea data-testid="study-note-input" maxLength={NOTE_MAX} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
          <div className="flex gap-1.5">
            {/* 메모만 바꾸고 카드의 표시는 그대로 둔다 */}
            <Button type="button" size="xs" data-testid="study-note-save" disabled={busy} onClick={() => void write(item.level, noteText.trim() || null)}>
              저장
            </Button>
            <Button type="button" size="xs" variant="outline" data-testid="study-note-cancel" disabled={busy} onClick={() => setNoteOpen(false)}>
              취소
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
