import type { AuthorizationPreview, TokenScope } from '../api/types'

/** 인가 요청이 담는 query 칸. 서버가 `/connect` 로 보낼 때 그대로 붙인다(docs/api-contract.md 「인가 요청과 동의」) */
const AUTHORIZATION_FIELDS = [
  'response_type',
  'client_id',
  'redirect_uri',
  'code_challenge',
  'code_challenge_method',
  'state',
  'scope',
  'resource',
] as const

/** 주소의 query 에서 인가 요청의 여덟 칸만 읽는다. 모르는 칸은 버린다 */
export function readAuthorizationQuery(search: string): Record<string, string> {
  const params = new URLSearchParams(search)
  const query: Record<string, string> = {}
  for (const field of AUTHORIZATION_FIELDS) {
    const value = params.get(field)
    if (value !== null) query[field] = value
  }
  return query
}

/** 동의 본문. 앱 이름이 앱이 정한 값이라 조사는 「이(가)」 를 그대로 쓴다 */
export function consentSentence(clientName: string, requestedScope: TokenScope): string {
  const action = requestedScope === 'READ' ? '조회하려' : '조회하고 기록하려'
  return `${clientName} 이(가) 가치투자 온톨로지를 내 계정으로 ${action} 합니다.`
}

/** 돌아갈 곳을 한 줄로 */
export function redirectNotice(kind: AuthorizationPreview['redirectKind'], host: string): string {
  return kind === 'LOOPBACK' ? '허용하면 이 컴퓨터의 앱으로 돌아갑니다.' : `허용하면 ${host} 로 돌아갑니다.`
}

export const APP_NAME_WARNING = '앱 이름은 앱이 직접 정한 것입니다. 내가 방금 연결을 시작한 앱이 아니면 「거절」 을 누르세요.'
export const DISCONNECT_HINT = '연결은 더보기 → 연동 의 「연결된 앱」 에서 언제든 끊을 수 있습니다.'
export const INVALID_CLIENT_TEXT = '연결 요청이 올바르지 않습니다. 앱에서 연결을 다시 시작하세요.'
export const DECIDE_FAILED_TEXT = '연결하지 못했습니다. 다시 시도하세요.'

/** 범위의 화면 이름 */
export function scopeLabel(scope: TokenScope): string {
  return scope === 'READ_WRITE' ? '조회와 기록' : '조회만'
}
