import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { ClaimView, Page, ReviewStatus } from '../api/types'
import { useApp, useLabels } from '../context'
import { formatDateTime, truncate, userName } from '../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pager } from './Pager'
import { TypeBadge } from './TypeBadge'

export function ReviewRow({ claim, onDone, onError, onOpen }: { claim: ClaimView; onDone: (m: string) => void; onError: (e: unknown) => void; onOpen: (id: string) => void }) {
  const { user, canEdit } = useApp()
  const labels = useLabels()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const own = claim.createdBy?.id === user.id
  // 서버는 마지막으로 내용을 고친 사람도 막을 수 있다. 그때는 403 SELF_REVIEW_FORBIDDEN 메시지를 보인다.
  const blocked = own || !canEdit

  const review = async (status: ReviewStatus) => {
    setBusy(true)
    try {
      await api.claims.review(claim.id, claim.revision, status, note.trim() || null)
      onDone(`「${labels.node(claim)}」 주장을 ${labels.status(status)} 처리했습니다.`)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <TableRow data-testid="review-row" data-claim-id={claim.id}>
      <TableCell>
        <Button variant="link" className="h-auto p-0" onClick={() => onOpen(claim.id)}>
          {labels.predicate(String(claim.properties.predicate))}
        </Button>
      </TableCell>
      <TableCell>{claim.subject ? <><TypeBadge type={claim.subject.type} /> {claim.subject.label}</> : <span className="text-muted-foreground">(알 수 없음)</span>}</TableCell>
      <TableCell>{claim.object ? <><TypeBadge type={claim.object.type} /> {claim.object.label}</> : <span className="text-muted-foreground">(알 수 없음)</span>}</TableCell>
      <TableCell title={String(claim.properties.evidenceText ?? '')}>{truncate(String(claim.properties.evidenceText ?? ''), 50)}</TableCell>
      <TableCell>{userName(claim.createdBy, '알 수 없음')}</TableCell>
      <TableCell>{formatDateTime(claim.createdAt)}</TableCell>
      <TableCell>
        <div className="flex min-w-70 flex-wrap items-center gap-1">
          {!canEdit ? (
            <span className="text-xs text-muted-foreground" data-testid="review-viewer-hint">
              열람자는 검토할 수 없습니다.
            </span>
          ) : own ? (
            <span className="text-xs text-muted-foreground" data-testid="review-own-hint">
              본인이 작성한 주장은 검토할 수 없습니다.
            </span>
          ) : null}
          <Input className="w-30" data-testid="review-row-note" placeholder="메모(선택)" value={note} disabled={blocked || busy} onChange={(e) => setNote(e.target.value)} />
          <Button data-testid="review-row-approve" disabled={blocked || busy} onClick={() => void review('REVIEWED')}>
            {labels.status('REVIEWED')}
          </Button>
          <Button variant="destructive" data-testid="review-row-reject" disabled={blocked || busy} onClick={() => void review('REJECTED')}>
            {labels.status('REJECTED')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function ReviewTab({ onOpen }: { onOpen: (id: string) => void }) {
  const labels = useLabels()
  const [pageNo, setPageNo] = useState(0)
  const [page, setPage] = useState<Page<ClaimView> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const p = await api.claims.list({ reviewStatus: 'DRAFT', page: pageNo, size: 20 })
      // 마지막 쪽을 다 처리해 빈 쪽이 되면 앞 쪽으로 간다.
      if (p.items.length === 0 && pageNo > 0) setPageNo(pageNo - 1)
      else setPage(p)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [pageNo])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="review-tab">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-2 text-lg font-bold">검토 대기</h2>
        <Button variant="outline" data-testid="review-refresh" onClick={() => void load()}>
          새로고침
        </Button>
        {loading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </div>
      {message && (
        <Alert role={undefined} className="my-2 border-emerald-300 bg-emerald-50" data-testid="review-message">
          <AlertDescription className="text-emerald-900">{message}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert role={undefined} variant="destructive" className="my-2" data-testid="review-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Table data-testid="review-table">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>{labels.property('Claim', 'predicate')}</TableHead>
            <TableHead>{labels.relationship('SUBJECT')}</TableHead>
            <TableHead>{labels.relationship('OBJECT')}</TableHead>
            <TableHead>{labels.property('Claim', 'evidenceText')}</TableHead>
            <TableHead>작성자</TableHead>
            <TableHead>생성 시각</TableHead>
            <TableHead>검토</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page?.items.map((c) => (
            <ReviewRow
              key={`${c.id}:${c.revision}`}
              claim={c}
              onOpen={onOpen}
              onDone={(m) => {
                setError(null)
                setMessage(m)
                void load()
              }}
              onError={(e) => {
                setMessage(null)
                setError(errorMessage(e))
                void load()
              }}
            />
          ))}
          {page && page.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground" data-testid="review-empty">
                검토를 기다리는 주장이 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {page && <Pager page={page} onPage={setPageNo} testIdPrefix="review-pager" />}
    </div>
  )
}
