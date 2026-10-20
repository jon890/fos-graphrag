import { api } from '../api/client'

interface Props {
  /** /?login=denied 로 돌아왔을 때 */
  denied: boolean
  notice?: string
}

/** 로그인 화면. Google OIDC 하나뿐이다. 버튼은 fetch 가 아니라 브라우저 이동이다. */
export function LoginView({ denied, notice }: Props) {
  return (
    <div className="login-page">
      <div className="login-card" data-testid="login-form">
        <h1>금융 온톨로지 워크벤치</h1>
        {denied && (
          <div className="error-box" role="alert" data-testid="login-denied">
            접근 권한이 없습니다. 관리자에게 허용을 요청하세요.
          </div>
        )}
        {!denied && notice && (
          <div className="info-box" data-testid="login-notice">
            {notice}
          </div>
        )}
        <p className="muted small">관리자가 허용한 Google 계정으로만 로그인할 수 있습니다.</p>
        <button type="button" className="primary" data-testid="login-google" onClick={() => api.auth.startGoogleLogin()}>
          {denied ? '다른 계정으로 다시 로그인' : 'Google 로 로그인'}
        </button>
      </div>
    </div>
  )
}
