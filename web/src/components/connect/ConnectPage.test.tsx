import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AuthorizationPreview } from '../../api/types'
import { ConnectView, type ConnectState } from './ConnectPage'

const noop = () => {}
const preview: AuthorizationPreview = {
  clientName: 'Claude Code',
  redirectKind: 'LOOPBACK',
  redirectHost: 'localhost',
  requestedScope: 'READ_WRITE',
  user: { displayName: 'Alice' },
}

function render(state: ConnectState, options: { scope?: 'READ' | 'READ_WRITE'; deciding?: 'ALLOW' | 'DENY' | null; error?: string | null } = {}): string {
  return renderToStaticMarkup(
    <ConnectView state={state} scope={options.scope ?? 'READ_WRITE'} onScope={noop} deciding={options.deciding ?? null} error={options.error ?? null} onDecide={noop} onGo={noop} />,
  )
}

/** 시작 태그 안에서 한 testid 를 가진 요소의 여는 태그 */
function tagOf(html: string, testid: string): string {
  const m = html.match(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`))
  return m ? m[0] : ''
}

describe('ConnectView', () => {
  it('동의 본문에 앱 이름 문장, 로그인한 사람, 조회와 기록이 고른 상태, 두 단추가 있다', () => {
    const html = render({ kind: 'ready', preview })
    expect(html).toContain('Claude Code 이(가) 가치투자 온톨로지를 내 계정으로 조회하고 기록하려 합니다.')
    expect(html).toContain('Alice 님으로 로그인함')
    expect(html).toContain('허용하면 이 컴퓨터의 앱으로 돌아갑니다.')
    expect(tagOf(html, 'connect-scope-write')).toContain('checked')
    expect(tagOf(html, 'connect-scope-read')).not.toContain('checked')
    expect(html).toContain('data-testid="connect-allow"')
    expect(html).toContain('data-testid="connect-deny"')
    expect(html).not.toContain('connect-progress')
  })

  it('요청한 범위가 READ 면 조회와 기록 칸이 없고 조회만이 고른 상태다', () => {
    const html = render({ kind: 'ready', preview: { ...preview, requestedScope: 'READ' } }, { scope: 'READ' })
    expect(html).not.toContain('connect-scope-write')
    expect(tagOf(html, 'connect-scope-read')).toContain('checked')
    expect(html).toContain('내 계정으로 조회하려 합니다.')
  })

  it('앱 이름의 HTML 은 해석하지 않는다', () => {
    const html = render({ kind: 'ready', preview: { ...preview, clientName: '<img src=x onerror=alert(1)>' } })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('결정을 보내는 동안 두 단추가 꺼지고 진행 안내가 보인다', () => {
    const html = render({ kind: 'ready', preview }, { deciding: 'ALLOW' })
    expect(tagOf(html, 'connect-allow')).toMatch(/ disabled(=|\s|>)/)
    expect(tagOf(html, 'connect-deny')).toMatch(/ disabled(=|\s|>)/)
    expect(html).toContain('앱으로 돌아가는 중입니다…')
  })

  it('결정이 실패하면 그 이유를 보이고 단추는 켜져 있다', () => {
    const html = render({ kind: 'ready', preview }, { error: '연결하지 못했습니다. 다시 시도하세요.' })
    expect(html).toContain('connect-error')
    expect(tagOf(html, 'connect-allow')).not.toMatch(/ disabled(=|\s|>)/)
  })

  it('등록되지 않은 클라이언트면 오류와 첫 화면으로 링크만 있고 허용 단추가 없다', () => {
    const html = render({ kind: 'invalid' })
    expect(html).toContain('연결 요청이 올바르지 않습니다. 앱에서 연결을 다시 시작하세요.')
    expect(html).toContain('첫 화면으로')
    expect(html).not.toContain('connect-allow')
  })

  it('그 밖의 요청 오류면 서버 message 와 앱으로 돌아가기 단추가 있고 허용 단추가 없다', () => {
    const html = render({ kind: 'redirect-error', message: 'PKCE 가 필요합니다.', redirectUrl: 'http://localhost:1/cb?error=invalid_request' })
    expect(html).toContain('PKCE 가 필요합니다.')
    expect(html).toContain('data-testid="connect-back"')
    expect(html).not.toContain('connect-allow')
  })
})
