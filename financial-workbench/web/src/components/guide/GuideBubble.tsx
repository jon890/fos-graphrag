import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { GuideStep } from '../../lib/guide'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TARGET_CLASS = 'guide-target'
const RETRY_MS = 300
const WAIT_MS = 5000
const GAP = 12
const MARGIN = 8
/** 대상 옆에 둘 때의 폭. styles.css 의 .guide-bubble 과 같다 */
const ANCHOR_WIDTH = 320

interface Props {
  step: GuideStep
  index: number
  total: number
  busy: boolean
  /** 1024px 이상. 좁은 화면에서는 언제나 아래쪽 카드다 */
  wide: boolean
  onNext: () => void
  onFinish: () => void
  onSkip: () => void
}

type Placement = { mode: 'card' } | { mode: 'anchored'; top: number; left: number }

function findTarget(testId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
}

/** 대상 옆에 말풍선을 둘 자리. 대상이 보이지 않거나 둘 자리가 없으면 null */
function anchorOf(rect: DOMRect, width: number, height: number): { top: number; left: number } | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (rect.width === 0 || rect.height === 0 || rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw) return null
  const top = Math.min(Math.max(rect.top, MARGIN), Math.max(vh - height - MARGIN, MARGIN))
  if (rect.right + GAP + width <= vw - MARGIN) return { top, left: rect.right + GAP }
  if (rect.left - GAP - width >= MARGIN) return { top, left: rect.left - GAP - width }
  const below = rect.bottom + GAP
  if (below + height <= vh - MARGIN) {
    return { top: below, left: Math.min(Math.max(rect.left, MARGIN), vw - width - MARGIN) }
  }
  return null
}

function samePlacement(a: Placement, b: Placement): boolean {
  if (a.mode === 'card' || b.mode === 'card') return a.mode === b.mode
  return Math.round(a.top) === Math.round(b.top) && Math.round(a.left) === Math.round(b.left)
}

/** 가이드 한 단계의 말풍선. 화면을 덮지 않고 대상 요소만 강조한다 */
export function GuideBubble({ step, index, total, busy, wide, onNext, onFinish, onSkip }: Props) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement>({ mode: 'card' })
  const isIntro = index === 0
  const isLast = index === total - 1

  // 대상을 찾아 강조 class 를 붙이고 위치를 다시 계산한다. React 가 다시 그리며 class 를 지울 수 있어 같은 주기로 다시 붙인다.
  useEffect(() => {
    let marked: HTMLElement | null = null
    const startedAt = Date.now()
    const update = () => {
      const el = step.target ? findTarget(step.target) : null
      if (marked && marked !== el) marked.classList.remove(TARGET_CLASS)
      if (el && !el.classList.contains(TARGET_CLASS)) el.classList.add(TARGET_CLASS)
      marked = el
      let nextPlacement: Placement = { mode: 'card' }
      if (wide && el && ref.current) {
        const anchor = anchorOf(el.getBoundingClientRect(), ANCHOR_WIDTH, ref.current.offsetHeight)
        if (anchor) nextPlacement = { mode: 'anchored', ...anchor }
      }
      setPlacement((prev) => (samePlacement(prev, nextPlacement) ? prev : nextPlacement))
    }
    update()
    const timer = window.setInterval(() => {
      // 대상이 끝내 없으면 5초 뒤로는 아래쪽 카드로 둔 채 강조만 다시 확인한다.
      if (step.target && !marked && Date.now() - startedAt > WAIT_MS) return
      update()
    }, RETRY_MS)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      marked?.classList.remove(TARGET_CLASS)
    }
  }, [step.target, wide])

  // 아래쪽 카드가 열린 동안 본문 아래에 카드 높이만큼 여백을 둬 마지막 단추까지 내려 볼 수 있게 한다.
  const card = placement.mode === 'card'
  useEffect(() => {
    if (!card) return
    const main = document.querySelector<HTMLElement>('.app-main')
    const bubble = ref.current
    if (!main || !bubble) return
    const pad = () => main.style.setProperty('padding-bottom', `${bubble.offsetHeight + 16}px`)
    pad()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(pad) : null
    observer?.observe(bubble)
    return () => {
      observer?.disconnect()
      main.style.removeProperty('padding-bottom')
    }
  }, [card])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 말풍선 안에 초점이 있을 때만 받는다. 만들기 폼에서 누른 Escape 가 가이드를 끝내지 않게 한다.
    if (event.key !== 'Escape' || busy) return
    event.stopPropagation()
    onSkip()
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="guide-bubble"
      data-step={step.id}
      data-placement={placement.mode}
      className={cn('guide-bubble', card && 'guide-bubble-card')}
      style={placement.mode === 'anchored' ? { top: placement.top, left: placement.left } : undefined}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-sm font-bold">
          {step.title}
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">
          {`${index + 1} / ${total}`}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed">{step.body}</p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} data-testid="guide-skip" onClick={onSkip}>
          건너뛰기
        </Button>
        {isIntro && (
          <Button type="button" size="sm" disabled={busy} data-testid="guide-start" onClick={onNext}>
            시작
          </Button>
        )}
        {!isIntro && !isLast && (
          <Button type="button" size="sm" disabled={busy} data-testid="guide-next" onClick={onNext}>
            다음
          </Button>
        )}
        {!isIntro && isLast && (
          <Button type="button" size="sm" disabled={busy} data-testid="guide-finish" onClick={onFinish}>
            끝내기
          </Button>
        )}
      </div>
    </div>
  )
}
