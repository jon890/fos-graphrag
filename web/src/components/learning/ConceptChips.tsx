import { useState } from 'react'
import type { ConceptRef } from '../../api/types'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'

interface Props {
  concepts: ConceptRef[]
  /** 개념 상세를 연다 */
  onOpen: (id: string) => void
}

/**
 * 항목이 쓰는 개념의 점선 칩. 규칙은 docs/flow.md 「개념 설명」.
 * 넓은 화면은 마우스를 올리거나 초점이 가면 한 줄 정의를 보이고 누르면 상세를 연다.
 * 좁은 화면은 누르면 한 줄 정의와 「개념 설명 전체 보기」 를 보인다.
 */
export function ConceptChips({ concepts, onOpen }: Props) {
  const wide = useMediaQuery('(min-width: 1024px)')
  const [shown, setShown] = useState<string | null>(null)
  if (concepts.length === 0) return null

  return (
    <ul className="flex flex-wrap items-start gap-1.5" data-testid="concept-chips">
      {concepts.map((c) => {
        const open = shown === c.id
        return (
          <li key={c.id} className="grid min-w-0 gap-1">
            <button
              type="button"
              className="rounded-full border border-dashed border-slate-500 px-2 py-0.5 text-left text-xs break-words text-slate-700 hover:bg-slate-100"
              aria-expanded={wide ? undefined : open}
              data-testid="concept-chip"
              data-concept-id={c.id}
              onMouseEnter={wide ? () => setShown(c.id) : undefined}
              onMouseLeave={wide ? () => setShown(null) : undefined}
              onFocus={wide ? () => setShown(c.id) : undefined}
              onBlur={wide ? () => setShown(null) : undefined}
              onClick={() => (wide ? onOpen(c.id) : setShown(open ? null : c.id))}
            >
              개념 · {c.label}
            </button>
            {open && (
              <div className="grid max-w-xs gap-1 text-xs">
                <span className="text-muted-foreground" data-testid="concept-summary">
                  {c.summary || '한 줄 정의가 없습니다.'}
                </span>
                {!wide && (
                  <Button type="button" size="xs" variant="link" className="h-auto justify-start px-0" data-testid="concept-open" onClick={() => onOpen(c.id)}>
                    개념 설명 전체 보기
                  </Button>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
