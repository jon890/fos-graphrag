import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api/client'
import { ROLES, type PatchUserRequest, type Role, type UserView } from '../api/types'
import { ROLE_LABEL, useApp } from '../context'
import { formatDateTime } from '../lib/format'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

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
    <TableRow data-testid="users-row" data-email={user.email} data-enabled={String(user.enabled)} className={cn(!user.enabled && 'bg-gray-50 text-muted-foreground')}>
      <TableCell className="font-mono">
        {user.email}
        {isSelf && <span className="text-xs text-muted-foreground"> (나)</span>}
      </TableCell>
      <TableCell>{user.displayName}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect size="sm" data-testid="users-row-role" value={role} disabled={busy} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            size="sm"
            data-testid="users-row-save"
            disabled={busy || role === user.role}
            onClick={() => void run({ role }, `${user.email} 의 역할을 바꿨습니다. 새 역할: ${ROLE_LABEL[role]}`)}
          >
            저장
          </Button>
        </div>
      </TableCell>
      <TableCell data-testid="users-row-enabled">{user.enabled ? '활성' : '비활성'}</TableCell>
      <TableCell data-testid="users-row-linked">{user.linked ? '로그인함' : '첫 로그인 전'}</TableCell>
      <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          {user.enabled ? (
            <Button
              variant="destructive"
              size="sm"
              data-testid="users-row-disable"
              disabled={busy}
              onClick={() => void run({ enabled: false }, `${user.email} 을 비활성화했습니다. 다음 요청부터 세션이 끊깁니다.`)}
            >
              비활성화
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              data-testid="users-row-enable"
              disabled={busy}
              onClick={() => void run({ enabled: true }, `${user.email} 을 다시 활성화했습니다.`)}
            >
              다시 활성화
            </Button>
          )}
          <Button variant="link" size="sm" className="px-1" data-testid="users-row-history" onClick={() => onOpenHistory(user.id)}>
            이력
          </Button>
        </div>
      </TableCell>
    </TableRow>
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
    <div className="min-h-full bg-card px-3 py-4 lg:px-6" data-testid="users-tab">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="m-0 mr-2 text-lg font-bold">사용자</h2>
        <Button variant="outline" data-testid="users-refresh" onClick={() => void load()}>
          새로고침
        </Button>
        {loading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </div>
      <p className="my-2 text-xs text-muted-foreground">
        목록에 있는 활성 사용자만 Google 로 로그인할 수 있습니다. 이메일은 바꿀 수 없으니 잘못 넣었으면 비활성화하고 새로 추가하세요.
      </p>

      <form className="my-2 mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-slate-50 p-2.5" onSubmit={add} data-testid="users-add-form">
        <Input className="min-w-48 flex-1" data-testid="users-add-email" type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input className="min-w-48 flex-1" data-testid="users-add-name" placeholder="표시 이름" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <NativeSelect data-testid="users-add-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" data-testid="users-add-submit" disabled={adding}>
          사용자 추가
        </Button>
      </form>

      {message && (
        <Alert
          role="status"
          variant={message.kind === 'error' ? 'destructive' : 'default'}
          className={cn('my-2', message.kind === 'success' && 'border-emerald-300 bg-emerald-50')}
          data-testid="users-message"
          data-kind={message.kind}
        >
          <AlertDescription className={cn(message.kind === 'success' && 'text-emerald-900')}>{message.text}</AlertDescription>
        </Alert>
      )}

      <Table data-testid="users-table">
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead>이메일</TableHead>
            <TableHead>표시 이름</TableHead>
            <TableHead>역할</TableHead>
            <TableHead>활성</TableHead>
            <TableHead>로그인 연결</TableHead>
            <TableHead>마지막 로그인</TableHead>
            <TableHead>관리</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users?.map((u) => (
            <UserRow key={`${u.id}:${u.revision}`} user={u} isSelf={u.id === me.id} onPatch={patch} onOpenHistory={onOpenHistory} />
          ))}
          {users && users.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                사용자가 없습니다.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
