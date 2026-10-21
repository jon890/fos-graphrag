import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ClaimPredicateDef, NodeView } from '../api/types'
import { ClaimCreateForm, keepAccepted } from './ClaimCreateForm'
import { withApp } from './testSupport'

const subject = { id: 's1', type: 'Company', label: '가나전자' } as NodeView

describe('ClaimCreateForm', () => {
  it('초기 주체가 있으면 문장 순서대로 주체, 대상, 뒤 글이 나온다', () => {
    const html = renderToStaticMarkup(withApp(<ClaimCreateForm initialSubject={subject} onCreated={() => {}} onCancel={() => {}} />))
    const sel = html.indexOf('data-testid="claim-subject-selected"')
    const obj = html.indexOf('claim-object-picker-input')
    expect(sel).toBeGreaterThan(-1)
    expect(html.slice(sel, obj)).toContain('가나전자')
    expect(obj).toBeGreaterThan(sel)
    expect(html.indexOf('에 공급한다')).toBeGreaterThan(obj)
    expect(html).toContain('data-testid="claim-sentence-text">가</span>')
  })

  it('초기 주체가 없으면 주체도 고르기 칸이다', () => {
    const html = renderToStaticMarkup(withApp(<ClaimCreateForm onCreated={() => {}} onCancel={() => {}} />))
    expect(html.indexOf('claim-subject-picker-input')).toBeGreaterThan(-1)
    expect(html.indexOf('claim-subject-picker-input')).toBeLessThan(html.indexOf('claim-object-picker-input'))
    expect(html).toContain('>이(가)</span>')
  })

  it('shadcn 선택 칸과 바꾸기, 취소 단추를 그린다', () => {
    const html = renderToStaticMarkup(withApp(<ClaimCreateForm onCreated={() => {}} onCancel={() => {}} />))
    expect(html).toMatch(/<select[^>]*data-testid="claim-predicate-select"/)
    expect(html).toContain('data-slot="native-select"')
    expect(html).toContain('data-testid="claim-swap"')
    expect(html).toContain('data-testid="claim-add-cancel"')
    expect(html).not.toContain('class="sub-form"')
  })
})

describe('keepAccepted', () => {
  const def: ClaimPredicateDef = { label: 'x', description: '', subjectTypes: ['Company'], objectTypes: ['Company'] }
  it('받지 않는 타입의 칸만 비운다', () => {
    const sector = { id: 'x', type: 'Sector', label: '산업' } as NodeView
    expect(keepAccepted(def, sector, subject)).toEqual({ subject: null, object: subject })
  })
  it('정의가 없으면 그대로 둔다', () => {
    expect(keepAccepted(undefined, subject, subject)).toEqual({ subject, object: subject })
  })
})
