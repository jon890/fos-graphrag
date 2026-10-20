import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../api/client'
import type { ClaimView, Page, ReviewStatus } from '../api/types'
import { useApp } from '../context'
import { formatDateTime, truncate } from '../lib/format'
import { Pager } from './Pager'
import { TypeBadge } from './TypeBadge'

function ReviewRow({ claim, onDone, onError, onOpen }: { claim: ClaimView; onDone: (m: string) => void; onError: (e: unknown) => void; onOpen: (id: string) => void }) {
  const { user } = useApp()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const own = claim.createdBy.id === user.id

  const review = async (status: ReviewStatus) => {
    setBusy(true)
    try {
      await api.claims.review(claim.id, claim.revision, status, note.trim() || null)
      onDone(`${claim.subject.label} → ${claim.object.label} (${String(claim.properties.predicate ?? claim.label)}) 를 ${status === 'REVIEWED' ? '검토 완료' : '반려'} 처리했습니다.`)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr data-testid="review-row" data-claim-id={claim.id}>
      <td>
        <button className="link-button" onClick={() => onOpen(claim.id)}>
          {String(claim.properties.predicate ?? claim.label)}
        </button>
      </td>
      <td>
        <TypeBadge type={claim.subject.type} /> {claim.subject.label}
      </td>
      <td>
        <TypeBadge type={claim.object.type} /> {claim.object.label}
      </td>
      <td title={String(claim.properties.evidenceText ?? '')}>{truncate(String(claim.properties.evidenceText ?? ''), 50)}</td>
      <td>{claim.createdBy.displayName}</td>
      <td>{formatDateTime(claim.createdAt)}</td>
      <td className="review-actions">
        {own ? (
          <span className="muted small" data-testid="review-own-hint">
            본인이 작성한 Claim 은 검토할 수 없습니다.
          </span>
        ) : null}
        <input data-testid="review-row-note" placeholder="메모(선택)" value={note} disabled={own || busy} onChange={(e) => setNote(e.target.value)} />
        <button className="primary" data-testid="review-row-approve" disabled={own || busy} onClick={() => void review('REVIEWED')}>
          검토 완료
        </button>
        <button className="danger" data-testid="review-row-reject" disabled={own || busy} onClick={() => void review('REJECTED')}>
          반려
        </button>
      </td>
    </tr>
  )
}

export function ReviewTab({ onOpen }: { onOpen: (id: string) => void }) {
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
    <div className="tab-page" data-testid="review-tab">
      <div className="row toolbar">
        <h2>검토 대기 (DRAFT)</h2>
        <button data-testid="review-refresh" onClick={() => void load()}>
          새로고침
        </button>
        {loading && <span className="muted small">불러오는 중…</span>}
      </div>
      {message && (
        <div className="notice notice-success" data-testid="review-message">
          {message}
        </div>
      )}
      {error && (
        <div className="error-box" data-testid="review-error">
          {error}
        </div>
      )}
      <table className="data-table" data-testid="review-table">
        <thead>
          <tr>
            <th>predicate</th>
            <th>주어</th>
            <th>목적어</th>
            <th>근거 문장</th>
            <th>작성자</th>
            <th>생성 시각</th>
            <th>검토</th>
          </tr>
        </thead>
        <tbody>
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
            <tr>
              <td colSpan={7} className="muted" data-testid="review-empty">
                검토를 기다리는 Claim 이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {page && <Pager page={page} onPage={setPageNo} testIdPrefix="review-pager" />}
    </div>
  )
}
