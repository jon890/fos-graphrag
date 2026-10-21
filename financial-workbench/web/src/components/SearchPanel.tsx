import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api/client'
import type { NodeView, Page, ReviewStatus } from '../api/types'
import { creatableTypes, useApp, useLabels } from '../context'
import { withEulReul, withJosa } from '../lib/labels'
import { ClaimCreateForm } from './ClaimCreateForm'
import { NodeCreateForm } from './NodeCreateForm'
import { Pager } from './Pager'
import { StatusBadge, TypeBadge } from './TypeBadge'

export interface SearchFilters {
  q: string
  types: string[]
  reviewStatus: ReviewStatus | ''
  includeArchived: boolean
}

interface Props {
  filters: SearchFilters
  onFiltersChange: (f: SearchFilters) => void
  selectedId: string | null
  onFocus: (id: string) => void
  /** 새 노드를 만들었을 때. 안내 문장과 함께 부른다 */
  onCreated: (node: NodeView, message: string, kind?: 'success' | 'error') => void
  refreshTick: number
  typesParam: (types: string[]) => string[] | undefined
}

export function SearchPanel({ filters, onFiltersChange, selectedId, onFocus, onCreated, refreshTick, typesParam }: Props) {
  const { ontology, canEdit } = useApp()
  const labels = useLabels()
  const [qInput, setQInput] = useState(filters.q)
  const [pageNo, setPageNo] = useState(0)
  const [result, setResult] = useState<Page<NodeView> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createType, setCreateType] = useState<string>('')
  const [creating, setCreating] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setResult(
        await api.nodes.search({
          q: filters.q,
          types: typesParam(filters.types),
          reviewStatus: filters.reviewStatus,
          includeArchived: filters.includeArchived,
          page: pageNo,
          size: 20,
        }),
      )
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [filters, pageNo, typesParam])

  useEffect(() => {
    void run()
  }, [run, refreshTick])

  const update = (patch: Partial<SearchFilters>) => {
    setPageNo(0)
    onFiltersChange({ ...filters, ...patch })
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (qInput === filters.q) void run()
    else update({ q: qInput })
  }

  const toggleType = (type: string, on: boolean) => {
    const next = on ? [...filters.types, type] : filters.types.filter((t) => t !== type)
    update({ types: labels.types.filter((t) => next.includes(t)) })
  }

  const creatable = creatableTypes(ontology)
  const claimType = Object.keys(ontology.nodeTypes).find((t) => ontology.nodeTypes[t].managedBy === 'claims')
  const claimCreatable = !!claimType && Object.keys(ontology.claimPredicates).length > 0
  // 조건 없이 검색해도 결과가 없으면 아직 아무것도 등록하지 않은 것이다.
  const nothingRegistered =
    !filters.q && !filters.reviewStatus && !filters.includeArchived && filters.types.length === labels.types.length

  return (
    <div className="search-panel">
      <form onSubmit={submit} className="row">
        <input
          data-testid="search-input"
          placeholder="이름 또는 종목 코드"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <button type="submit" data-testid="search-submit">
          검색
        </button>
      </form>

      <fieldset className="filters">
        <legend>종류</legend>
        {labels.types.map((t) => (
          <label key={t} className="check">
            <input
              type="checkbox"
              data-testid={`filter-type-${t}`}
              checked={filters.types.includes(t)}
              onChange={(e) => toggleType(t, e.target.checked)}
            />
            <TypeBadge type={t} />
          </label>
        ))}
        <label className="field-inline">
          주장 검토 상태
          <select
            data-testid="filter-review-status"
            value={filters.reviewStatus}
            onChange={(e) => update({ reviewStatus: e.target.value as ReviewStatus | '' })}
          >
            <option value="">전체</option>
            {labels.reviewStatuses.map((s) => (
              <option key={s} value={s}>
                {labels.status(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            data-testid="filter-include-archived"
            checked={filters.includeArchived}
            onChange={(e) => update({ includeArchived: e.target.checked })}
          />
          보관 포함
        </label>
        <div className="hint">종류와 검토 상태 필터는 주변 그래프에도 적용됩니다.</div>
      </fieldset>

      <div className="search-results" data-testid="search-results">
        {loading && <div className="muted">검색 중…</div>}
        {error && <div className="error-box">{error}</div>}
        {result && !loading && result.items.length === 0 && (
          <div className="muted" data-testid="search-empty">
            {nothingRegistered
              ? `아직 등록된 항목이 없습니다.${canEdit ? ' 아래에서 처음 항목을 만들어 보세요.' : ''}`
              : '검색 결과가 없습니다.'}
          </div>
        )}
        {result && result.items.length > 0 && (
          <ul>
            {result.items.map((n) => (
              <li key={n.id}>
                <button
                  className={n.id === selectedId ? 'result-item selected' : 'result-item'}
                  data-testid="search-result"
                  data-node-id={n.id}
                  data-node-type={n.type}
                  onClick={() => onFocus(n.id)}
                >
                  <TypeBadge type={n.type} />
                  <span className="result-label">{labels.node(n)}</span>
                  <span className="result-hint text-xs text-muted-foreground" data-testid="search-result-hint">
                    {labels.hint(n)}
                  </span>
                  <StatusBadge status={n.reviewStatus} />
                  {n.archived && <span className="archived-badge">보관됨</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {result && result.totalPages > 1 && <Pager page={result} onPage={setPageNo} testIdPrefix="search-pager" />}
      </div>

      <div className="create-box">
        {!canEdit ? (
          <div className="muted small" data-testid="viewer-create-hint">
            열람자는 항목을 만들 수 없습니다.
          </div>
        ) : !creating ? (
          <div className="row">
            <select data-testid="new-node-type" value={createType} onChange={(e) => setCreateType(e.target.value)}>
              <option value="">무엇을 만들까요?</option>
              {creatable.map((t) => (
                <option key={t} value={t}>
                  {labels.type(t)}
                </option>
              ))}
              {claimCreatable && <option value={claimType}>{labels.type(claimType!)}</option>}
            </select>
            <button
              className="primary"
              data-testid="new-node-button"
              disabled={!createType}
              onClick={() => setCreating(true)}
            >
              새로 만들기
            </button>
          </div>
        ) : (
          <>
            <h3>새 {labels.type(createType)}</h3>
            <div className="hint">{ontology.nodeTypes[createType]?.description}</div>
            {createType === claimType ? (
              <ClaimCreateForm
                onCancel={() => setCreating(false)}
                onCreated={(claim) => {
                  setCreating(false)
                  onCreated(claim, `「${labels.node(claim)}」 ${withEulReul(labels.type(claim.type))} 만들었습니다. 다른 편집자의 검토를 기다립니다.`)
                  void run()
                }}
              />
            ) : (
              <NodeCreateForm
                key={createType}
                type={createType}
                testIdPrefix="create"
                onCancel={() => setCreating(false)}
                onUseExisting={(n) => {
                  setCreating(false)
                  onFocus(n.id)
                }}
                onCreated={(node, linkError) => {
                  setCreating(false)
                  if (linkError) {
                    const pickerLabel =
                      Object.values(ontology.relationshipTypes).find((r) => r.createPicker && r.to.includes(node.type))?.createPicker?.label ?? '관계'
                    onCreated(
                      node,
                      `「${labels.node(node)}」 ${withEulReul(labels.type(node.type))} 만들었지만 ${withJosa(pickerLabel, '을(를)')} 잇지 못했습니다. 상세의 관계 추가로 다시 이으세요. (${linkError})`,
                      'error',
                    )
                  } else {
                    onCreated(node, `「${labels.node(node)}」 ${withEulReul(labels.type(node.type))} 만들었습니다.`)
                  }
                  void run()
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
