import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { withApp } from '../testSupport'
import { MoreMenu } from './MoreMenu'

const render = (pendingCount: number | null) =>
  renderToStaticMarkup(withApp(<MoreMenu role="EDITOR" activeTab={null} onOpen={() => {}} pendingCount={pendingCount} />))

describe('MoreMenu 의 대기 제안 배지', () => {
  it('대기가 있으면 더보기 단추 안에 수를 보인다', () => {
    const html = render(3)
    expect(html).toContain('data-testid="more-pending-badge"')
    expect(html).toContain('data-count="3"')
  })

  it('대기가 없거나 수를 읽지 못하면 배지가 없다', () => {
    expect(render(0)).not.toContain('more-pending-badge')
    expect(render(null)).not.toContain('more-pending-badge')
  })

  it('제안 화면이 열려 있으면 더보기 단추가 선택된 것으로 보인다', () => {
    const html = renderToStaticMarkup(withApp(<MoreMenu role="VIEWER" activeTab="proposals" onOpen={() => {}} pendingCount={null} />))
    expect(html).toContain('data-active="true"')
  })
})
