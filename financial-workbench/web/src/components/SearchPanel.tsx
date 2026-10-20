import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api/client'
import { NODE_TYPES, REVIEW_STATUSES, type NodeView, type Page, type ReviewStatus } from '../api/types'
import { creatableTypes, useApp } from '../context'
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
  refreshTick: number
  typesParam: (types: string[]) => string[] | undefined
}

export function SearchPanel({ filters, onFiltersChange, selectedId, onFocus, refreshTick, typesParam }: Props) {
  const { ontology, canEdit } = useApp()
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
    update({ types: NODE_TYPES.filter((t) => next.includes(t)) })
  }

  const creatable = creatableTypes(ontology)

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
        <legend>타입</legend>
        {NODE_TYPES.map((t) => (
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
          Claim 검토 상태
          <select
            data-testid="filter-review-status"
            value={filters.reviewStatus}
            onChange={(e) => update({ reviewStatus: e.target.value as ReviewStatus | '' })}
          >
            <option value="">전체</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
        <div className="hint">타입과 검토 상태 필터는 주변 그래프에도 적용됩니다.</div>
      </fieldset>

      <div className="search-results" data-testid="search-results">
        {loading && <div className="muted">검색 중…</div>}
        {error && <div className="error-box">{error}</div>}
        {result && !loading && result.items.length === 0 && (
          <div className="muted" data-testid="search-empty">
            검색 결과가 없습니다.
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
                  <span className="result-label">{n.label}</span>
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
            열람자(VIEWER)는 노드를 만들 수 없습니다.
          </div>
        ) : !creating ? (
          <div className="row">
            <select data-testid="new-node-type" value={createType} onChange={(e) => setCreateType(e.target.value)}>
              <option value="">새 노드 타입</option>
              {creatable.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              className="primary"
              data-testid="new-node-button"
              disabled={!createType}
              onClick={() => setCreating(true)}
            >
              새 노드 만들기
            </button>
          </div>
        ) : (
          <>
            <h3>새 {createType}</h3>
            <div className="hint">{ontology.nodeTypes[createType]?.description}</div>
            <NodeCreateForm
              key={createType}
              type={createType}
              testIdPrefix="create"
              onCancel={() => setCreating(false)}
              onCreated={(node) => {
                setCreating(false)
                onFocus(node.id)
                void run()
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
