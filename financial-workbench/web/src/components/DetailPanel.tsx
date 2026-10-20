import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { NodeDetail } from '../api/types'
import { useApp } from '../context'
import { formatDateTime } from '../lib/format'
import { ClaimCard } from './ClaimCard'
import { ClaimCreateForm } from './ClaimCreateForm'
import { ClaimEditForm, ReviewControls } from './ClaimEditor'
import { NodeEditForm } from './NodeEditForm'
import { RelationshipSection } from './RelationshipSection'
import { StatusBadge, TypeBadge } from './TypeBadge'

interface Props {
  selectedId: string | null
  /** 바뀌면 상세를 다시 읽는다 */
  refreshKey: string
  /** 저장, 보관처럼 서버 상태를 바꾼 뒤 부른다. 그래프와 검색 결과를 다시 읽는다 */
  onChanged: () => void
  onFocus: (id: string) => void
  onSelect: (id: string) => void
  onOpenHistory: (id: string) => void
}

type Notice = { kind: 'success' | 'conflict' | 'error'; text: string; sub?: string }

export const CONFLICT_TEXT = '다른 사용자가 먼저 수정했습니다. 최신 내용을 불러왔습니다. 확인한 뒤 다시 수정하세요.'

export function DetailPanel({ selectedId, refreshKey, onChanged, onFocus, onSelect, onOpenHistory }: Props) {
  const { ontology } = useApp()
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [archiveReason, setArchiveReason] = useState('')
  const [addingClaim, setAddingClaim] = useState(false)

  useEffect(() => {
    setNotice(null)
    setAddingClaim(false)
    setArchiveReason('')
  }, [selectedId])

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

  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.code === 'REVISION_CONFLICT') {
      // 덮어쓰지 않는다. 최신 상세를 다시 읽어 폼을 새 값으로 바꾼다.
      setNotice({ kind: 'conflict', text: CONFLICT_TEXT, sub: e.message })
      setReloadKey((k) => k + 1)
      return
    }
    setNotice({ kind: 'error', text: errorMessage(e) })
  }, [])

  if (!selectedId) {
    return (
      <div className="detail-empty muted" data-testid="detail-empty">
        노드를 선택하면 상세가 여기에 나옵니다.
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
        const v = await api.nodes.restore(node.id, node.revision)
        succeed(`복원했습니다 (revision ${v.revision}).`)
      } else {
        const v = await api.nodes.archive(node.id, node.revision, archiveReason.trim() || undefined)
        setArchiveReason('')
        succeed(`보관했습니다 (revision ${v.revision}). 기본 검색과 주변 그래프에서 빠집니다.`)
      }
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="detail-panel" data-testid="detail-panel" data-node-id={node.id} data-node-type={node.type}>
      <div className="detail-head">
        <TypeBadge type={node.type} />
        <h2 data-testid="detail-label">{node.label}</h2>
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
          {notice.sub && notice.sub !== notice.text && <div className="small muted">서버 응답: {notice.sub}</div>}
        </div>
      )}

      <div className="row actions">
        <button className="link-button" data-testid="node-history-link" onClick={() => onOpenHistory(node.id)}>
          이 노드 이력
        </button>
        <button className="link-button" data-testid="node-center-graph" onClick={() => onFocus(node.id)}>
          그래프 중심으로
        </button>
        {!node.archived && (
          <input
            className="reason-input"
            data-testid="node-archive-reason"
            placeholder="보관 사유(선택)"
            value={archiveReason}
            onChange={(e) => setArchiveReason(e.target.value)}
          />
        )}
        <button
          className={node.archived ? '' : 'danger'}
          data-testid={node.archived ? 'node-restore-button' : 'node-archive-button'}
          onClick={() => void archiveOrRestore()}
        >
          {node.archived ? '복원' : '보관'}
        </button>
      </div>

      <dl className="kv meta" data-testid="node-meta">
        <dt>revision</dt>
        <dd data-testid="node-revision">{node.revision}</dd>
        <dt>생성</dt>
        <dd>
          {node.createdBy.displayName} · {formatDateTime(node.createdAt)}
        </dd>
        <dt>수정</dt>
        <dd data-testid="node-updated-by">
          {node.updatedBy.displayName} · {formatDateTime(node.updatedAt)}
        </dd>
        {node.archivedAt && (
          <>
            <dt>보관</dt>
            <dd>{formatDateTime(node.archivedAt)}</dd>
          </>
        )}
        <dt>ID</dt>
        <dd className="mono small">{node.id}</dd>
      </dl>

      {claim ? (
        <section className="detail-section">
          <h3>Claim</h3>
          <ClaimCard claim={claim} onOpenNode={onSelect} />
          <ReviewControls claim={claim} onDone={succeed} onError={fail} />
          <ClaimEditForm key={`${claim.id}:${claim.revision}`} claim={claim} onSaved={succeed} onError={fail} />
        </section>
      ) : (
        <section className="detail-section">
          <h3>속성</h3>
          <div className="hint">{ontology.nodeTypes[node.type]?.description}</div>
          <NodeEditForm
            key={`${node.id}:${node.revision}`}
            node={node}
            onSaved={(v) => succeed(`저장했습니다 (revision ${v.revision}).`)}
            onError={fail}
          />
        </section>
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

      <section className="detail-section" data-testid="node-claims-section">
        <h3>이 노드에 걸린 Claim ({detail.claims.length})</h3>
        {detail.claims.length === 0 && <div className="muted small">걸린 Claim 이 없습니다.</div>}
        {detail.claims.map((c) => (
          <ClaimCard key={c.id} claim={c} onOpenNode={onSelect} showOpen />
        ))}
        {hasClaimPredicates && !claim && !addingClaim && (
          <button data-testid="claim-add-toggle" disabled={node.archived} onClick={() => setAddingClaim(true)}>
            Claim 추가
          </button>
        )}
        {addingClaim && (
          <ClaimCreateForm
            subject={node}
            onCancel={() => setAddingClaim(false)}
            onCreated={() => {
              setAddingClaim(false)
              succeed('Claim 을 만들었습니다. 다른 사용자의 검토를 기다립니다.')
            }}
          />
        )}
      </section>
    </div>
  )
}
