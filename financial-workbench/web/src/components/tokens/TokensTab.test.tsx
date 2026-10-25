import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { withApp } from '../testSupport'
import { canCloseIssue, canIssue, maskedLast4, scopeLabel, TokensTab } from './TokensTab'

describe('TokensTab', () => {
  it('첫 렌더에 화면, Hermes 안내, 발급 단추가 있다', () => {
    const html = renderToStaticMarkup(withApp(<TokensTab />))
    expect(html).toContain('data-testid="tokens-tab"')
    expect(html).toContain('data-testid="tokens-guide"')
    expect(html).toContain('data-testid="tokens-issue-open"')
    expect(html).toContain('Hermes')
  })

  it('토큰이 4개면 더 발급할 수 있고 5개면 없다', () => {
    expect(canIssue(4)).toBe(true)
    expect(canIssue(5)).toBe(false)
  })

  it('발급 요청을 보내는 동안에는 발급 창을 닫을 수 없다', () => {
    expect(canCloseIssue(true)).toBe(false)
    expect(canCloseIssue(false)).toBe(true)
  })

  it('끝 네 자리 앞에 줄임표를 붙인다', () => {
    expect(maskedLast4('x9Qa')).toBe('…x9Qa')
  })

  it('범위는 조회만과 조회와 기록으로 보인다', () => {
    expect(scopeLabel('READ')).toBe('조회만')
    expect(scopeLabel('READ_WRITE')).toBe('조회와 기록')
  })
})
