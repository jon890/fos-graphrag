import { useState, type FormEvent } from 'react'
import { api, ApiError, errorMessage } from '../api/client'
import type { UserRef } from '../api/types'

export function LoginView({ notice, onLoggedIn }: { notice?: string; onLoggedIn: (user: UserRef) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onLoggedIn(await api.auth.login(username.trim(), password))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit} data-testid="login-form">
        <h1>금융 온톨로지 워크벤치</h1>
        {notice && <div className="info-box">{notice}</div>}
        <label>
          사용자 이름
          <input
            data-testid="login-username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          비밀번호
          <input
            data-testid="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <div className="error-box" role="alert" data-testid="login-error">
            {error}
          </div>
        )}
        <button type="submit" className="primary" disabled={busy} data-testid="login-submit">
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  )
}
