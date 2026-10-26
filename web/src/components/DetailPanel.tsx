import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { ConceptRef, NodeDetail, NodeView } from '../api/types'
import { useApp, useLabels } from '../context'
import type { EditDraft } from '../lib/conflict'
import { formatDate, formatDateTime, userName } from '../lib/format'
import { withJosa } from '../lib/labels'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ClaimCard } from './ClaimCard'
import { ClaimCreateForm } from './ClaimCreateForm'
import { ClaimEditForm, ReviewControls } from './ClaimEditor'
import { CopyLinkResult, useCopyLink } from './CopyLinkButton'
import { useGuide, type GuidePrefill } from './guide/GuideProvider'
import { ConceptChips } from './learning/ConceptChips'
import { ConceptSections } from './learning/ConceptSections'
import { KnowledgeMarkControls } from './learning/KnowledgeMarkControls'
import { NodeEditForm } from './NodeEditForm'
import { NodeReadCard } from './NodeReadCard'
import { RelationshipSection } from './RelationshipSection'
import { TradeList } from './trades/TradeList'
import { StatusBadge, TypeBadge } from './TypeBadge'
import { UndefinedTypeProperties } from './UndefinedTypeProperties'

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
  /** 그 항목의 근거 따라가기를 연다 */
  onTrace: (id: string) => void
}

/** 개념 노드 타입. 개념 노드의 상세는 개념 칩 줄을 그리지 않는다. 서버 LearningRules 의 개념 타입 이름과 같다 */
const CONCEPT_TYPE = 'Concept'

interface NodeActionsProps {
  node: NodeView
  /** 「편집」 을 보일지. 편집 권한이 있고 보관되지 않았고 타입이 정의돼 있을 때다 */
  canEdit: boolean
  editing: boolean
  onEdit: () => void
  onFocus: (id: string) => void
  onTrace: (id: string) => void
  /** 「⋯」 메뉴 */
  menu: ReactNode
}

/** 상세의 버튼 줄. 「편집」, 「그래프 중심으로」, 「근거 따라가기」(보관되지 않았을 때), 「⋯」 메뉴 순서다 */
export function NodeActions({ node, canEdit, editing, onEdit, onFocus, onTrace, menu }: NodeActionsProps) {
  return (
    <div className="row actions" data-testid="node-actions">
      {canEdit && (
        <Button type="button" size="sm" data-testid="node-edit" disabled={editing} onClick={onEdit}>
          편집
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" data-testid="node-center-graph" onClick={() => onFocus(node.id)}>
        그래프 중심으로
      </Button>
      {!node.archived && (
        <Button type="button" size="sm" variant="outline" data-testid="node-trace" onClick={() => onTrace(node.id)}>
          근거 따라가기
        </Button>
      )}
      {menu}
    </div>
  )
}

/** 머리 아래의 내 이해 표시와 개념 칩. 개념 노드는 칩 줄을 그리지 않는다 */
export function NodeLearningRow({ node, concepts, onOpenConcept }: { node: NodeView; concepts: ConceptRef[]; onOpenConcept: (id: string) => void }) {
  return (
    <div className="grid gap-2" data-testid="node-learning-row">
      <KnowledgeMarkControls key={node.id} nodeId={node.id} mark={undefined} />
      {node.type !== CONCEPT_TYPE && <ConceptChips concepts={concepts} onOpen={onOpenConcept} />}
    </div>
  )
}

type Notice = { kind: 'success' | 'conflict' | 'error'; text: string; actions?: { label: string; onClick: () => void }[] }

export const CONFLICT_TEXT = '다른 탭이나 다른 사용자가 먼저 저장했습니다. 최신 내용을 불러왔습니다.'

export function hasClaimPredicateForNode(ontology: ReturnType<typeof useApp>['ontology'], nodeType: string) {
  return Object.values(ontology.claimPredicates).some((predicate) =>
    predicate.subjectTypes.includes(nodeType) || predicate.objectTypes.includes(nodeType),
  )
}

export function DetailPanel({ selectedId, refreshKey, onChanged, flash, onFocus, onSelect, onOpenHistory, onTrace }: Props) {
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
  // 편집 폼을 여는 상태. 409 를 받아도 그대로 두어 비교가 보이게 하고, 다른 항목을 고르면 닫는다.
  const [editing, setEditing] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const copyLink = useCopyLink(selectedId ?? '')
  const resetCopyLink = copyLink.reset
  // 「⋯」 메뉴에서 보관 창을 열었으면 메뉴가 닫히며 단추로 초점을 돌려보내지 않는다. 창 밖으로 초점이 나가 창이 닫히는 것을 막는다.
  // 링크 복사도 같다. 클립보드를 쓸 수 없을 때 선택해 둔 주소 입력칸의 초점을 뺏지 않는다.
  const menuPickedRef = useRef(false)
  const guide = useGuide()
  const { prefill, consumePrefill } = guide
  // 가이드가 연 주장 폼의 프리필과 미리 고른 근거 문서. 가이드의 값은 가져가면 비므로 여기에 복사해 둔다.
  const [openedPrefill, setOpenedPrefill] = useState<{ prefill: GuidePrefill; documents: NodeView[] } | null>(null)

  useEffect(() => {
    setNotice(flash && flash.id === selectedId ? { kind: flash.kind ?? 'success', text: flash.text } : null)
    setAddingClaim(false)
    setOpenedPrefill(null)
    setArchiveReason('')
    setArchiveOpen(false)
    setDraft(null)
    setEditing(false)
    resetCopyLink()
  }, [selectedId, flash])

  // 가이드의 주장 프리필. 위 effect 가 폼을 닫은 뒤에 열리도록 상세와 근거 문서를 읽은 다음에 연다.
  useEffect(() => {
    if (!canEdit || !prefill?.subjectId || !detail || detail.node.id !== prefill.subjectId) return
    let cancelled = false
    const documentId = prefill.documentId
    const documents: Promise<NodeView[]> = documentId
      ? api.nodes
          .get(documentId)
          .then((d) => [d.node])
          .catch(() => [])
      : Promise.resolve([])
    void documents.then((docs) => {
      if (cancelled) return
      setOpenedPrefill({ prefill, documents: docs })
      setAddingClaim(true)
      consumePrefill()
    })
    return () => {
      cancelled = true
    }
  }, [detail, prefill])

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
  const typeDefined = !!ontology.nodeTypes[node.type]
  const hasClaimPredicates = hasClaimPredicateForNode(ontology, node.type)

  const canEditNode = canEdit && !node.archived && typeDefined

  const restore = async () => {
    try {
      await api.nodes.restore(node.id, node.revision)
      succeed('복원했습니다.')
    } catch (e) {
      fail(e)
    }
  }

  // 성공하든 실패하든 창을 닫는다. 실패는 상세 위 알림으로 보인다.
  const archive = async (e: FormEvent) => {
    e.preventDefault()
    setArchiveBusy(true)
    try {
      await api.nodes.archive(node.id, node.revision, archiveReason.trim() || undefined)
      setArchiveOpen(false)
      setArchiveReason('')
      setEditing(false)
      succeed('보관했습니다. 기본 검색과 주변 그래프에서 빠집니다.')
    } catch (err) {
      setArchiveOpen(false)
      fail(err)
    } finally {
      setArchiveBusy(false)
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
      <div className="muted small" data-testid="node-created-line">
        {`${withJosa(userName(node.createdBy), '이(가)')} ${formatDate(node.createdAt)}에 등록`}
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

      <NodeActions
        node={node}
        canEdit={canEditNode}
        editing={editing}
        onEdit={() => setEditing(true)}
        onFocus={onFocus}
        onTrace={onTrace}
        menu={
          <>
            {/* 모달 메뉴는 스크롤을 잠그려고 <style> 을 넣어 CSP(style-src 'self')에 막히므로 modal={false} 로 연다 */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" data-testid="node-more" aria-label="더 보기">
                  ⋯
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (menuPickedRef.current) event.preventDefault()
                  menuPickedRef.current = false
                }}
              >
                <DropdownMenuItem
                  data-testid="node-copy-link"
                  onSelect={() => {
                    menuPickedRef.current = true
                    void copyLink.copy()
                  }}
                >
                  링크 복사
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="node-history-link" onSelect={() => onOpenHistory(node.id)}>
                  변경 이력
                </DropdownMenuItem>
                {canEdit &&
                  (node.archived ? (
                    <DropdownMenuItem data-testid="node-restore-button" onSelect={() => void restore()}>
                      복원
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      variant="destructive"
                      data-testid="node-archive-button"
                      onSelect={() => {
                        menuPickedRef.current = true
                        setArchiveOpen(true)
                      }}
                    >
                      보관
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {/* 메뉴가 닫혀도 남도록 복사 결과는 메뉴 밖에 그린다 */}
      {copyLink.result && (
        <div className="actions">
          <CopyLinkResult testId="node-copy-link" url={copyLink.url} result={copyLink.result} inputRef={copyLink.inputRef} />
        </div>
      )}
      <NodeLearningRow node={node} concepts={detail.concepts} onOpenConcept={onSelect} />
      {/* 개념 노드는 칩 줄 대신 강조, 비판, 관련 개념, 쓴 곳 절을 보인다 */}
      {node.type === CONCEPT_TYPE && <ConceptSections detail={detail} onSelect={onSelect} />}

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent data-testid="node-archive-dialog">
          <form className="grid gap-4" onSubmit={(e) => void archive(e)}>
            <DialogHeader>
              <DialogTitle>이 항목을 보관할까요?</DialogTitle>
              <DialogDescription>보관하면 기본 검색과 주변 그래프에서 빠집니다. 복원할 수 있습니다.</DialogDescription>
            </DialogHeader>
            <Input
              data-testid="node-archive-reason"
              placeholder="보관 사유(선택)"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  취소
                </Button>
              </DialogClose>
              <Button type="submit" variant="destructive" data-testid="node-archive-confirm" disabled={archiveBusy}>
                보관
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {!canEdit && (
        <div className="info-box" data-testid="viewer-hint">
          열람자는 조회만 할 수 있습니다. 수정, 검토, 보관은 편집자에게 요청하세요.
        </div>
      )}

      {claim ? (
        <section className="detail-section">
          <h3>{labels.type(node.type)}</h3>
          <ClaimCard claim={claim} onOpenNode={onSelect} />
          {canEdit && <ReviewControls claim={claim} onDone={succeed} onError={fail} />}
          {canEditNode && editing && (
            <>
              <ClaimEditForm
                key={`${claim.id}:${claim.revision}`}
                claim={claim}
                onSaved={(message) => {
                  setEditing(false)
                  succeed(message)
                }}
                onError={fail}
              />
              <button type="button" data-testid="node-edit-cancel" onClick={() => setEditing(false)}>
                취소
              </button>
            </>
          )}
        </section>
      ) : (
        <section className="detail-section">
          <h3>속성</h3>
          {canEditNode && editing ? (
            <>
              <div className="hint">{ontology.nodeTypes[node.type]?.description}</div>
              <NodeEditForm
                key={`${node.id}:${node.revision}`}
                node={node}
                onSaved={() => {
                  setDraft(null)
                  setEditing(false)
                  succeed('저장했습니다.')
                }}
                onError={fail}
                draft={draft}
                onConflict={setDraft}
                onDraftDone={() => setDraft(null)}
                onCancel={() => {
                  setDraft(null)
                  setEditing(false)
                }}
              />
            </>
          ) : typeDefined ? (
            <NodeReadCard node={node} />
          ) : (
            <UndefinedTypeProperties node={node} />
          )}
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
          <div className="section-head">
            <h3>주장 ({detail.claims.length})</h3>
            {canEdit && typeDefined && hasClaimPredicates && !addingClaim && (
              <button data-testid="claim-add-toggle" disabled={node.archived} onClick={() => setAddingClaim(true)}>
                ＋ 주장 추가
              </button>
            )}
          </div>
          {detail.claims.length === 0 && <div className="muted small">걸린 주장이 없습니다.</div>}
          {detail.claimsTruncated && (
            <div className="info-box" data-testid="detail-claims-truncated">
              주장이 많아 오래된 것부터 {detail.limits.maxClaims}개만 보입니다. 전체는 검토 대기 탭이나 그래프에서 확인하세요.
            </div>
          )}
          {detail.claims.map((c) => (
            <ClaimCard key={c.id} claim={c} onOpenNode={onSelect} showOpen />
          ))}
          {canEdit && addingClaim && (
            <ClaimCreateForm
              key={openedPrefill?.prefill.documentId ?? ''}
              initialSubject={node}
              initialPredicate={openedPrefill?.prefill.predicate}
              initialDocuments={openedPrefill?.documents}
              initialDescription={openedPrefill?.prefill.description}
              initialEvidenceText={openedPrefill?.prefill.evidenceText}
              onCancel={() => {
                setAddingClaim(false)
                setOpenedPrefill(null)
                guide.cancelForm()
              }}
              onCreated={(claim) => {
                setAddingClaim(false)
                setOpenedPrefill(null)
                guide.report({ kind: 'claim-created', node: claim })
                succeed('주장을 만들었습니다. 다른 편집자의 검토를 기다립니다.')
              }}
            />
          )}
        </section>
      )}

      {!claim && node.type === 'Security' && <TradeList filter={{ securityId: node.id }} testId="detail-trades" />}
      {!claim && node.type === 'Decision' && <TradeList filter={{ decisionId: node.id }} testId="detail-trades" />}

      <details className="meta-details" data-testid="node-meta-details">
        <summary>자세히</summary>
        <dl className="kv meta">
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
          <dt>revision</dt>
          <dd data-testid="node-revision">{node.revision}</dd>
          <dt>ID</dt>
          <dd className="mono small">{node.id}</dd>
        </dl>
      </details>
    </div>
  )
}
