import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, errorMessage } from '../api/client'
import type { NodeView, Page } from '../api/types'
import { useLabels } from '../context'
import { formatDateTime, userName } from '../lib/format'
import { TAB_PATHS, listSearch, parseListQuery, type ListQuery } from '../routes'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pager } from './Pager'
import { StatusBadge, TypeBadge } from './TypeBadge'

export function ListTab({ onOpen }: { onOpen: (id: string) => void }) {
  const labels = useLabels()
  const location = useLocation()
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const query = useMemo(() => parseListQuery(location.search), [location.search])
  const { type, q, archived: includeArchived, page: pageNo } = query
  const [qInput, setQInput] = useState(q)
  const [page, setPage] = useState<Page<NodeView> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /** 주소만 바꾸고 기록을 쌓지 않는다. 쪽 번호가 아닌 조건을 바꾸면 쪽은 0 으로 돌린다 */
  const change = (patch: Partial<ListQuery>) => {
    const next = { ...query, page: 0, ...patch }
    const url = TAB_PATHS.list + listSearch(next)
    if (url !== location.pathname + location.search) navigate(url, { replace: true })
  }

  // 뒤로가기로 주소의 검색어가 바뀌면 입력칸도 따라간다.
  useEffect(() => setQInput(q), [q])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.nodes
      .search({ q, types: type ? [type] : undefined, includeArchived, page: pageNo, size: 20 })
      .then((p) => {
        if (cancelled) return
        // 쪽 번호가 끝 쪽을 넘으면 끝 쪽으로 바꿔 연다.
        const last = Math.max(p.totalPages - 1, 0)
        if (last < pageNo) {
          navigateRef.current(TAB_PATHS.list + listSearch({ type, q, archived: includeArchived, page: last }), { replace: true })
          return
        }
        setPage(p)
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [q, type, includeArchived, pageNo])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    change({ q: qInput })
  }

  return (
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="list-tab">
      <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={submit}>
        <NativeSelect
          data-testid="list-type-filter"
          value={type}
          onChange={(e) => change({ type: e.target.value })}
        >
          <option value="">모든 종류</option>
          {labels.types.map((t) => (
            <option key={t} value={t}>
              {labels.type(t)}
            </option>
          ))}
        </NativeSelect>
        <Input
          className="min-w-48 flex-1"
          data-testid="list-search-input"
          placeholder="이름 또는 종목 코드"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <Button type="submit" variant="outline" data-testid="list-search-submit">
          검색
        </Button>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            data-testid="list-include-archived"
            checked={includeArchived}
            onChange={(e) => change({ archived: e.target.checked })}
          />
          보관 포함
        </label>
        {loading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </form>
      {error && (
        <Alert role={undefined} variant="destructive" className="my-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Table data-testid="list-table">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>종류</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>수정자</TableHead>
            <TableHead>수정 시각</TableHead>
            <TableHead>보관</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page?.items.map((n) => (
            <TableRow key={n.id} className="cursor-pointer" data-testid="list-row" data-node-id={n.id} onClick={() => onOpen(n.id)}>
              <TableCell>
                <TypeBadge type={n.type} />
              </TableCell>
              <TableCell>
                {labels.node(n)} <StatusBadge status={n.reviewStatus} />
              </TableCell>
              <TableCell>{userName(n.updatedBy, '알 수 없음')}</TableCell>
              <TableCell>{formatDateTime(n.updatedAt)}</TableCell>
              <TableCell>{n.archived ? '보관됨' : ''}</TableCell>
            </TableRow>
          ))}
          {page && page.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground" data-testid="list-empty">
                결과가 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {page && <Pager page={page} onPage={(n) => change({ page: n })} testIdPrefix="list-pager" />}
    </div>
  )
}
