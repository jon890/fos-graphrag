import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { api, errorMessage } from '../../api/client'
import type { Page, TradeView } from '../../api/types'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { formatDate, formatDateTime } from '../../lib/format'
import { formatMoney, formatQuantity, sideLabel } from '../../lib/trades'
import { parseTradesQuery, TAB_PATHS, tradesSearch, type TradesQuery } from '../../routes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Pager } from '../Pager'

type Message = { kind: 'success' | 'error'; text: string }
type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'done'; value: Page<TradeView> }

interface Props {
  /** 작업 공간에서 그 항목의 상세를 연다 */
  onOpenNode: (id: string) => void
}

/** 내 체결 화면(/trades). 에이전트가 넣은 내 체결을 보고 지운다. 규칙은 docs/flow.md 「내 체결」 */
export function TradesTab({ onOpenNode }: Props) {
  const location = useLocation()
  const navigate = useNavigate()
  const query = useMemo(() => parseTradesQuery(location.search), [location.search])
  const { ticker, page: pageNo } = query
  const wide = useMediaQuery('(min-width: 1024px)')
  const [list, setList] = useState<Load>({ kind: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [message, setMessage] = useState<Message | null>(null)
  const [target, setTarget] = useState<TradeView | null>(null)
  const [deleting, setDeleting] = useState(false)
  // 입력 중인 글자는 주소가 따라오기 전에도 칸에 남아야 한다
  const [typed, setTyped] = useState(ticker)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  /** 주소만 바꾸고 기록을 쌓지 않는다. 종목 코드를 바꾸면 쪽은 0 으로 돌린다 */
  const change = (patch: Partial<TradesQuery>) => {
    const url = TAB_PATHS.trades + tradesSearch({ ...query, page: 0, ...patch })
    if (url !== location.pathname + location.search) navigate(url, { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    setList((l) => (l.kind === 'done' ? l : { kind: 'loading' }))
    api.trades
      .list({ ticker, page: pageNo, size: 20 })
      .then((p) => {
        if (cancelled) return
        // 마지막 체결을 지워 끝 쪽이 비면 끝 쪽으로 바꿔 연다
        const last = Math.max(p.totalPages - 1, 0)
        if (last < pageNo) {
          navigateRef.current(TAB_PATHS.trades + tradesSearch({ ticker, page: last }), { replace: true })
          return
        }
        setList({ kind: 'done', value: p })
      })
      .catch((e) => !cancelled && setList({ kind: 'error', message: errorMessage(e) }))
    return () => {
      cancelled = true
    }
  }, [ticker, pageNo, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const remove = async () => {
    if (!target) return
    setDeleting(true)
    try {
      await api.trades.remove(target.id)
      setMessage({ kind: 'success', text: '체결을 지웠습니다.' })
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) })
    } finally {
      setDeleting(false)
      setTarget(null)
    }
    reload()
  }

  const trades = list.kind === 'done' ? list.value.items : []

  return (
    <div className="mx-auto max-w-5xl min-w-0 p-4" data-testid="trades-tab">
      <h2 className="m-0 mb-1 text-lg font-bold">내 체결</h2>
      <p className="my-1 text-xs text-muted-foreground" data-testid="trades-guide">
        Hermes 가 증권사 커넥터에서 가져온 내 체결 기록입니다. 다른 사용자에게는 보이지 않습니다.
      </p>

      <Input
        aria-label="종목 코드"
        placeholder="종목 코드"
        className="mt-3 max-w-xs"
        data-testid="trades-ticker"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value)
          change({ ticker: e.target.value.trim() })
        }}
      />

      {message && (
        <p role="status" className={cn('mt-3 text-sm', message.kind === 'error' ? 'text-red-700' : 'text-emerald-800')} data-testid="trades-message" data-kind={message.kind}>
          {message.text}
        </p>
      )}

      {list.kind === 'loading' && <p className="mt-4 text-muted-foreground">불러오는 중…</p>}
      {list.kind === 'error' && (
        <div className="error-box mt-3" data-testid="trades-error">
          <p>{list.message}</p>
          <Button type="button" size="sm" variant="outline" className="mt-2" data-testid="trades-retry" onClick={reload}>
            다시 시도
          </Button>
        </div>
      )}
      {list.kind === 'done' &&
        (list.value.totalItems === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground" data-testid="trades-empty">
            {ticker ? '이 종목 코드의 체결이 없습니다.' : '아직 체결 기록이 없습니다. 연동 토큰을 「조회와 기록」 으로 발급해 Hermes 에 넣으면 체결이 여기에 쌓입니다.'}
          </p>
        ) : (
          <>
            {wide ? (
              <Table data-testid="trades-table">
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead>체결 시각</TableHead>
                    <TableHead>구분</TableHead>
                    <TableHead>종목</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">단가</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead className="text-right">수수료</TableHead>
                    <TableHead>이은 결정</TableHead>
                    <TableHead>관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((t) => (
                    <TradeRow key={t.id} trade={t} variant="row" onOpenNode={onOpenNode} onDelete={setTarget} />
                  ))}
                </TableBody>
              </Table>
            ) : (
              <ul className="mt-4 grid gap-3 p-0" data-testid="trades-table">
                {trades.map((t) => (
                  <TradeRow key={t.id} trade={t} variant="card" onOpenNode={onOpenNode} onDelete={setTarget} />
                ))}
              </ul>
            )}
            <Pager page={list.value} onPage={(n) => change({ page: n })} testIdPrefix="trades-page" />
          </>
        ))}

      <Dialog open={target !== null} onOpenChange={(open) => !open && !deleting && setTarget(null)}>
        <DialogContent data-testid="trades-delete-dialog">
          <DialogHeader>
            <DialogTitle>체결 지우기</DialogTitle>
            <DialogDescription>
              {target ? `${formatDate(target.executedAt)} ${securityText(target)} 체결을 지울까요? ` : ''}지운 기록은 되살릴 수 없습니다. Hermes 가 같은 체결을 다시 보내면 다시 생깁니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" data-testid="trades-delete-cancel" disabled={deleting}>
                취소
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" data-testid="trades-delete-confirm" disabled={deleting} onClick={() => void remove()}>
              지우기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 종목 이름. 이은 종목이 없으면 증권사가 준 이름과 종목 코드다 */
function securityText(t: TradeView): string {
  return t.security?.label ?? [t.name, t.ticker].filter(Boolean).join(' ')
}

interface RowProps {
  trade: TradeView
  variant: 'row' | 'card'
  onOpenNode: (id: string) => void
  onDelete: (t: TradeView) => void
}

const LINK_CLASS = 'h-auto min-w-0 px-0 py-0 text-left break-words whitespace-normal'

/** 표의 한 행. 좁은 화면에서는 같은 내용을 카드로 그린다(variant) */
export function TradeRow({ trade: t, variant, onOpenNode, onDelete }: RowProps) {
  const security = t.security ? (
    <Button type="button" variant="link" className={LINK_CLASS} data-testid="trade-security" data-node-id={t.security.id} onClick={() => onOpenNode(t.security!.id)}>
      {t.security.label}
    </Button>
  ) : (
    <span data-testid="trade-security">{securityText(t)}</span>
  )
  const decisions = (
    <span data-testid="trade-decisions">
      {t.decisions.map((d, i) => (
        <span key={d.id}>
          {i > 0 && ', '}
          <Button type="button" variant="link" className={LINK_CLASS} data-node-id={d.id} onClick={() => onOpenNode(d.id)}>
            {d.label}
          </Button>
        </span>
      ))}
    </span>
  )
  const remove = (
    <Button type="button" variant="destructive" size="sm" data-testid="trade-delete" onClick={() => onDelete(t)}>
      지우기
    </Button>
  )
  const fee = t.fee === null ? '-' : formatMoney(t.fee, t.currency)
  const common = { 'data-testid': 'trade-row', 'data-id': t.id, 'data-side': t.side, 'data-ticker': t.ticker }

  if (variant === 'row') {
    return (
      <TableRow {...common}>
        <TableCell data-testid="trade-executed">{formatDateTime(t.executedAt)}</TableCell>
        <TableCell data-testid="trade-side">{sideLabel(t.side)}</TableCell>
        <TableCell className="break-words whitespace-normal">{security}</TableCell>
        <TableCell className="text-right" data-testid="trade-quantity">
          {formatQuantity(t.quantity)}
        </TableCell>
        <TableCell className="text-right" data-testid="trade-price">
          {formatMoney(t.price, t.currency)}
        </TableCell>
        <TableCell className="text-right" data-testid="trade-amount">
          {formatMoney(t.amount, t.currency)}
        </TableCell>
        <TableCell className="text-right" data-testid="trade-fee">
          {fee}
        </TableCell>
        <TableCell className="whitespace-normal">{decisions}</TableCell>
        <TableCell>{remove}</TableCell>
      </TableRow>
    )
  }
  return (
    <li className="grid min-w-0 gap-1 rounded-md border bg-background p-3 text-sm" {...common}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold" data-testid="trade-side">
          {sideLabel(t.side)}
        </span>
        {security}
      </div>
      <span className="text-xs text-muted-foreground" data-testid="trade-executed">
        {formatDateTime(t.executedAt)}
      </span>
      <div>
        수량 <span data-testid="trade-quantity">{formatQuantity(t.quantity)}</span> · 단가 <span data-testid="trade-price">{formatMoney(t.price, t.currency)}</span>
      </div>
      <div>
        금액 <span data-testid="trade-amount">{formatMoney(t.amount, t.currency)}</span> · 수수료 <span data-testid="trade-fee">{fee}</span>
      </div>
      {t.decisions.length > 0 && <div>이은 결정 {decisions}</div>}
      <div>{remove}</div>
    </li>
  )
}
