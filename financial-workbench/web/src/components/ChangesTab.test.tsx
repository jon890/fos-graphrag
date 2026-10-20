import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ChangeEventView } from '../api/types'
import { ChangeRows } from './ChangesTab'

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
    ...overrides,
  }
}

const render = (items: ChangeEventView[]) => renderToStaticMarkup(<table><tbody><ChangeRows items={items} onOpen={() => {}} /></tbody></table>)

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
})
