import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api/client'
import type { NodeView, Page, ReviewStatus } from '../api/types'
import { useApp, useLabels } from '../context'
import { managedTypes, orderedTypes } from '../lib/typeOrder'
import { Pager } from './Pager'
import { StatusBadge, TypeBadge } from './TypeBadge'

export interface SearchFilters {
  q: string
  types: string[]
  reviewStatus: ReviewStatus | ''
  includeArchived: boolean
}

/** 고급 필터에서 기본값과 다른 조건의 개수. 접혀 있어도 조건이 걸린 것을 머리글자로 알린다 */
export function advancedFilterCount(f: { reviewStatus: string; includeArchived: boolean; hops: number; claimsAsNodes: boolean }): number {
  return [f.reviewStatus !== '', f.includeArchived, f.hops !== 1, f.claimsAsNodes].filter(Boolean).length
}

interface Props {
  filters: SearchFilters
  onFiltersChange: (f: SearchFilters) => void
  selectedId: string | null
  onFocus: (id: string) => void
  refreshTick: number
  typesParam: (types: string[]) => string[] | undefined
  hops: number
  onHopsChange: (hops: number) => void
  claimsAsNodes: boolean
  onClaimsAsNodesChange: (value: boolean) => void
}

export function SearchPanel({ filters, onFiltersChange, selectedId, onFocus, refreshTick, typesParam, hops, onHopsChange, claimsAsNodes, onClaimsAsNodesChange }: Props) {
  const { canEdit, ontology } = useApp()
  const labels = useLabels()
  // 칩 순서는 개념 지도와 같다. 관계 방향으로 얕은 타입이 앞이고 주장이 맨 뒤다.
  const chipTypes = useMemo(() => [...orderedTypes(ontology), ...managedTypes(ontology)], [ontology])
  const [qInput, setQInput] = useState(filters.q)
  // 뒤로가기로 주소의 검색어가 바뀌면 입력칸도 따라간다.
  useEffect(() => setQInput(filters.q), [filters.q])
  const [pageNo, setPageNo] = useState(0)
  const [result, setResult] = useState<Page<NodeView> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    update({ types: chipTypes.filter((t) => next.includes(t)) })
  }

  const advancedCount = advancedFilterCount({ reviewStatus: filters.reviewStatus, includeArchived: filters.includeArchived, hops, claimsAsNodes })

  // 조건 없이 검색해도 결과가 없으면 아직 아무것도 등록하지 않은 것이다.
  const nothingRegistered =
    !filters.q && !filters.reviewStatus && !filters.includeArchived && filters.types.length === labels.types.length

  return (
    <div className="search-panel">
      <form onSubmit={submit} className="row">
        <input
          data-testid="search-input"
          placeholder="이름이나 종목 코드로 찾기"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <button type="submit" data-testid="search-submit">
          검색
        </button>
      </form>

      <div className="type-chips">
        {chipTypes.map((t) => {
          const on = filters.types.includes(t)
          return (
            <button
              key={t}
              type="button"
              className={on ? 'type-chip on' : 'type-chip'}
              data-testid={`filter-type-${t}`}
              aria-pressed={on}
              onClick={() => toggleType(t, !on)}
            >
              <TypeBadge type={t} />
            </button>
          )
        })}
      </div>

      <details className="filters" data-testid="advanced-filters">
        <summary data-testid="advanced-filters-toggle">
          {advancedCount === 0 ? '고급 필터' : `고급 필터 (${advancedCount})`}
        </summary>
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
        <label className="field-inline">
          이웃 단계
          <select data-testid="graph-hops" value={hops} onChange={(e) => onHopsChange(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            data-testid="graph-claims-as-nodes"
            checked={claimsAsNodes}
            onChange={(e) => onClaimsAsNodesChange(e.target.checked)}
          />
          주장을 따로 보기
        </label>
        <div className="hint">종류와 검토 상태는 그래프에도 적용됩니다.</div>
      </details>

      <div className="search-results" data-testid="search-results">
        {loading && <div className="muted">검색 중…</div>}
        {error && <div className="error-box">{error}</div>}
        {result && !loading && result.items.length === 0 && (
          <div className="muted" data-testid="search-empty">
            {nothingRegistered
              ? `아직 등록한 항목이 없습니다.${canEdit ? ' 오른쪽 위 「＋ 추가」 로 첫 항목을 만드세요.' : ''}`
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
                  <span className="result-text">
                    <span className="result-label">{labels.node(n)}</span>
                    <span className="result-hint text-xs text-muted-foreground" data-testid="search-result-hint">
                      {labels.hint(n)}
                    </span>
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
    </div>
  )
}
