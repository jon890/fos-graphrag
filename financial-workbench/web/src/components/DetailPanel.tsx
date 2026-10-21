import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { NodeDetail } from '../api/types'
import { useApp, useLabels } from '../context'
import type { EditDraft } from '../lib/conflict'
import { formatDateTime, userName } from '../lib/format'
import { ClaimCard } from './ClaimCard'
import { ClaimCreateForm } from './ClaimCreateForm'
import { ClaimEditForm, ReviewControls } from './ClaimEditor'
import { CopyLinkButton } from './CopyLinkButton'
import { NodeEditForm } from './NodeEditForm'
import { RelationshipSection } from './RelationshipSection'
import { StatusBadge, TypeBadge } from './TypeBadge'

interface Props {
  selectedId: string | null
  /** 바뀌면 상세를 다시 읽는다 */
  refreshKey: string
  /** 저장, 보관처럼 서버 상태를 바꾼 뒤 부른다. 그래프와 검색 결과를 다시 읽는다 */
  onChanged: () => void
  /** 방금 만든 노드를 열었을 때 상세 위에 보일 성공 안내 */
  flash?: { id: string; text: string; kind?: 'success' | 'error' } | null
  onFocus: (id: string) => void
  onSelect: (id: string) => void
  onOpenHistory: (id: string) => void
}

type Notice = { kind: 'success' | 'conflict' | 'error'; text: string; actions?: { label: string; onClick: () => void }[] }

export const CONFLICT_TEXT = '다른 탭이나 다른 사용자가 먼저 저장했습니다. 최신 내용을 불러왔습니다.'

export function DetailPanel({ selectedId, refreshKey, onChanged, flash, onFocus, onSelect, onOpenHistory }: Props) {
  const { ontology, canEdit } = useApp()
  const labels = useLabels()
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [archiveReason, setArchiveReason] = useState('')
  const [addingClaim, setAddingClaim] = useState(false)
  const [draft, setDraft] = useState<EditDraft | null>(null)

  useEffect(() => {
    setNotice(flash && flash.id === selectedId ? { kind: flash.kind ?? 'success', text: flash.text } : null)
    setAddingClaim(false)
    setArchiveReason('')
    setDraft(null)
  }, [selectedId, flash])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    api.nodes
      .get(selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((e) => {
        if (!cancelled) {
          setDetail(null)
          setLoadError(errorMessage(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, refreshKey, reloadKey])

  const succeed = useCallback(
    (text: string) => {
      setNotice({ kind: 'success', text })
      onChanged()
    },
    [onChanged],
  )

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') {
        // 덮어쓰지 않는다. 최신 상세를 다시 읽어 폼을 새 값으로 바꾼다.
        setNotice({ kind: 'conflict', text: CONFLICT_TEXT })
        setReloadKey((k) => k + 1)
        return
      }
      if (e instanceof ApiError && e.code === 'LAST_EVIDENCE') {
        // 이 문서만 근거로 쓰는 주장으로 바로 갈 수 있게 한다. 화면에서 근거를 더하는 기능은 없다.
        const ids = Array.isArray(e.details?.claimIds) ? (e.details.claimIds as unknown[]).filter((id): id is string => typeof id === 'string') : []
        setNotice({
          kind: 'error',
          text: errorMessage(e),
          actions: ids.map((id, i) => ({ label: ids.length > 1 ? `주장 ${i + 1} 열기` : '주장 열기', onClick: () => onSelect(id) })),
        })
        return
      }
      setNotice({ kind: 'error', text: errorMessage(e) })
    },
    [onSelect],
  )

  if (!selectedId) {
    return (
      <div className="detail-empty muted" data-testid="detail-empty">
        항목을 선택하면 상세가 여기에 나옵니다.
      </div>
    )
  }
  if (loadError && !detail) {
    return (
      <div className="error-box" data-testid="detail-error">
        {loadError}
      </div>
    )
  }
  if (!detail) return <div className="muted">불러오는 중…</div>

  const { node, claim } = detail
  const hasClaimPredicates = Object.values(ontology.claimPredicates).some((p) => p.subjectTypes.includes(node.type))

  const archiveOrRestore = async () => {
    try {
      if (node.archived) {
        await api.nodes.restore(node.id, node.revision)
        succeed('복원했습니다.')
      } else {
        await api.nodes.archive(node.id, node.revision, archiveReason.trim() || undefined)
        setArchiveReason('')
        succeed('보관했습니다. 기본 검색과 주변 그래프에서 빠집니다.')
      }
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="detail-panel" data-testid="detail-panel" data-node-id={node.id} data-node-type={node.type}>
      <div className="detail-head">
        <TypeBadge type={node.type} />
        <h2 data-testid="detail-label">{labels.node(node)}</h2>
        <StatusBadge status={node.reviewStatus} />
        {node.archived && (
          <span className="archived-badge" data-testid="detail-archived">
            보관됨
          </span>
        )}
        {loading && <span className="muted small">갱신 중…</span>}
      </div>

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status" data-testid="detail-notice" data-kind={notice.kind}>
          {notice.text}
          {notice.actions && notice.actions.length > 0 && (
            <div className="row">
              {notice.actions.map((a) => (
                <button key={a.label} type="button" data-testid="notice-action" onClick={a.onClick}>
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row actions">
        <button className="link-button" data-testid="node-history-link" onClick={() => onOpenHistory(node.id)}>
          이 항목의 변경 이력
        </button>
        <button className="link-button" data-testid="node-center-graph" onClick={() => onFocus(node.id)}>
          그래프 중심으로
        </button>
        <CopyLinkButton nodeId={node.id} testId="node-copy-link" />
        {canEdit && !node.archived && (
          <input
            className="reason-input"
            data-testid="node-archive-reason"
            placeholder="보관 사유(선택)"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
          />
        )}
        {canEdit && (
        <button
          className={node.archived ? '' : 'danger'}
          data-testid={node.archived ? 'node-restore-button' : 'node-archive-button'}
          onClick={() => void archiveOrRestore()}
        >
          {node.archived ? '복원' : '보관'}
        </button>
        )}
      </div>

      {!canEdit && (
        <div className="info-box" data-testid="viewer-hint">
          열람자는 조회만 할 수 있습니다. 수정, 검토, 보관은 편집자에게 요청하세요.
        </div>
      )}

      <dl className="kv meta" data-testid="node-meta">
        <dt>생성</dt>
        <dd>
          {userName(node.createdBy)} · {formatDateTime(node.createdAt)}
        </dd>
        <dt>수정</dt>
        <dd data-testid="node-updated-by">
          {userName(node.updatedBy)} · {formatDateTime(node.updatedAt)}
        </dd>
        {node.archivedAt && (
          <>
            <dt>보관</dt>
            <dd>{formatDateTime(node.archivedAt)}</dd>
          </>
        )}
      </dl>
      <details className="meta-details" data-testid="node-meta-details">
        <summary>자세히</summary>
        <dl className="kv meta">
          <dt>revision</dt>
          <dd data-testid="node-revision">{node.revision}</dd>
          <dt>ID</dt>
          <dd className="mono small">{node.id}</dd>
        </dl>
      </details>

      {claim ? (
        <section className="detail-section">
          <h3>{labels.type(node.type)}</h3>
          <ClaimCard claim={claim} onOpenNode={onSelect} />
          {canEdit && (
            <>
              <ReviewControls claim={claim} onDone={succeed} onError={fail} />
              <ClaimEditForm key={`${claim.id}:${claim.revision}`} claim={claim} onSaved={succeed} onError={fail} />
            </>
          )}
        </section>
      ) : (
        <section className="detail-section">
          <h3>속성</h3>
          <div className="hint">{ontology.nodeTypes[node.type]?.description}</div>
          <NodeEditForm
            key={`${node.id}:${node.revision}`}
            node={node}
            onSaved={() => {
              setDraft(null)
              succeed('저장했습니다.')
            }}
            onError={fail}
            draft={draft}
            onConflict={setDraft}
            onDraftDone={() => setDraft(null)}
          />
        </section>
      )}

      {!claim && detail.relationshipsTruncated && (
        <div className="info-box" data-testid="detail-relationships-truncated">
          관계가 많아 처음 {detail.limits.maxRelationships}개만 보입니다. 전체는 목록 탭이나 그래프에서 확인하세요.
        </div>
      )}
      {!claim && (
        <RelationshipSection
          node={node}
          relationships={detail.relationships}
          onChanged={succeed}
          onError={fail}
          onOpenNode={onSelect}
        />
      )}

      {!claim && (
        <section className="detail-section" data-testid="node-claims-section">
          <h3>이 항목에 걸린 주장 ({detail.claims.length})</h3>
          {detail.claims.length === 0 && <div className="muted small">걸린 주장이 없습니다.</div>}
          {detail.claimsTruncated && (
            <div className="info-box" data-testid="detail-claims-truncated">
              주장이 많아 오래된 것부터 {detail.limits.maxClaims}개만 보입니다. 전체는 검토 대기 탭이나 그래프에서 확인하세요.
            </div>
          )}
          {detail.claims.map((c) => (
            <ClaimCard key={c.id} claim={c} onOpenNode={onSelect} showOpen />
          ))}
          {canEdit && hasClaimPredicates && !addingClaim && (
            <button data-testid="claim-add-toggle" disabled={node.archived} onClick={() => setAddingClaim(true)}>
              주장 추가
            </button>
          )}
          {canEdit && addingClaim && (
            <ClaimCreateForm
              initialSubject={node}
              onCancel={() => setAddingClaim(false)}
              onCreated={() => {
                setAddingClaim(false)
                succeed('주장을 만들었습니다. 다른 편집자의 검토를 기다립니다.')
              }}
            />
          )}
        </section>
      )}
    </div>
  )
}
