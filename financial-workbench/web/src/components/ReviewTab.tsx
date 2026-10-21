import { useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { ClaimView, Page, ReviewStatus } from '../api/types'
import { useApp, useLabels } from '../context'
import { formatDateTime, truncate, userName } from '../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CopyLinkButton } from './CopyLinkButton'
import { Pager } from './Pager'
import { TypeBadge } from './TypeBadge'

export function ReviewRow({ claim, onDone, onError, onOpen }: { claim: ClaimView; onDone: (m: string) => void; onError: (e: unknown) => void; onOpen: (id: string) => void }) {
  const { user, canEdit } = useApp()
  const labels = useLabels()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  // 서버는 작성자와 마지막으로 내용을 고친 사람을 모두 막는다(403 SELF_REVIEW_FORBIDDEN).
  const own = claim.createdBy?.id === user.id || claim.contentUpdatedBy?.id === user.id
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
              내가 쓰거나 마지막으로 고친 주장은 다른 편집자가 검토합니다.
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

/** 내가 쓰거나 고친 주장 한 줄. 검토는 다른 편집자가 하므로 검토 단추 대신 링크 복사를 둔다. */
function ReviewMineRow({ claim, onOpen }: { claim: ClaimView; onOpen: (id: string) => void }) {
  const labels = useLabels()
  return (
    <TableRow data-testid="review-mine-row" data-claim-id={claim.id}>
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
          <span className="text-xs text-muted-foreground">다른 편집자가 검토합니다. 링크를 복사해 검토를 요청하세요.</span>
          <CopyLinkButton nodeId={claim.id} testId="review-mine-copy-link" />
        </div>
      </TableCell>
    </TableRow>
  )
}

interface SectionProps {
  /** 없으면 scope 없이 DRAFT 한 목록이다(열람자) */
  scope?: 'reviewable' | 'mine'
  title: string
  testIdPrefix: string
  emptyText: string
  /** 바뀌면 다시 읽는다 */
  refreshKey: number
  onOpen: (id: string) => void
  onDone: (message: string) => void
  onError: (e: unknown) => void
}

/** 검토 대기 목록 하나. 쪽 번호와 목록을 구역마다 따로 들고 있다. */
function ReviewSection({ scope, title, testIdPrefix, emptyText, refreshKey, onOpen, onDone, onError }: SectionProps) {
  const labels = useLabels()
  const [pageNo, setPageNo] = useState(0)
  const [page, setPage] = useState<Page<ClaimView> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const mine = scope === 'mine'

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    api.claims
      .list({ reviewStatus: 'DRAFT', scope, page: pageNo, size: 20 })
      .then((p) => {
        if (!live) return
        // 마지막 쪽을 다 처리해 빈 쪽이 되면 앞 쪽으로 간다.
        if (p.items.length === 0 && pageNo > 0) setPageNo(pageNo - 1)
        else setPage(p)
      })
      .catch((e) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // refreshKey 는 읽기를 다시 시키는 신호다.
  }, [scope, pageNo, refreshKey])

  return (
    <section className="mb-6" data-testid={scope ? `review-section-${scope}` : undefined}>
      {/* 열람자의 한 목록은 탭 제목이 곧 제목이라 구역 제목을 두지 않는다. */}
      {scope && <h3 className="mb-2 mt-0 text-base font-bold">{title}</h3>}
      {loading && <div className="mb-1 text-xs text-muted-foreground">불러오는 중…</div>}
      {error && (
        <Alert role={undefined} variant="destructive" className="my-2" data-testid={`${testIdPrefix}-load-error`}>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Table data-testid={`${testIdPrefix}-table`}>
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
          {page?.items.map((c) =>
            mine ? (
              <ReviewMineRow key={`${c.id}:${c.revision}`} claim={c} onOpen={onOpen} />
            ) : (
              <ReviewRow key={`${c.id}:${c.revision}`} claim={c} onOpen={onOpen} onDone={onDone} onError={onError} />
            ),
          )}
          {page && page.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground" data-testid={`${testIdPrefix}-empty`}>
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {page && <Pager page={page} onPage={setPageNo} testIdPrefix={`${testIdPrefix}-pager`} />}
    </section>
  )
}

export function ReviewTab({ onOpen }: { onOpen: (id: string) => void }) {
  const { canEdit } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((n) => n + 1)

  const done = (m: string) => {
    setError(null)
    setMessage(m)
    refresh()
  }
  const failed = (e: unknown) => {
    setMessage(null)
    setError(errorMessage(e))
    refresh()
  }

  return (
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="review-tab">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-2 text-lg font-bold">검토 대기</h2>
        <Button variant="outline" data-testid="review-refresh" onClick={refresh}>
          새로고침
        </Button>
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
      {canEdit ? (
        <>
          <ReviewSection
            scope="reviewable"
            title="내가 검토할 주장"
            testIdPrefix="review"
            emptyText="검토를 기다리는 주장이 없습니다."
            refreshKey={refreshKey}
            onOpen={onOpen}
            onDone={done}
            onError={failed}
          />
          <ReviewSection
            scope="mine"
            title="내가 쓰거나 고친 주장"
            testIdPrefix="review-mine"
            emptyText="내가 쓰고 아직 검토되지 않은 주장이 없습니다."
            refreshKey={refreshKey}
            onOpen={onOpen}
            onDone={done}
            onError={failed}
          />
        </>
      ) : (
        <ReviewSection
          title="검토 대기"
          testIdPrefix="review"
          emptyText="검토를 기다리는 주장이 없습니다."
          refreshKey={refreshKey}
          onOpen={onOpen}
          onDone={done}
          onError={failed}
        />
      )}
    </div>
  )
}
