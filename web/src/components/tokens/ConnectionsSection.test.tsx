import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConnectionView } from '../../api/types'
import { ConnectionsList, ConnectionsSection } from './ConnectionsSection'

const connection: ConnectionView = {
  id: 'c1',
  clientName: 'Claude Code',
  scope: 'READ',
  createdAt: '2026-10-26T03:15:00.123456Z',
  lastUsedAt: null,
}

describe('ConnectionsSection', () => {
  it('첫 렌더에 제목과 안내가 있다', () => {
    const html = renderToStaticMarkup(<ConnectionsSection />)
    expect(html).toContain('data-testid="connections-section"')
    expect(html).toContain('>연결된 앱</h2>')
    expect(html).toContain('data-testid="connections-guide"')
  })

  it('빈 목록이면 안내만 보인다', () => {
    const html = renderToStaticMarkup(<ConnectionsList connections={[]} onDisconnect={() => {}} />)
    expect(html).toContain('아직 연결한 앱이 없습니다.')
    expect(html).not.toContain('connections-table')
  })

  it('한 줄이면 앱 이름, 조회만, 아직 쓰지 않음, 끊기 단추가 보인다', () => {
    const html = renderToStaticMarkup(<ConnectionsList connections={[connection]} onDisconnect={() => {}} />)
    expect(html).toContain('data-name="Claude Code"')
    expect(html).toContain('조회만')
    expect(html).toContain('data-scope="READ"')
    expect(html).toContain('아직 쓰지 않음')
    expect(html).toContain('data-testid="connections-row-disconnect"')
  })
})
