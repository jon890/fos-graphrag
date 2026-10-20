import { useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api/client'
import { NODE_TYPES, type NodeView, type Page } from '../api/types'
import { formatDateTime } from '../lib/format'
import { Pager } from './Pager'
import { StatusBadge, TypeBadge } from './TypeBadge'

export function ListTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [type, setType] = useState('')
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [pageNo, setPageNo] = useState(0)
  const [page, setPage] = useState<Page<NodeView> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.nodes
      .search({ q, types: type ? [type] : undefined, includeArchived, page: pageNo, size: 20 })
      .then((p) => !cancelled && setPage(p))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [q, type, includeArchived, pageNo])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setPageNo(0)
    setQ(qInput)
  }

  return (
    <div className="tab-page" data-testid="list-tab">
      <form className="row toolbar" onSubmit={submit}>
        <select
          data-testid="list-type-filter"
          value={type}
          onChange={(e) => {
            setType(e.target.value)
            setPageNo(0)
          }}
        >
          <option value="">모든 타입</option>
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input data-testid="list-search-input" placeholder="이름 또는 종목 코드" value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <button type="submit" data-testid="list-search-submit">
          검색
        </button>
        <label className="check">
          <input
            type="checkbox"
            data-testid="list-include-archived"
            checked={includeArchived}
            onChange={(e) => {
              setIncludeArchived(e.target.checked)
              setPageNo(0)
            }}
          />
          보관 포함
        </label>
        {loading && <span className="muted small">불러오는 중…</span>}
      </form>
      {error && <div className="error-box">{error}</div>}
      <table className="data-table" data-testid="list-table">
        <thead>
          <tr>
            <th>타입</th>
            <th>이름</th>
            <th>revision</th>
            <th>수정자</th>
            <th>수정 시각</th>
            <th>보관</th>
          </tr>
        </thead>
        <tbody>
          {page?.items.map((n) => (
            <tr key={n.id} className="clickable" data-testid="list-row" data-node-id={n.id} onClick={() => onOpen(n.id)}>
              <td>
                <TypeBadge type={n.type} />
              </td>
              <td>
                {n.label} <StatusBadge status={n.reviewStatus} />
              </td>
              <td>{n.revision}</td>
              <td>{n.updatedBy.displayName}</td>
              <td>{formatDateTime(n.updatedAt)}</td>
              <td>{n.archived ? '보관됨' : ''}</td>
            </tr>
          ))}
          {page && page.items.length === 0 && (
            <tr>
              <td colSpan={6} className="muted" data-testid="list-empty">
                결과가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {page && <Pager page={page} onPage={setPageNo} testIdPrefix="list-pager" />}
    </div>
  )
}
