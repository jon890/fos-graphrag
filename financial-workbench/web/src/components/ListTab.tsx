import { useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api/client'
import type { NodeView, Page } from '../api/types'
import { useLabels } from '../context'
import { formatDateTime, userName } from '../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pager } from './Pager'
import { StatusBadge, TypeBadge } from './TypeBadge'

export function ListTab({ onOpen }: { onOpen: (id: string) => void }) {
  const labels = useLabels()
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
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="list-tab">
      <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={submit}>
        <NativeSelect
          data-testid="list-type-filter"
          value={type}
          onChange={(e) => {
            setType(e.target.value)
            setPageNo(0)
          }}
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
            onChange={(e) => {
              setIncludeArchived(e.target.checked)
              setPageNo(0)
            }}
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
      {page && <Pager page={page} onPage={setPageNo} testIdPrefix="list-pager" />}
    </div>
  )
}
