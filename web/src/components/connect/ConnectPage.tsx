import { useEffect, useState } from 'react'
import { api, ApiError, errorMessage } from '../../api/client'
import type { AuthorizationPreview, TokenScope } from '../../api/types'
import { APP_NAME_WARNING, consentSentence, DECIDE_FAILED_TEXT, DISCONNECT_HINT, INVALID_CLIENT_TEXT, readAuthorizationQuery, redirectNotice, scopeLabel } from '../../lib/connect'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

/** 인가 요청 검사 결과. 동의 본문이나 두 종류의 오류 화면 가운데 하나를 그린다 */
export type ConnectState =
  | { kind: 'loading' }
  | { kind: 'ready'; preview: AuthorizationPreview }
  /** 클라이언트나 돌아갈 주소가 등록되지 않았다. 앱으로 돌려보낼 수 없어 오류만 보인다 */
  | { kind: 'invalid' }
  /** 그 밖의 요청 오류. 앱으로 오류를 알릴 주소가 있다 */
  | { kind: 'redirect-error'; message: string; redirectUrl: string }
  | { kind: 'failed'; message: string }

const SCOPE_HINT: Record<TokenScope, string> = {
  READ_WRITE: '항목과 근거, 내 공부 목록과 체결을 조회하고, 내 체결을 저장하고, 제안을 올립니다. 함께 쓰는 지식은 내가 「제안」 에서 승인한 것만 바뀝니다.',
  READ: '항목과 근거, 내 공부 목록과 체결을 조회만 합니다.',
}

interface ViewProps {
  state: ConnectState
  /** 동의 본문에서 고른 범위. 요청한 범위가 READ 면 화면은 늘 READ 로 본다 */
  scope: TokenScope
  onScope: (scope: TokenScope) => void
  /** 결정을 보내는 중이거나 보낸 뒤 이동하는 중이면 어느 결정인지 */
  deciding: 'ALLOW' | 'DENY' | null
  /** 결정 요청이 실패한 이유 */
  error: string | null
  onDecide: (decision: 'ALLOW' | 'DENY') => void
  onGo: (url: string) => void
}

/** 동의 화면의 그림. 상태를 props 로 받아 서버 렌더링으로 시험한다 */
export function ConnectView({ state, scope, onScope, deciding, error, onDecide, onGo }: ViewProps) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-[460px]" data-testid="connect-page">
        <CardHeader>
          <h1 className="text-lg font-bold">앱 연결</h1>
          {state.kind === 'ready' && (
            <p className="m-0 text-sm text-muted-foreground" data-testid="connect-user">
              {state.preview.user.displayName} 님으로 로그인함
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state.kind === 'loading' && <p className="m-0 text-sm text-muted-foreground">불러오는 중…</p>}

          {state.kind === 'invalid' && (
            <>
              <Alert role={undefined} variant="destructive" data-testid="connect-invalid">
                <AlertDescription>{INVALID_CLIENT_TEXT}</AlertDescription>
              </Alert>
              <a className="text-sm text-blue-700 underline" href="/" data-testid="connect-home">
                첫 화면으로
              </a>
            </>
          )}

          {state.kind === 'redirect-error' && (
            <>
              <Alert role={undefined} variant="destructive" data-testid="connect-error">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
              <Button type="button" data-testid="connect-back" onClick={() => onGo(state.redirectUrl)}>
                앱으로 돌아가기
              </Button>
            </>
          )}

          {state.kind === 'failed' && (
            <Alert variant="destructive" data-testid="connect-error">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          {state.kind === 'ready' && (
            <>
              <p className="m-0 text-sm font-medium break-words" data-testid="connect-sentence">
                {consentSentence(state.preview.clientName, state.preview.requestedScope)}
              </p>
              <div>
                <p className="m-0 text-sm" data-testid="connect-redirect">
                  {redirectNotice(state.preview.redirectKind, state.preview.redirectHost)}
                </p>
                <p className="mt-1 mb-0 text-xs text-muted-foreground" data-testid="connect-warning">
                  {APP_NAME_WARNING}
                </p>
              </div>

              <fieldset className="grid gap-2 border-0 p-0" disabled={deciding !== null}>
                <legend className="mb-1 text-sm font-medium">범위</legend>
                {state.preview.requestedScope === 'READ_WRITE' && (
                  <label className="grid gap-0.5 text-sm">
                    <span className="flex items-center gap-2">
                      <input type="radio" name="connect-scope" data-testid="connect-scope-write" checked={scope === 'READ_WRITE'} onChange={() => onScope('READ_WRITE')} />
                      {scopeLabel('READ_WRITE')}
                    </span>
                    <span className="ml-6 text-xs text-muted-foreground">{SCOPE_HINT.READ_WRITE}</span>
                  </label>
                )}
                <label className="grid gap-0.5 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="radio" name="connect-scope" data-testid="connect-scope-read" checked={scope === 'READ'} onChange={() => onScope('READ')} />
                    {scopeLabel('READ')}
                  </span>
                  <span className="ml-6 text-xs text-muted-foreground">{SCOPE_HINT.READ}</span>
                </label>
              </fieldset>

              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button type="button" className="w-full sm:w-auto" data-testid="connect-allow" disabled={deciding !== null} onClick={() => onDecide('ALLOW')}>
                  연결 허용
                </Button>
                <Button type="button" variant="outline" className="w-full sm:w-auto" data-testid="connect-deny" disabled={deciding !== null} onClick={() => onDecide('DENY')}>
                  거절
                </Button>
              </div>
              {deciding !== null && (
                <p className="m-0 text-sm text-muted-foreground" role="status" data-testid="connect-progress">
                  앱으로 돌아가는 중입니다…
                </p>
              )}
              {error && (
                <Alert variant="destructive" data-testid="connect-error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <p className="m-0 text-xs text-muted-foreground">{DISCONNECT_HINT}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** 앱 연결 동의 화면(`/connect`). 머리글과 탭 없이 이 화면만 보인다 */
export function ConnectPage() {
  const [state, setState] = useState<ConnectState>({ kind: 'loading' })
  const [scope, setScope] = useState<TokenScope>('READ_WRITE')
  const [deciding, setDeciding] = useState<'ALLOW' | 'DENY' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.oauth
      .preview(window.location.search)
      .then((preview) => !cancelled && setState({ kind: 'ready', preview }))
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiError && e.code === 'OAUTH_INVALID_CLIENT') setState({ kind: 'invalid' })
        else if (e instanceof ApiError && e.code === 'OAUTH_REDIRECT_ERROR' && typeof e.details?.redirectUrl === 'string') {
          setState({ kind: 'redirect-error', message: e.message, redirectUrl: e.details.redirectUrl })
        } else setState({ kind: 'failed', message: errorMessage(e) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveScope: TokenScope = state.kind === 'ready' && state.preview.requestedScope === 'READ' ? 'READ' : scope

  const decide = async (decision: 'ALLOW' | 'DENY') => {
    setDeciding(decision)
    setError(null)
    try {
      const { redirectUrl } = await api.oauth.decide({
        ...readAuthorizationQuery(window.location.search),
        decision,
        ...(decision === 'ALLOW' ? { grantedScope: effectiveScope } : {}),
      })
      // 돌아갈 주소는 서버가 검사해 만든 값만 쓴다. 이동하는 동안 단추는 꺼 둔다.
      window.location.assign(redirectUrl)
    } catch (e) {
      setDeciding(null)
      setError(errorMessage(e) || DECIDE_FAILED_TEXT)
    }
  }

  return (
    <ConnectView
      state={state}
      scope={effectiveScope}
      onScope={setScope}
      deciding={deciding}
      error={error}
      onDecide={(d) => void decide(d)}
      onGo={(url) => window.location.assign(url)}
    />
  )
}
