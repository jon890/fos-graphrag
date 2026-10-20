import type { ClaimView, NodeRef } from '../api/types'
import { formatDateTime, orUnknown } from '../lib/format'
import { StatusBadge, TypeBadge } from './TypeBadge'

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

interface Props {
  claim: ClaimView
  onOpenNode?: (id: string) => void
  /** 카드 머리에 「Claim 열기」 를 보인다 */
  showOpen?: boolean
}

function RefLink({ node, onOpenNode, testId }: { node: NodeRef; onOpenNode?: (id: string) => void; testId: string }) {
  return (
    <button className="link-button" data-testid={testId} disabled={!onOpenNode} onClick={() => onOpenNode?.(node.id)}>
      <TypeBadge type={node.type} /> {node.label}
      {node.archived && <span className="archived-badge">보관됨</span>}
    </button>
  )
}

/** Claim 하나의 내용, 근거, 검토 정보를 보인다. */
export function ClaimCard({ claim, onOpenNode, showOpen }: Props) {
  const p = claim.properties
  return (
    <div className="claim-card" data-testid="claim-card" data-claim-id={claim.id} data-review-status={claim.reviewStatus}>
      <div className="claim-head">
        <strong data-testid="claim-predicate">{str(p.predicate) || claim.label}</strong>
        <StatusBadge status={claim.reviewStatus} />
        {claim.archived && <span className="archived-badge">보관됨</span>}
        <span className="muted small">rev {claim.revision}</span>
        {showOpen && onOpenNode && (
          <button className="link-button small" data-testid="claim-open" onClick={() => onOpenNode(claim.id)}>
            Claim 열기
          </button>
        )}
      </div>
      <div className="claim-triple">
        <RefLink node={claim.subject} onOpenNode={onOpenNode} testId="claim-subject" />
        <span className="arrow">→</span>
        <RefLink node={claim.object} onOpenNode={onOpenNode} testId="claim-object" />
      </div>
      <dl className="kv">
        <dt>설명</dt>
        <dd data-testid="claim-description-text">{str(p.description)}</dd>
        <dt>근거 문장</dt>
        <dd>
          <blockquote data-testid="claim-evidence-text">{str(p.evidenceText)}</blockquote>
        </dd>
        <dt>출처 문서</dt>
        <dd>
          {claim.documents.length === 0 && <span className="muted">없음</span>}
          <ul className="doc-list">
            {claim.documents.map((d) => (
              <li key={d.id} data-testid="claim-document">
                <a href={d.url} target="_blank" rel="noopener noreferrer" data-testid="claim-document-title">
                  {d.title}
                </a>
                {d.archived && <span className="archived-badge">보관됨</span>}
                <div className="muted small">
                  발행 {orUnknown(d.publisher)} · 공개일 {orUnknown(d.publishedAt)} · 수집 {formatDateTime(d.collectedAt)}
                  {d.documentType ? ` · ${d.documentType}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </dd>
        <dt>유효기간</dt>
        <dd>
          <span data-testid="claim-valid-from">{orUnknown(p.validFrom)}</span> ~ <span data-testid="claim-valid-to">{orUnknown(p.validTo)}</span>
        </dd>
        <dt>작성</dt>
        <dd>
          <span data-testid="claim-author">{claim.createdBy.displayName}</span>
          <span className="muted small">
            {' '}
            {formatDateTime(claim.createdAt)} · {str(p.authoringMethod) || 'MANUAL'}
            {p.extractionConfidence !== undefined && p.extractionConfidence !== null ? ` · 확신도 ${p.extractionConfidence}` : ''}
          </span>
        </dd>
        <dt>검토</dt>
        <dd>
          {claim.reviewedBy ? (
            <>
              <span data-testid="claim-reviewer">{claim.reviewedBy.displayName}</span>
              <span className="muted small" data-testid="claim-reviewed-at">
                {' '}
                {formatDateTime(claim.reviewedAt)}
              </span>
              {claim.reviewNote && (
                <div className="small" data-testid="claim-review-note">
                  메모: {claim.reviewNote}
                </div>
              )}
            </>
          ) : (
            <span className="muted">검토 전</span>
          )}
        </dd>
      </dl>
    </div>
  )
}
