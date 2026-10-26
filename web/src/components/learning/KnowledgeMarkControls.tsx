import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import type { KnowledgeLevel, KnowledgeMark } from '../../api/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const NOTE_MAX = 1000

interface Props {
  nodeId: string
  /** undefined 는 아직 읽지 않음이라 마운트할 때 읽는다. null 은 표시 없음이라 읽지 않는다 */
  mark: KnowledgeMark | null | undefined
  /** 서버가 쓰기를 받은 뒤에 부른다. 지운 경우에는 level 이 null 인 표시다 */
  onChange?: (mark: KnowledgeMark) => void
}

/**
 * 「알아요」, 「잘 모르겠어요」 토글과 「메모 남기기」. 규칙은 docs/flow.md 「내 이해 표시」.
 * 응답을 받은 뒤에 바꾼다. 실패하면 이유만 보이고 표시는 그대로 둔다.
 * 처음 읽기가 실패해도 토글은 켜 두고 표시 없음으로 쓴다. 이유는 단추 옆에 보인다.
 */
export function KnowledgeMarkControls({ nodeId, mark, onChange }: Props) {
  const [current, setCurrent] = useState<KnowledgeMark | null>(mark ?? null)
  const [loaded, setLoaded] = useState(mark !== undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    if (mark !== undefined) {
      setCurrent(mark)
      setLoaded(true)
      return
    }
    let cancelled = false
    api.me.knowledge
      .get(nodeId)
      .then((m) => {
        if (cancelled) return
        setCurrent(m)
        setLoaded(true)
      })
      .catch((e) => {
        if (cancelled) return
        setCurrent(null)
        setLoaded(true)
        setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [nodeId, mark])

  const level = current?.level ?? null
  const note = current?.note ?? null

  const write = async (send: () => Promise<KnowledgeMark>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await send()
      setCurrent(next)
      setNoteOpen(false)
      onChange?.(next)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  // 이미 눌린 쪽을 다시 누르면 표시를 지운다. 바꿀 때 메모는 그대로 보낸다
  const toggle = (target: KnowledgeLevel) =>
    void write(async () => {
      if (level === target) {
        await api.me.knowledge.remove(nodeId)
        return { nodeId, level: null, note: null, updatedAt: null }
      }
      return api.me.knowledge.put(nodeId, target, note)
    })

  // 메모만 저장하면 표시가 없을 때 「잘 모르겠어요」 로 함께 쓴다
  const saveNote = () => void write(() => api.me.knowledge.put(nodeId, level ?? 'UNSURE', noteText.trim() || null))

  const disabled = busy || !loaded
  return (
    <div className="grid gap-1" data-testid="knowledge-controls" data-level={level ?? 'none'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="xs"
          variant={level === 'KNOWN' ? 'default' : 'outline'}
          aria-pressed={level === 'KNOWN'}
          data-testid="knowledge-known"
          disabled={disabled}
          onClick={() => toggle('KNOWN')}
        >
          알아요
        </Button>
        <Button
          type="button"
          size="xs"
          variant={level === 'UNSURE' ? 'default' : 'outline'}
          aria-pressed={level === 'UNSURE'}
          data-testid="knowledge-unsure"
          disabled={disabled}
          onClick={() => toggle('UNSURE')}
        >
          잘 모르겠어요
        </Button>
        {level === 'LEARNING' && (
          <span className="text-xs font-semibold text-blue-700" data-testid="knowledge-learning-badge">
            공부 중
          </span>
        )}
        {!noteOpen && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            data-testid="knowledge-note-open"
            disabled={disabled}
            onClick={() => {
              setNoteText(note ?? '')
              setNoteOpen(true)
            }}
          >
            메모 남기기
          </Button>
        )}
        {error && (
          <span className="text-xs text-destructive" role="alert" data-testid="knowledge-error">
            {error}
          </span>
        )}
      </div>
      {noteOpen && (
        <div className="grid gap-1">
          <Textarea
            data-testid="knowledge-note-input"
            maxLength={NOTE_MAX}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="flex gap-1.5">
            <Button type="button" size="xs" data-testid="knowledge-note-save" disabled={busy} onClick={saveNote}>
              저장
            </Button>
            <Button type="button" size="xs" variant="outline" data-testid="knowledge-note-cancel" disabled={busy} onClick={() => setNoteOpen(false)}>
              취소
            </Button>
          </div>
        </div>
      )}
      {note && (
        <p className="text-sm whitespace-pre-wrap break-words text-muted-foreground" data-testid="knowledge-note">
          내 메모: {note}
        </p>
      )}
    </div>
  )
}
