import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChangeEventView } from '../api/types'
import { ChangeRows } from './ChangesTab'
import { testOntology, withApp } from './testSupport'

function event(overrides: Partial<ChangeEventView>): ChangeEventView {
  return {
    id: 'e1',
    at: '2026-10-20T03:15:00Z',
    actor: { id: 'u1', email: 'alice@example.com', displayName: 'Alice' },
    action: 'CREATE',
    targetId: 't1',
    targetKind: 'NODE',
    targetType: 'Company',
    targetLabel: '가상전자',
    revision: 1,
    changes: { name: { before: null, after: '가상전자' } },
    note: null,
    refs: {},
    ...overrides,
  }
}

const render = (items: ChangeEventView[], ontology = testOntology) =>
  renderToStaticMarkup(withApp(<table><tbody><ChangeRows items={items} onOpen={() => {}} /></tbody></table>, ontology))

describe('ChangeRows', () => {
  it('작성자가 없는 이력(첫 관리자 생성 등)도 그리고 「시스템」 으로 보인다', () => {
    const html = render([
      event({ id: 'e0', actor: null, targetKind: 'USER', targetType: 'User', targetLabel: 'admin@example.com', note: '시작 설정으로 만든 첫 관리자' }),
      event({ id: 'e1' }),
    ])
    expect(html).toContain('시스템')
    expect(html).toContain('Alice')
    expect(html.match(/data-testid="change-row"/g)).toHaveLength(2)
  })

  it('작성자가 있으면 표시 이름과 이메일 툴팁을 보인다', () => {
    const html = render([event({})])
    expect(html).toContain('title="alice@example.com"')
    expect(html).not.toContain('시스템')
  })

  it('작업 이름과 대상 종류, enum 값은 온톨로지 표시 이름으로 보인다', () => {
    const html = render([
      event({ action: 'ARCHIVE', targetType: 'Security', targetLabel: '가상전자 보통주', changes: { market: { before: 'KRX_KOSPI', after: 'KRX_KOSDAQ' } } }),
      event({ id: 'e2', targetType: 'Claim', targetLabel: 'SUPPLIES_TO', changes: { predicate: { before: null, after: 'SUPPLIES_TO' } } }),
    ])
    expect(html).toContain('>보관<')
    expect(html).toContain('종목')
    expect(html).toContain('상장 시장')
    expect(html).toContain('코스피 → 코스닥')
    // Claim 이름은 서버가 키(SUPPLIES_TO)로 준다. 화면은 표시 이름으로 바꾼다.
    expect(html).toContain('>공급한다<')
    expect(html).not.toContain('>ARCHIVE<')
  })

  it('온톨로지에 없는 타입과 작업은 키를 그대로 보인다', () => {
    const html = render([event({ action: 'UPDATE', targetType: 'Mystery', targetLabel: '??', changes: { archived: { before: false, after: true } } })])
    expect(html).toContain('>UPDATE<')
    expect(html).toContain('Mystery')
    expect(html).toContain('archived')
  })

  it('주장 이력의 주체는 이름으로 보이고 ID 와 영문 키, 수정 번호 열은 없다', () => {
    const html = render([
      event({
        targetType: 'Claim',
        targetLabel: 'SUPPLIES_TO',
        changes: { subjectId: { before: null, after: 'c1' } },
        refs: { c1: { id: 'c1', type: 'Company', label: '가나전자', archived: false } },
      }),
    ], { ...testOntology, changeFields: { subjectId: { label: '주체' } } })
    const text = html.replace(/<[^>]*>/g, '|')
    expect(html).toContain('주체')
    expect(text).not.toContain('subjectId')
    expect(html).toContain('가나전자')
    expect(text).not.toContain('|c1|')
    expect(html).not.toContain('font-mono')
    expect(html).not.toContain('수정 번호</')
    expect(html).toContain('title="수정 번호 1"')
  })
})
