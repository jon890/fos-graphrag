import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, errorMessage } from '../api/client'
import type { ChangeEventView, Ontology, Page } from '../api/types'
import { useApp, useLabels } from '../context'
import { formatDateTime, summarizeValue, userName } from '../lib/format'
import { enumValueLabel, propertyDef, propertyLabel } from '../lib/labels'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Pager } from './Pager'

interface Props {
  targetId: string
  onTargetIdChange: (id: string) => void
  onOpen: (id: string) => void
}

/** 변경 내용 한 줄. 속성 이름과 enum 값은 온톨로지 표시 이름으로 바꾸고, 온톨로지에 없는 키(archived 등)는 그대로 둔다 */
function changeLine(ontology: Ontology, targetType: string, key: string, diff: { before: unknown; after: unknown } | undefined) {
  const def = propertyDef(ontology, targetType, key)
  const show = (v: unknown) => (def?.type === 'enum' && typeof v === 'string' ? enumValueLabel(def, v) : summarizeValue(v))
  return `${show(diff?.before)} → ${show(diff?.after)}`
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

export function ChangeRows({ items, onOpen }: { items: ChangeEventView[]; onOpen: (id: string) => void }) {
  const { ontology } = useApp()
  const labels = useLabels()
  return (
    <>
      {items.map((c) => (
        <TableRow key={c.id} data-testid="change-row" data-action={c.action} data-target-id={c.targetId}>
          <TableCell>{formatDateTime(c.at)}</TableCell>
          <TableCell title={c.actor?.email}>{userName(c.actor)}</TableCell>
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
          <TableCell>{c.revision}</TableCell>
          <TableCell>
            <ul className="m-0 list-disc pl-4 text-xs">
              {Object.entries(c.changes ?? {}).map(([key, diff]) => (
                <li key={key}>
                  <span className={propertyDef(ontology, c.targetType, key) ? undefined : 'font-mono'}>{propertyLabel(ontology, c.targetType, key)}</span>:{' '}
                  {changeLine(ontology, c.targetType, key, diff)}
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
  const [targetInput, setTargetInput] = useState(targetId)
  const [actor, setActor] = useState('')
  const [actorInput, setActorInput] = useState('')
  const [pageNo, setPageNo] = useState(0)
  const [page, setPage] = useState<Page<ChangeEventView> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => setTargetInput(targetId), [targetId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.changes
      .list({ targetId, actor, page: pageNo, size: 20 })
      .then((p) => !cancelled && setPage(p))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [targetId, actor, pageNo])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setPageNo(0)
    setActor(actorInput.trim())
    onTargetIdChange(targetInput.trim())
  }

  return (
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="changes-tab">
      <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={submit}>
        <label className="inline-flex items-center gap-1.5">
          대상 ID
          <Input data-testid="changes-target-filter" className="w-80 font-mono" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-1.5">
          사용자 이메일
          <Input data-testid="changes-actor-filter" className="w-56" type="email" placeholder="alice@example.com" value={actorInput} onChange={(e) => setActorInput(e.target.value)} />
        </label>
        <Button type="submit" variant="outline" data-testid="changes-filter-submit">
          조회
        </Button>
        {targetId && (
          <Button
            type="button"
            variant="outline"
            data-testid="changes-filter-clear"
            onClick={() => {
              setPageNo(0)
              onTargetIdChange('')
            }}
          >
            대상 필터 해제
          </Button>
        )}
        {loading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </form>
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
            <TableHead>수정 번호</TableHead>
            <TableHead>변경 내용</TableHead>
            <TableHead>메모</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page && <ChangeRows items={page.items} onOpen={onOpen} />}
          {page && page.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground" data-testid="changes-empty">
                변경 이력이 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {page && <Pager page={page} onPage={setPageNo} testIdPrefix="changes-pager" />}
    </div>
  )
}
