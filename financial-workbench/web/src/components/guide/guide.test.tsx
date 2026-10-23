import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BROWSE_STEPS } from '../../lib/guide'
import { GuideBubble } from './GuideBubble'

const render = (index: number, busy = false) =>
  renderToStaticMarkup(
    <GuideBubble
      step={BROWSE_STEPS[index]}
      index={index}
      total={BROWSE_STEPS.length}
      busy={busy}
      wide
      onNext={() => {}}
      onFinish={() => {}}
      onSkip={() => {}}
    />,
  )

describe('GuideBubble', () => {
  it('소개 단계는 「시작」 과 「건너뛰기」 를 담은 대화 상자다', () => {
    const html = render(0)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="false"')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('data-step="intro"')
    expect(html).toContain('data-testid="guide-start"')
    expect(html).toContain('data-testid="guide-skip"')
    expect(html).not.toContain('data-testid="guide-next"')
  })

  it('중간 단계는 「다음」 을 담는다', () => {
    const html = render(1)
    expect(html).toContain('data-step="search"')
    expect(html).toContain('data-testid="guide-next"')
    expect(html).toContain('data-testid="guide-skip"')
    expect(html).toContain('2 / 4')
    expect(html).not.toContain('data-testid="guide-finish"')
  })

  it('마지막 단계는 「끝내기」 를 담고 「다음」 이 없다', () => {
    const html = render(BROWSE_STEPS.length - 1)
    expect(html).toContain('data-testid="guide-finish"')
    expect(html).not.toContain('data-testid="guide-next"')
  })

  it('보내는 동안에는 단추가 꺼진다', () => {
    const html = render(BROWSE_STEPS.length - 1, true)
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBe(2)
    for (const b of buttons) expect(b).toContain('disabled')
  })
})
