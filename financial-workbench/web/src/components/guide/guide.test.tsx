import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NodeView } from '../../api/types'
import { BROWSE_STEPS, practiceSteps, RESUME_STEP } from '../../lib/guide'
import { predicateLabel, typeLabel } from '../../lib/labels'
import { ClaimCreateForm } from '../ClaimCreateForm'
import { NodeCreateForm } from '../NodeCreateForm'
import { testOntology, withApp } from '../testSupport'
import { GuideBubble } from './GuideBubble'

const render = (index: number, busy = false) =>
  renderToStaticMarkup(
    <GuideBubble
      kind="browse"
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
    expect(html).toContain('data-step="map"')
    expect(html).toContain('data-testid="guide-next"')
    expect(html).toContain('data-testid="guide-skip"')
    expect(html).toContain('2 / 5')
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

const PRACTICE = practiceSteps(
  { type: (t) => typeLabel(testOntology, t), predicate: (p) => predicateLabel(testOntology, p) },
  { predicate: 'SUPPLIES_TO', objectType: 'Company' },
)

const renderPractice = (step = PRACTICE[1], index = 1, canReopen = false) =>
  renderToStaticMarkup(
    <GuideBubble
      kind="practice"
      step={step}
      index={index}
      total={PRACTICE.length}
      busy={false}
      wide
      onNext={() => {}}
      onFinish={() => {}}
      onSkip={() => {}}
      onStop={() => {}}
      onResume={() => {}}
      onReopen={() => {}}
      canReopen={canReopen}
    />,
  )

describe('따라하기 말풍선', () => {
  it('기업 단계는 「그만두기」 만 있고 「다음」 이 없다', () => {
    const html = renderPractice()
    expect(html).toContain('data-step="company"')
    expect(html).toContain('data-testid="guide-stop"')
    expect(html).not.toContain('data-testid="guide-next"')
    expect(html).not.toContain('data-testid="guide-reopen"')
  })

  it('주장 폼을 취소했으면 「폼 다시 열기」 가 나온다', () => {
    expect(renderPractice(PRACTICE[3], 3, true)).toContain('data-testid="guide-reopen"')
  })

  it('말풍선은 만들기 창의 오버레이보다 위에 그리고 누르기를 받는다', () => {
    expect(renderPractice()).toMatch(/data-testid="guide-bubble"[^>]*class="[^"]*pointer-events-auto[^"]*z-\[60\]/)
  })

  it('마침 단계는 「끝내기」 만 있다', () => {
    const html = renderPractice(PRACTICE[4], 4)
    expect(html).toContain('data-testid="guide-finish"')
    expect(html).not.toContain('data-testid="guide-stop"')
    expect(html).not.toContain('data-testid="guide-skip"')
  })

  it('이어서 하기 단계는 「이어서 하기」 와 「그만두기」 를 묻는다', () => {
    const html = renderPractice(RESUME_STEP, 2)
    expect(html).toContain('data-step="resume"')
    expect(html).toContain('data-testid="guide-resume"')
    expect(html).toContain('data-testid="guide-stop"')
    expect(html).not.toContain('data-testid="guide-skip"')
  })
})

describe('가이드가 미리 채운 폼', () => {
  it('노드 만들기 폼은 넘긴 처음 값을 입력칸에 넣는다', () => {
    const html = renderToStaticMarkup(
      withApp(<NodeCreateForm type="Company" testIdPrefix="create" initialValues={{ name: '[연습] A 기업' }} onCreated={() => {}} onCancel={() => {}} />),
    )
    expect(html).toMatch(/data-testid="create-prop-name"[^>]*value="\[연습\] A 기업"|value="\[연습\] A 기업"[^>]*data-testid="create-prop-name"/)
  })

  it('주장 만들기 폼은 넘긴 설명을 설명 칸에 넣는다', () => {
    const subject: NodeView = {
      id: 'c1',
      type: 'Company',
      label: '가상기업',
      properties: {},
      revision: 1,
      archived: false,
      archivedAt: null,
      createdAt: '2026-10-23T00:00:00Z',
      createdBy: null,
      updatedAt: '2026-10-23T00:00:00Z',
      updatedBy: null,
      reviewStatus: null,
    }
    const html = renderToStaticMarkup(
      withApp(<ClaimCreateForm initialSubject={subject} initialDescription="[연습] 가이드로 만든 주장입니다" onCreated={() => {}} onCancel={() => {}} />),
    )
    expect(html).toMatch(/data-testid="claim-description"[^>]*>\[연습\] 가이드로 만든 주장입니다<\/textarea>/)
  })
})
