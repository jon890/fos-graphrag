import { describe, expect, it } from 'vitest'
import { consentSentence, readAuthorizationQuery, redirectNotice } from './connect'

describe('동의 화면 규칙', () => {
  it('인가 요청의 여덟 칸만 읽고 모르는 칸은 버린다', () => {
    const search =
      '?response_type=code&client_id=c1&redirect_uri=http%3A%2F%2Flocalhost%3A1%2Fcb&code_challenge=abc&code_challenge_method=S256&state=s&scope=read%20write&resource=http%3A%2F%2Fh%2Fmcp&evil=1&login=denied'
    expect(readAuthorizationQuery(search)).toEqual({
      response_type: 'code',
      client_id: 'c1',
      redirect_uri: 'http://localhost:1/cb',
      code_challenge: 'abc',
      code_challenge_method: 'S256',
      state: 's',
      scope: 'read write',
      resource: 'http://h/mcp',
    })
  })

  it('없는 칸은 넣지 않는다', () => {
    expect(readAuthorizationQuery('')).toEqual({})
    expect(readAuthorizationQuery('?client_id=c1')).toEqual({ client_id: 'c1' })
  })

  it('본문은 범위에 따라 조회하려, 조회하고 기록하려 로 끝난다', () => {
    expect(consentSentence('Claude Code', 'READ')).toBe('Claude Code 이(가) 가치투자 온톨로지를 내 계정으로 조회하려 합니다.')
    expect(consentSentence('Claude Code', 'READ_WRITE')).toBe('Claude Code 이(가) 가치투자 온톨로지를 내 계정으로 조회하고 기록하려 합니다.')
  })

  it('돌아갈 곳은 loopback 이면 이 컴퓨터의 앱, https 면 host 를 보인다', () => {
    expect(redirectNotice('LOOPBACK', 'localhost')).toBe('허용하면 이 컴퓨터의 앱으로 돌아갑니다.')
    expect(redirectNotice('HTTPS', 'app.example')).toContain('app.example 로 돌아갑니다')
  })
})
