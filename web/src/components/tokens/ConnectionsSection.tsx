import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, errorMessage } from '../../api/client'
import type { ConnectionView } from '../../api/types'
import { scopeLabel } from '../../lib/connect'
import { formatDateTime } from '../../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type Message = { kind: 'success' | 'error'; text: string }

interface ListProps {
  connections: ConnectionView[]
  onDisconnect: (connection: ConnectionView) => void
}

/** 연결된 앱의 표. 연결이 없으면 빈 상태 안내를 보인다 */
export function ConnectionsList({ connections, onDisconnect }: ListProps) {
  if (connections.length === 0) {
    return (
      <p className="my-3 text-sm text-muted-foreground" data-testid="connections-empty">
        아직 연결한 앱이 없습니다.
      </p>
    )
  }
  return (
    <Table data-testid="connections-table">
      <TableHeader>
        <TableRow className="bg-slate-50 hover:bg-slate-50">
          <TableHead>앱 이름</TableHead>
          <TableHead className="hidden lg:table-cell">범위</TableHead>
          <TableHead>연결한 때 / 마지막 사용</TableHead>
          <TableHead>관리</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {connections.map((c) => (
          <TableRow key={c.id} data-testid="connections-row" data-id={c.id} data-name={c.clientName}>
            <TableCell className="break-all">
              {/* 앱이 정한 이름이라 React 가 이스케이프한 텍스트로만 보인다 */}
              <div data-testid="connections-row-name">{c.clientName}</div>
              {/* 좁은 화면에서는 범위 칸이 없고 앱 이름 아래 작은 글자로 보인다 */}
              <div className="text-xs text-muted-foreground lg:hidden" aria-hidden="true">
                {scopeLabel(c.scope)}
              </div>
            </TableCell>
            <TableCell className="hidden lg:table-cell" data-testid="connections-row-scope" data-scope={c.scope}>
              {scopeLabel(c.scope)}
            </TableCell>
            <TableCell>
              <div data-testid="connections-row-created">{formatDateTime(c.createdAt)}</div>
              <div className="text-xs text-muted-foreground" data-testid="connections-row-last-used">
                {c.lastUsedAt ? formatDateTime(c.lastUsedAt) : '아직 쓰지 않음'}
              </div>
            </TableCell>
            <TableCell>
              <Button variant="destructive" size="sm" data-testid="connections-row-disconnect" onClick={() => onDisconnect(c)}>
                연결 끊기
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** 「연동」 화면의 위쪽. OAuth 로 연결한 앱을 보고 끊는다. 모든 역할이 자기 연결만 본다 */
export function ConnectionsSection() {
  const [connections, setConnections] = useState<ConnectionView[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [target, setTarget] = useState<ConnectionView | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setConnections(await api.connections.list())
      setLoadError(null)
    } catch (e) {
      setLoadError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const disconnect = async () => {
    if (!target) return
    const current = target
    setDisconnecting(true)
    try {
      await api.connections.disconnect(current.id)
      setMessage({ kind: 'success', text: `「${current.clientName}」 연결을 끊었습니다.` })
    } catch (err) {
      // 다른 탭에서 먼저 끊었으면 목록만 다시 읽는다.
      if (!(err instanceof ApiError && err.status === 404)) setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setDisconnecting(false)
      setTarget(null)
    }
    await load()
  }

  return (
    <section data-testid="connections-section">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-2 text-lg font-bold">연결된 앱</h2>
        {loading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </div>
      <p className="my-2 text-xs text-muted-foreground" data-testid="connections-guide">
        Claude Code 나 Codex 에 가치투자 온톨로지 플러그인을 설치하고 로그인하면 여기에 보입니다. 연결을 끊으면 그 앱은 다시 로그인할 때까지 조회하거나 기록할 수 없습니다.
      </p>

      {message && (
        <Alert
          role="status"
          variant={message.kind === 'error' ? 'destructive' : 'default'}
          className={cn('my-2', message.kind === 'success' && 'border-emerald-300 bg-emerald-50')}
          data-testid="connections-message"
          data-kind={message.kind}
        >
          <AlertDescription className={cn(message.kind === 'success' && 'text-emerald-900')}>{message.text}</AlertDescription>
        </Alert>
      )}

      {loadError !== null && (
        <Alert variant="destructive" className="my-2" data-testid="connections-error">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {loadError}
            <Button variant="outline" size="sm" data-testid="connections-retry" onClick={() => void load()}>
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {connections !== null && <ConnectionsList connections={connections} onDisconnect={setTarget} />}

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent data-testid="connections-confirm">
          <DialogHeader>
            <DialogTitle>연결 끊기</DialogTitle>
            <DialogDescription>
              「{target?.clientName}」 연결을 끊을까요? 이 앱은 다시 로그인할 때까지 가치투자 온톨로지를 조회하거나 기록할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" data-testid="connections-confirm-cancel">
                취소
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" data-testid="connections-confirm-submit" disabled={disconnecting} onClick={() => void disconnect()}>
              연결 끊기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
