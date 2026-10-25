import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { orderedTypes } from '../../lib/typeOrder'
import { testOntology, withApp } from '../testSupport'
import type { NodeView } from '../../api/types'
import { ConceptMapTab } from './ConceptMapTab'
import { RecentItems } from './TypePanel'

function render(path: string): string {
  return renderToStaticMarkup(withApp(<ConceptMapTab onOpenNode={() => {}} onTrace={() => {}} />, testOntology, undefined, path))
}

/** 타입 목록 단추의 data-type 을 그린 순서대로 */
function listedTypes(html: string): string[] {
  return [...html.matchAll(/data-testid="map-type" data-type="([^"]+)"/g)].map((m) => m[1])
}

describe('개념 지도', () => {
  it('타입 목록은 타입 순서대로 그리고 주장 타입은 목록 대신 안내로 보인다', () => {
    const html = render('/map')
    expect(listedTypes(html)).toEqual(orderedTypes(testOntology))
    expect(listedTypes(html)).not.toContain('Claim')
    expect(html).toContain('data-testid="map-claim-note"')
    expect(html).toContain('주장은 어느 항목에나 붙일 수 있습니다')
    expect(html).toContain('data-testid="map-intro"')
    expect(html).not.toContain('data-testid="map-type-panel"')
  })

  it('주소의 type 이 지도에 있는 타입이면 그 타입 칸을 연다', () => {
    const html = render('/map?type=Company')
    expect(html).toMatch(/data-testid="map-type-panel" data-type="Company"/)
    expect(html).toContain('data-testid="map-relation" data-relationship="ISSUES"')
    expect(html).toMatch(/data-type="Company" aria-pressed="true"/)
  })

  it('주소의 type 이 주장 타입이거나 없는 타입이면 타입 칸을 열지 않는다', () => {
    expect(render('/map?type=Claim')).not.toContain('data-testid="map-type-panel"')
    expect(render('/map?type=Nope')).not.toContain('data-testid="map-type-panel"')
  })
})

describe('타입 칸의 최근 항목', () => {
  const item = (id: string, name: string): NodeView => ({
    id,
    type: 'Company',
    label: name,
    properties: { name },
    revision: 1,
    archived: false,
    archivedAt: null,
    createdAt: '2026-10-20T03:15:00Z',
    createdBy: null,
    updatedAt: '2026-10-20T03:15:00Z',
    updatedBy: null,
    reviewStatus: null,
  })

  it('줄마다 이름과 근거 따라가기가 있고 둘 다 그 항목 id 를 갖는다', () => {
    const html = renderToStaticMarkup(withApp(<RecentItems items={[item('a', '가나전자'), item('b', '다라전자')]} onOpenNode={() => {}} onTrace={() => {}} />))
    const ids = (testId: string) => [...html.matchAll(new RegExp(`data-testid="${testId}" data-node-id="([^"]+)"`, 'g'))].map((m) => m[1])
    expect(ids('map-recent-item')).toEqual(['a', 'b'])
    expect(ids('map-recent-trace')).toEqual(['a', 'b'])
  })
})
