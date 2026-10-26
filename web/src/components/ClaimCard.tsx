import type { ClaimView, NodeRef } from '../api/types'
import { useLabels } from '../context'
import { formatDateTime, orUnknown, userName } from '../lib/format'
import { StatusBadge, TypeBadge } from './TypeBadge'

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

interface Props {
  claim: ClaimView
  onOpenNode?: (id: string) => void
  /** 카드 머리에 「주장 열기」 를 보인다 */
  showOpen?: boolean
}

function RefLink({ node, onOpenNode, testId }: { node: NodeRef | null; onOpenNode?: (id: string) => void; testId: string }) {
  if (!node) return <span className="muted" data-testid={testId}>(알 수 없음)</span>
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
  const labels = useLabels()
  return (
    <div className="claim-card" data-testid="claim-card" data-claim-id={claim.id} data-review-status={claim.reviewStatus}>
      <div className="claim-head">
        <strong data-testid="claim-predicate">{labels.predicate(String(p.predicate))}</strong>
        <StatusBadge status={claim.reviewStatus} />
        {claim.archived && <span className="archived-badge">보관됨</span>}
        {showOpen && onOpenNode && (
          <button className="link-button small" data-testid="claim-open" onClick={() => onOpenNode(claim.id)}>
            주장 열기
          </button>
        )}
      </div>
      <div className="claim-triple">
        <RefLink node={claim.subject} onOpenNode={onOpenNode} testId="claim-subject" />
        <span className="arrow">→</span>
        <RefLink node={claim.object} onOpenNode={onOpenNode} testId="claim-object" />
      </div>
      <dl className="kv">
        <dt>{labels.property('Claim', 'description')}</dt>
        <dd data-testid="claim-description-text">{str(p.description)}</dd>
        <dt>{labels.property('Claim', 'evidenceText')}</dt>
        <dd>
          <blockquote data-testid="claim-evidence-text">{str(p.evidenceText)}</blockquote>
        </dd>
        <dt>{labels.relationship('SUPPORTED_BY')}</dt>
        <dd>
          {claim.documents.length === 0 && <span className="muted">없음</span>}
          {claim.documents.length > 0 && claim.documents.every((d) => d.archived) && (
            <div className="info-box" data-testid="claim-no-active-evidence">
              근거 문서가 모두 보관되었습니다. 근거 문서를 복원하기 전에는 이 주장을 복원하거나 검토 완료할 수 없습니다.
            </div>
          )}
          <ul className="doc-list">
            {claim.documents.map((d) => (
              <li key={d.id} data-testid="claim-document">
                <a href={d.url} target="_blank" rel="noopener noreferrer" data-testid="claim-document-title">
                  {d.title}
                </a>
                {d.archived && <span className="archived-badge">보관됨</span>}
                <div className="muted small">
                  발행 {orUnknown(d.publisher)} · 공개일 {orUnknown(d.publishedAt)} · 수집 {formatDateTime(d.collectedAt)}
                  {d.documentType ? ` · ${labels.value('Document', 'documentType', d.documentType)}` : ''}
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
          <span data-testid="claim-author">{userName(claim.createdBy, '알 수 없음')}</span>
          <span className="muted small">
            {' '}
            {formatDateTime(claim.createdAt)} · {labels.value('Claim', 'authoringMethod', p.authoringMethod || 'MANUAL')}
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
