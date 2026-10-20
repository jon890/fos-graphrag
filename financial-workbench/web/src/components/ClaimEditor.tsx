import { useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { ClaimView, PatchClaimRequest, ReviewStatus } from '../api/types'
import { useApp, useLabels } from '../context'

interface ReviewProps {
  claim: ClaimView
  onDone: (message: string) => void
  onError: (e: unknown) => void
}

/** 검토 버튼. 자기 주장은 비활성이다(서버도 403 SELF_REVIEW_FORBIDDEN 을 낸다). */
export function ReviewControls({ claim, onDone, onError }: ReviewProps) {
  const { user } = useApp()
  const labels = useLabels()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const own = claim.createdBy?.id === user.id
  const disabled = busy || own || claim.archived

  const review = async (status: ReviewStatus) => {
    setBusy(true)
    try {
      await api.claims.review(claim.id, claim.revision, status, note.trim() || null)
      setNote('')
      onDone(status === 'DRAFT' ? `${labels.status(status)} 상태로 되돌렸습니다.` : `${labels.status(status)} 처리했습니다.`)
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sub-form" data-testid="review-controls">
      <h4>검토</h4>
      {own && (
        <div className="info-box" data-testid="self-review-hint">
          본인이 작성한 주장은 다른 사용자가 검토해야 합니다.
        </div>
      )}
      {claim.archived && <div className="info-box">보관된 주장은 검토할 수 없습니다.</div>}
      {!claim.archived && claim.documents.every((d) => d.archived) && (
        <div className="info-box">활성 근거 문서가 없어 {labels.status('REVIEWED')} 처리할 수 없습니다. {labels.status('REJECTED')} 처리나 {labels.status('DRAFT')} 상태로 되돌리기는 할 수 있습니다.</div>
      )}
      <input data-testid="review-note" placeholder="검토 메모(선택)" value={note} disabled={disabled} onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <button
          className="primary"
          data-testid="review-approve"
          disabled={disabled || claim.documents.every((d) => d.archived)}
          onClick={() => void review('REVIEWED')}>
          {labels.status('REVIEWED')}
        </button>
        <button className="danger" data-testid="review-reject" disabled={disabled} onClick={() => void review('REJECTED')}>
          {labels.status('REJECTED')}
        </button>
        <button data-testid="review-draft" disabled={disabled || claim.reviewStatus === 'DRAFT'} onClick={() => void review('DRAFT')}>
          {labels.status('DRAFT')} 상태로 되돌리기
        </button>
      </div>
    </div>
  )
}

function asString(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

interface EditProps {
  claim: ClaimView
  onSaved: (message: string) => void
  onError: (e: unknown) => void
}

/** 주장 내용 수정. 부모가 key 에 revision 을 넣는다. 바뀐 필드만 보낸다. */
export function ClaimEditForm({ claim, onSaved, onError }: EditProps) {
  const p = claim.properties
  const labels = useLabels()
  // 확신도는 AI 가 뽑은 주장에만 뜻이 있다. 직접 쓴 주장에는 칸을 보이지 않는다.
  const showConfidence = p.authoringMethod === 'AI' || (p.extractionConfidence !== undefined && p.extractionConfidence !== null)
  const [description, setDescription] = useState(asString(p.description))
  const [evidenceText, setEvidenceText] = useState(asString(p.evidenceText))
  const [validFrom, setValidFrom] = useState(asString(p.validFrom))
  const [validTo, setValidTo] = useState(asString(p.validTo))
  const [confidence, setConfidence] = useState(asString(p.extractionConfidence))
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const body: PatchClaimRequest = { expectedRevision: claim.revision }
    if (description.trim() !== asString(p.description)) body.description = description.trim()
    if (evidenceText.trim() !== asString(p.evidenceText)) body.evidenceText = evidenceText.trim()
    if (validFrom !== asString(p.validFrom)) body.validFrom = validFrom || null
    if (validTo !== asString(p.validTo)) body.validTo = validTo || null
    if (confidence.trim() !== asString(p.extractionConfidence)) {
      const n = confidence.trim() === '' ? null : Number(confidence)
      if (n !== null && (!Number.isFinite(n) || n < 0 || n > 1)) {
        setMessage('확신도는 0 이상 1 이하의 숫자여야 합니다.')
        return
      }
      body.extractionConfidence = n
    }
    if (!body.description && body.description !== undefined) {
      setMessage('설명은 비울 수 없습니다.')
      return
    }
    if (!body.evidenceText && body.evidenceText !== undefined) {
      setMessage('근거 문장은 비울 수 없습니다.')
      return
    }
    if (Object.keys(body).length === 1) {
      setMessage('바뀐 내용이 없습니다.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await api.claims.patch(claim.id, body)
      onSaved('주장을 수정했습니다. 다시 검토를 받아야 합니다.')
    } catch (err) {
      onError(err)
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || claim.archived
  return (
    <form className="sub-form" onSubmit={submit} data-testid="claim-edit-form">
      <h4>내용 수정</h4>
      <div className="hint">
        내용을 고치면 다시 검토를 받아야 합니다. 바꿀 수 없는 것: {labels.property('Claim', 'predicate')}, {labels.relationship('SUBJECT')},{' '}
        {labels.relationship('OBJECT')}, {labels.relationship('SUPPORTED_BY')}
      </div>
      <div className="field">
        <label>{labels.property('Claim', 'description')}</label>
        <textarea data-testid="claim-edit-description" rows={2} value={description} disabled={disabled} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field">
        <label>{labels.property('Claim', 'evidenceText')}</label>
        <textarea data-testid="claim-edit-evidence" rows={3} value={evidenceText} disabled={disabled} onChange={(e) => setEvidenceText(e.target.value)} />
      </div>
      <div className="row">
        <label className="field-inline">
          {labels.property('Claim', 'validFrom')}
          <input type="date" data-testid="claim-edit-valid-from" value={validFrom} disabled={disabled} onChange={(e) => setValidFrom(e.target.value)} />
        </label>
        <label className="field-inline">
          {labels.property('Claim', 'validTo')}
          <input type="date" data-testid="claim-edit-valid-to" value={validTo} disabled={disabled} onChange={(e) => setValidTo(e.target.value)} />
        </label>
        {showConfidence && (
          <label className="field-inline">
            {labels.property('Claim', 'extractionConfidence')}
            <input
              type="number"
              step="any"
              min={0}
              max={1}
              data-testid="claim-edit-confidence"
              value={confidence}
              disabled={disabled}
              onChange={(e) => setConfidence(e.target.value)}
            />
          </label>
        )}
      </div>
      {message && (
        <div className="info-box" data-testid="claim-edit-message">
          {message}
        </div>
      )}
      <button type="submit" className="primary" disabled={disabled} data-testid="claim-edit-submit">
        저장
      </button>
    </form>
  )
}
