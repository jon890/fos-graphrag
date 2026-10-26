import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError, errorMessage } from '../../api/client'
import type { IntegrationTokenView, TokenScope } from '../../api/types'
import { scopeLabel } from '../../lib/connect'
import { formatDateTime } from '../../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ConnectionsSection } from './ConnectionsSection'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

type Message = { kind: 'success' | 'error'; text: string }

/** 사용자 한 명이 폐기하지 않고 가질 수 있는 토큰 수. 집행은 서버가 하고 화면은 단추만 끈다 */
const MAX_TOKENS = 5
const LIMIT_TEXT = `토큰은 ${MAX_TOKENS}개까지 만들 수 있습니다. 쓰지 않는 토큰을 폐기하세요.`

/** 지금 토큰 수로 더 발급할 수 있는가 */
export function canIssue(count: number, max = MAX_TOKENS): boolean {
  return count < max
}

export { scopeLabel }

const WRITE_HINT = '이 토큰을 가진 에이전트가 내 체결을 저장하고 제안을 올립니다. 공유 지식은 내가 승인한 제안으로만 바뀝니다.'

/** 끝 네 자리를 목록에 보이는 모양으로 */
export function maskedLast4(last4: string): string {
  return `…${last4}`
}

/** 발급 요청을 보내는 동안에는 창을 닫지 않는다. 응답 전에 닫히면 목록에 없는 토큰이 생긴다 */
export function canCloseIssue(issuing: boolean): boolean {
  return !issuing
}

/** 서버가 상한을 알리면 화면의 상한 안내와 같은 문장을 보인다 */
function issueErrorText(e: unknown): string {
  return e instanceof ApiError && e.code === 'TOKEN_LIMIT' ? LIMIT_TEXT : errorMessage(e)
}

/** 내 연동 토큰 목록과 발급, 폐기. 모든 역할이 자기 토큰만 본다. */
export function TokensTab() {
  const [tokens, setTokens] = useState<IntegrationTokenView[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const [issueOpen, setIssueOpen] = useState(false)
  const [name, setName] = useState('Hermes')
  const [scope, setScope] = useState<TokenScope>('READ')
  const [issuing, setIssuing] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)
  // 토큰 원문은 이 상태에만 둔다. 창의 닫힘 애니메이션이 끝나면 지운다.
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [copyResult, setCopyResult] = useState<'done' | 'fallback' | null>(null)
  const valueRef = useRef<HTMLInputElement>(null)

  const [revokeTarget, setRevokeTarget] = useState<IntegrationTokenView | null>(null)
  const [revoking, setRevoking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setTokens(await api.tokens.list())
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

  const count = tokens?.length ?? 0
  const atLimit = tokens !== null && !canIssue(count)

  const openIssue = () => {
    setName('Hermes')
    setScope('READ')
    setIssueError(null)
    setIssuedToken(null)
    setCopyResult(null)
    setIssueOpen(true)
  }

  // 닫는 순간에는 창만 닫는다. 내용을 바로 지우면 닫히는 동안 입력 화면으로 바뀌어 보인다.
  const closeIssue = () => {
    if (!canCloseIssue(issuing)) return
    setIssueOpen(false)
    if (issuedToken !== null) void load()
  }

  const clearIssue = () => {
    setIssuedToken(null)
    setCopyResult(null)
    setIssueError(null)
  }

  const issue = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setIssuing(true)
    setIssueError(null)
    try {
      const issued = await api.tokens.issue(trimmed, scope)
      setIssuedToken(issued.token)
    } catch (err) {
      setIssueError(issueErrorText(err))
    } finally {
      setIssuing(false)
    }
  }

  const copy = async () => {
    if (issuedToken === null) return
    try {
      await navigator.clipboard.writeText(issuedToken)
      setCopyResult('done')
    } catch {
      setCopyResult('fallback')
      valueRef.current?.select()
    }
  }

  const revoke = async () => {
    if (!revokeTarget) return
    const target = revokeTarget
    setRevoking(true)
    try {
      await api.tokens.revoke(target.id)
      setMessage({ kind: 'success', text: `「${target.name}」 토큰을 폐기했습니다.` })
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setRevoking(false)
      setRevokeTarget(null)
    }
    await load()
  }

  return (
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="tokens-tab">
      <h1 className="m-0 mb-4 text-xl font-bold">연동</h1>
      <ConnectionsSection />
      <div className="mt-8 mb-3 flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-2 text-lg font-bold">연동 토큰</h2>
        <Button data-testid="tokens-issue-open" disabled={atLimit} onClick={openIssue}>
          ＋ 토큰 발급
        </Button>
        {loading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </div>
      <p className="my-2 text-xs text-muted-foreground" data-testid="tokens-guide">
        Hermes 같은 개인 비서가 가치투자 온톨로지를 조회하고 내 체결을 기록할 때 쓰는 토큰입니다. 「조회만」 토큰은 조회만 하고, 「조회와 기록」 토큰은 내 체결을 저장하고 제안을 올립니다. fos-assistant 의 `financial-workbench` 커넥터 설정에 토큰을 넣으면 연결됩니다.
      </p>
      {atLimit && (
        <p className="my-2 text-xs text-amber-800" data-testid="tokens-limit">
          {LIMIT_TEXT}
        </p>
      )}

      {message && (
        <Alert
          role="status"
          variant={message.kind === 'error' ? 'destructive' : 'default'}
          className={cn('my-2', message.kind === 'success' && 'border-emerald-300 bg-emerald-50')}
          data-testid="tokens-message"
          data-kind={message.kind}
        >
          <AlertDescription className={cn(message.kind === 'success' && 'text-emerald-900')}>{message.text}</AlertDescription>
        </Alert>
      )}

      {loadError !== null && (
        <Alert variant="destructive" className="my-2" data-testid="tokens-error">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            {loadError}
            <Button variant="outline" size="sm" data-testid="tokens-retry" onClick={() => void load()}>
              다시 시도
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {tokens !== null && tokens.length === 0 && (
        <p className="my-3 text-sm text-muted-foreground" data-testid="tokens-empty">
          아직 발급한 토큰이 없습니다.
        </p>
      )}

      {tokens !== null && tokens.length > 0 && (
        <Table data-testid="tokens-table">
          <TableHeader>
            <TableRow className="bg-slate-50 hover:bg-slate-50">
              <TableHead>이름</TableHead>
              <TableHead className="hidden lg:table-cell">범위</TableHead>
              <TableHead>만든 때 / 마지막 사용</TableHead>
              <TableHead>끝 네 자리</TableHead>
              <TableHead>관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((t) => (
              <TableRow key={t.id} data-testid="tokens-row" data-id={t.id} data-name={t.name}>
                <TableCell className="break-all">
                  <div data-testid="tokens-row-name">{t.name}</div>
                  {/* 좁은 화면에서는 범위 칸이 없고 이름 아래 작은 글자로 보인다 */}
                  <div className="text-xs text-muted-foreground lg:hidden" aria-hidden="true">
                    {scopeLabel(t.scope)}
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell" data-testid="tokens-row-scope" data-scope={t.scope}>
                  {scopeLabel(t.scope)}
                </TableCell>
                <TableCell>
                  <div data-testid="tokens-row-created">{formatDateTime(t.createdAt)}</div>
                  <div className="text-xs text-muted-foreground" data-testid="tokens-row-last-used">
                    {t.lastUsedAt ? formatDateTime(t.lastUsedAt) : '아직 쓰지 않음'}
                  </div>
                </TableCell>
                <TableCell className="font-mono" data-testid="tokens-row-last4">
                  {maskedLast4(t.last4)}
                </TableCell>
                <TableCell>
                  <Button variant="destructive" size="sm" data-testid="tokens-row-revoke" onClick={() => setRevokeTarget(t)}>
                    폐기
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={issueOpen} onOpenChange={(open) => !open && closeIssue()}>
        <DialogContent data-testid="tokens-issue-dialog" onCloseAutoFocus={clearIssue}>
          {issuedToken === null ? (
            <form className="grid gap-4" onSubmit={(e) => void issue(e)}>
              <DialogHeader>
                <DialogTitle>토큰 발급</DialogTitle>
                <DialogDescription>이 토큰을 쓰는 곳을 알아볼 수 있는 이름을 붙이세요.</DialogDescription>
              </DialogHeader>
              <Input data-testid="tokens-issue-name" maxLength={50} aria-label="토큰 이름" value={name} onChange={(e) => setName(e.target.value)} />
              <fieldset className="grid gap-1.5 border-0 p-0">
                <legend className="mb-1 text-sm font-medium">범위</legend>
                {(['READ', 'READ_WRITE'] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="tokens-issue-scope"
                      data-testid={value === 'READ' ? 'tokens-issue-scope-read' : 'tokens-issue-scope-write'}
                      checked={scope === value}
                      onChange={() => setScope(value)}
                    />
                    {scopeLabel(value)}
                  </label>
                ))}
                {scope === 'READ_WRITE' && (
                  <p className="m-0 text-xs text-muted-foreground" data-testid="tokens-issue-scope-hint">
                    {WRITE_HINT}
                  </p>
                )}
              </fieldset>
              {issueError && (
                <Alert variant="destructive" data-testid="tokens-issue-error">
                  <AlertDescription>{issueError}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" data-testid="tokens-issue-cancel" disabled={issuing}>
                    취소
                  </Button>
                </DialogClose>
                <Button type="submit" data-testid="tokens-issue-submit" disabled={issuing || !name.trim()}>
                  발급
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="grid gap-4">
              <DialogHeader>
                <DialogTitle>토큰을 발급했습니다</DialogTitle>
                <DialogDescription data-testid="tokens-issued-warning">이 토큰은 지금만 볼 수 있습니다. 창을 닫으면 다시 볼 수 없습니다.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={valueRef}
                  readOnly
                  className="min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs"
                  data-testid="tokens-issued-value"
                  aria-label="발급한 토큰"
                  value={issuedToken}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" variant="outline" data-testid="tokens-issued-copy" onClick={() => void copy()}>
                  복사
                </Button>
              </div>
              {copyResult === 'done' && (
                <span className="text-xs text-muted-foreground" data-testid="tokens-issued-copied">
                  복사했습니다
                </span>
              )}
              {copyResult === 'fallback' && <span className="text-xs text-muted-foreground">직접 복사하세요</span>}
              <DialogFooter>
                <Button type="button" data-testid="tokens-issued-close" onClick={closeIssue}>
                  닫기
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent data-testid="tokens-revoke-dialog">
          <DialogHeader>
            <DialogTitle>토큰 폐기</DialogTitle>
            <DialogDescription>「{revokeTarget?.name}」 토큰을 폐기할까요? 이 토큰을 쓰는 에이전트는 바로 조회할 수 없게 됩니다.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" data-testid="tokens-revoke-cancel">
                취소
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" data-testid="tokens-revoke-confirm" disabled={revoking} onClick={() => void revoke()}>
              폐기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
