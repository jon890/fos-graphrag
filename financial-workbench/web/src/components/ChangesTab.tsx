import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, errorMessage } from '../api/client'
import type { ChangeEventView, NodeView, Page, UserRef } from '../api/types'
import { useApp, useLabels } from '../context'
import { changeFieldLabel, changeValueText, REF_KEYS } from '../lib/changes'
import { formatDateTime, userName } from '../lib/format'
import { TAB_PATHS, changesSearch, parseChangesQuery } from '../routes'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { NodePicker } from './NodePicker'
import { Pager } from './Pager'
import { TypeBadge } from './TypeBadge'

interface Props {
  targetId: string
  onTargetIdChange: (id: string) => void
  onOpen: (id: string) => void
}

const ACTION_BADGE: Record<string, { variant: 'secondary' | 'outline'; className?: string }> = {
  CREATE: { variant: 'outline', className: 'border-transparent bg-emerald-100 text-emerald-900' },
  ARCHIVE: { variant: 'secondary' },
  RESTORE: { variant: 'outline', className: 'border-transparent bg-blue-100 text-blue-900' },
}

function ActionBadge({ action, children }: { action: string; children: ReactNode }) {
  const style = ACTION_BADGE[action] ?? { variant: 'outline' as const }
  return (
    <Badge variant={style.variant} className={style.className}>
      {children}
    </Badge>
  )
}

/** 값 하나. 노드 ID 한 개이고 이름을 알면 누르면 그 노드를 여는 링크로, 아니면 글자로 보인다 */
function ChangeValue({ c, k, value, onOpen }: { c: ChangeEventView; k: string; value: unknown; onOpen: (id: string) => void }) {
  const { ontology } = useApp()
  const text = changeValueText(ontology, c.targetType, k, value, c.refs)
  const ref = typeof value === 'string' ? c.refs[value] : undefined
  if (ref && ref.type !== 'User' && REF_KEYS.has(k)) {
    return (
      <Button variant="link" className="h-auto p-0 text-xs" onClick={() => onOpen(ref.id)}>
        {text}
      </Button>
    )
  }
  return <>{text}</>
}

export function ChangeRows({ items, onOpen }: { items: ChangeEventView[]; onOpen: (id: string) => void }) {
  const { ontology } = useApp()
  const labels = useLabels()
  return (
    <>
      {items.map((c) => (
        <TableRow key={c.id} data-testid="change-row" data-action={c.action} data-target-id={c.targetId} title={`수정 번호 ${c.revision}`}>
          <TableCell>{formatDateTime(c.at)}</TableCell>
          <TableCell data-testid="change-actor" title={c.actor?.email}>{userName(c.actor)}</TableCell>
          <TableCell data-testid="change-action">
            <ActionBadge action={c.action}>{labels.action(c.action)}</ActionBadge>
          </TableCell>
          <TableCell>
            {c.targetKind === 'RELATIONSHIP' ? labels.relationship(c.targetType) : labels.type(c.targetType)}
            {c.targetKind === 'RELATIONSHIP' ? ' (관계)' : c.targetKind === 'USER' ? ' (사용자)' : ''}
          </TableCell>
          <TableCell>
            {c.targetKind === 'NODE' ? (
              <Button variant="link" className="h-auto p-0" onClick={() => onOpen(c.targetId)}>
                {labels.node({ type: c.targetType, label: c.targetLabel })}
              </Button>
            ) : (
              c.targetLabel
            )}
          </TableCell>
          <TableCell>
            <ul className="m-0 list-disc pl-4 text-xs">
              {Object.entries(c.changes ?? {}).map(([key, diff]) => (
                <li key={key}>
                  {changeFieldLabel(ontology, c.targetType, key)}: <ChangeValue c={c} k={key} value={diff?.before} onOpen={onOpen} /> →{' '}
                  <ChangeValue c={c} k={key} value={diff?.after} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </TableCell>
          <TableCell>{c.note ?? ''}</TableCell>
        </TableRow>
      ))}
    </>
  )
}

export function ChangesTab({ targetId, onTargetIdChange, onOpen }: Props) {
  const labels = useLabels()
  const location = useLocation()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const query = useMemo(() => parseChangesQuery(location.search), [location.search])
  const { actor, page: pageNo } = query
  const [actors, setActors] = useState<UserRef[]>([])
  const [target, setTarget] = useState<NodeView | null>(null)
  /** 고른 대상이 노드가 아니거나(사용자, 관계 ID) 읽지 못했을 때 true */
  /** 이름을 이미 아는 대상. effect 가 이 값을 보고 다시 읽을지 정한다 */
  const knownTarget = useRef<NodeView | null>(null)
  const [targetUnknown, setTargetUnknown] = useState(false)
  const [page, setPage] = useState<Page<ChangeEventView> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let live = true
    api.changes
      .actors()
      .then((list) => live && setActors(list))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  // 상세에서 들어와 이름을 모르는 대상은 노드로 읽는다. 방금 고른 노드는 이미 이름을 안다.
  useEffect(() => {
    if (!targetId || knownTarget.current?.id === targetId) return
    let live = true
    setTargetUnknown(false)
    api.nodes
      .get(targetId)
      .then((d) => {
        if (!live) return
        knownTarget.current = d.node
        setTarget(d.node)
      })
      .catch(() => {
        if (!live) return
        knownTarget.current = null
        setTarget(null)
        setTargetUnknown(true)
      })
    return () => {
      live = false
    }
  }, [targetId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.changes
      .list({ targetId, actor, page: pageNo, size: 20 })
      .then((p) => {
        if (cancelled) return
        // 쪽 번호가 끝 쪽을 넘으면 끝 쪽으로 바꿔 연다.
        const last = Math.max(p.totalPages - 1, 0)
        if (last < pageNo) {
          navigateRef.current(TAB_PATHS.changes + changesSearch({ target: targetId, actor, page: last }), { replace: true })
          return
        }
        setPage(p)
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [targetId, actor, pageNo])

  return (
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="changes-tab">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        {targetId ? (
          <div className="inline-flex items-center gap-2" data-testid="changes-target-selected">
            {target?.id === targetId ? (
              <>
                <TypeBadge type={target.type} />
                <span>{labels.node(target)}</span>
              </>
            ) : (
              <span>{targetUnknown ? '선택한 항목' : '불러오는 중…'}</span>
            )}
            <Button
              type="button"
              variant="outline"
              data-testid="changes-filter-clear"
              onClick={() => {
                knownTarget.current = null
                setTarget(null)
                onTargetIdChange('')
              }}
            >
              지우기
            </Button>
          </div>
        ) : (
          <NodePicker
            types={[]}
            testIdPrefix="changes-target-picker"
            placeholder="이름이나 종목 코드로 대상 찾기"
            onPick={(node) => {
              knownTarget.current = node
              setTarget(node)
              onTargetIdChange(node.id)
            }}
          />
        )}
        {actors.length > 0 && (
          <label className="inline-flex items-center gap-1.5">
            사용자
            <NativeSelect
              data-testid="changes-actor-filter"
              value={actor}
              onChange={(e) => navigate(TAB_PATHS.changes + changesSearch({ target: targetId, actor: e.target.value, page: 0 }), { replace: true })}
            >
              <NativeSelectOption value="">(모두)</NativeSelectOption>
              {actors.map((u) => (
                <NativeSelectOption key={u.id} value={u.email}>
                  {u.displayName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
        {loading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </div>
      {error && (
        <Alert role={undefined} variant="destructive" className="my-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Table data-testid="changes-table">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>시각</TableHead>
            <TableHead>사용자</TableHead>
            <TableHead>작업</TableHead>
            <TableHead>대상 종류</TableHead>
            <TableHead>대상 이름</TableHead>
            <TableHead>변경 내용</TableHead>
            <TableHead>메모</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page && <ChangeRows items={page.items} onOpen={onOpen} />}
          {page && page.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground" data-testid="changes-empty">
                변경 이력이 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {page && <Pager page={page} onPage={(n) => navigate(TAB_PATHS.changes + changesSearch({ target: targetId, actor, page: n }), { replace: true })} testIdPrefix="changes-pager" />}
    </div>
  )
}
