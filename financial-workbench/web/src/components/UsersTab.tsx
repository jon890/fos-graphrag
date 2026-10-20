import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api/client'
import { ROLES, type PatchUserRequest, type Role, type UserView } from '../api/types'
import { ROLE_LABEL, useApp } from '../context'
import { formatDateTime } from '../lib/format'

type Message = { kind: 'success' | 'error'; text: string }

interface RowProps {
  user: UserView
  isSelf: boolean
  onPatch: (user: UserView, body: Omit<PatchUserRequest, 'expectedRevision'>, done: string) => Promise<void>
  onOpenHistory: (id: string) => void
}

function UserRow({ user, isSelf, onPatch, onOpenHistory }: RowProps) {
  const [role, setRole] = useState<Role>(user.role)
  const [busy, setBusy] = useState(false)

  const run = async (body: Omit<PatchUserRequest, 'expectedRevision'>, done: string) => {
    setBusy(true)
    try {
      await onPatch(user, body, done)
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr data-testid="users-row" data-email={user.email} data-enabled={String(user.enabled)} className={user.enabled ? '' : 'disabled-row'}>
      <td className="mono">
        {user.email}
        {isSelf && <span className="muted small"> (나)</span>}
      </td>
      <td>{user.displayName}</td>
      <td>
        <div className="row">
          <select data-testid="users-row-role" value={role} disabled={busy} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            data-testid="users-row-save"
            disabled={busy || role === user.role}
            onClick={() => void run({ role }, `${user.email} 의 역할을 바꿨습니다. 새 역할: ${ROLE_LABEL[role]}`)}
          >
            저장
          </button>
        </div>
      </td>
      <td data-testid="users-row-enabled">{user.enabled ? '활성' : '비활성'}</td>
      <td data-testid="users-row-linked">{user.linked ? '로그인함' : '첫 로그인 전'}</td>
      <td>{formatDateTime(user.lastLoginAt)}</td>
      <td className="row">
        {user.enabled ? (
          <button
            className="danger"
            data-testid="users-row-disable"
            disabled={busy}
            onClick={() => void run({ enabled: false }, `${user.email} 을 비활성화했습니다. 다음 요청부터 세션이 끊깁니다.`)}
          >
            비활성화
          </button>
        ) : (
          <button data-testid="users-row-enable" disabled={busy} onClick={() => void run({ enabled: true }, `${user.email} 을 다시 활성화했습니다.`)}>
            다시 활성화
          </button>
        )}
        <button className="link-button small" data-testid="users-row-history" onClick={() => onOpenHistory(user.id)}>
          이력
        </button>
      </td>
    </tr>
  )
}

/** ADMIN 전용 허용 사용자 관리. */
export function UsersTab({ onOpenHistory }: { onOpenHistory: (id: string) => void }) {
  const { user: me } = useApp()
  const [users, setUsers] = useState<UserView[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<Role>('VIEWER')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await api.users.list())
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // LAST_ADMIN, REVISION_CONFLICT, DUPLICATE 모두 서버 message 를 보이고 목록을 다시 읽는다.
  const patch = async (target: UserView, body: Omit<PatchUserRequest, 'expectedRevision'>, done: string) => {
    try {
      await api.users.patch(target.id, { expectedRevision: target.revision, ...body })
      setMessage({ kind: 'success', text: done })
    } catch (e) {
      setMessage({ kind: 'error', text: errorMessage(e) })
    }
    await load()
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !displayName.trim()) {
      setMessage({ kind: 'error', text: '이메일과 표시 이름을 입력하세요.' })
      return
    }
    setAdding(true)
    try {
      const created = await api.users.create(email.trim(), displayName.trim(), role)
      setMessage({ kind: 'success', text: `${created.email} 을 추가했습니다. 역할: ${ROLE_LABEL[created.role]}. 첫 Google 로그인 때 계정이 묶입니다.` })
      setEmail('')
      setDisplayName('')
      setRole('VIEWER')
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    } finally {
      setAdding(false)
    }
    await load()
  }

  return (
    <div className="tab-page" data-testid="users-tab">
      <div className="row toolbar">
        <h2>사용자</h2>
        <button data-testid="users-refresh" onClick={() => void load()}>
          새로고침
        </button>
        {loading && <span className="muted small">불러오는 중…</span>}
      </div>
      <p className="hint">
        목록에 있는 활성 사용자만 Google 로 로그인할 수 있습니다. 이메일은 바꿀 수 없으니 잘못 넣었으면 비활성화하고 새로 추가하세요.
      </p>

      <form className="row toolbar sub-form" onSubmit={add} data-testid="users-add-form">
        <input data-testid="users-add-email" type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input data-testid="users-add-name" placeholder="표시 이름" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <select data-testid="users-add-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button type="submit" className="primary" data-testid="users-add-submit" disabled={adding}>
          사용자 추가
        </button>
      </form>

      {message && (
        <div className={`notice notice-${message.kind}`} role="status" data-testid="users-message" data-kind={message.kind}>
          {message.text}
        </div>
      )}

      <table className="data-table" data-testid="users-table">
        <thead>
          <tr>
            <th>이메일</th>
            <th>표시 이름</th>
            <th>역할</th>
            <th>활성</th>
            <th>로그인 연결</th>
            <th>마지막 로그인</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <UserRow key={`${u.id}:${u.revision}`} user={u} isSelf={u.id === me.id} onPatch={patch} onOpenHistory={onOpenHistory} />
          ))}
          {users && users.length === 0 && (
            <tr>
              <td colSpan={7} className="muted">
                사용자가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
