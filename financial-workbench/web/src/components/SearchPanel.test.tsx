import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { orderedTypes } from '../lib/typeOrder'
import { advancedFilterCount, SearchPanel } from './SearchPanel'
import { testOntology, withApp } from './testSupport'

function render(hops = 1): string {
  return renderToStaticMarkup(
    withApp(
      <SearchPanel
        filters={{ q: '', types: ['Company', 'Security'], reviewStatus: '', includeArchived: false }}
        onFiltersChange={() => {}}
        selectedId={null}
        onFocus={() => {}}
        refreshTick={0}
        typesParam={() => undefined}
        hops={hops}
        onHopsChange={() => {}}
        claimsAsNodes={false}
        onClaimsAsNodesChange={() => {}}
      />,
    ),
  )
}

describe('advancedFilterCount', () => {
  const base = { reviewStatus: '', includeArchived: false, hops: 1, claimsAsNodes: false }

  it('기본값이면 0 이다', () => {
    expect(advancedFilterCount(base)).toBe(0)
  })

  it('검토 상태와 이웃 단계만 바꾸면 2 다', () => {
    expect(advancedFilterCount({ ...base, reviewStatus: 'DRAFT', hops: 2 })).toBe(2)
  })

  it('네 조건을 모두 바꾸면 4 다', () => {
    expect(advancedFilterCount({ reviewStatus: 'DRAFT', includeArchived: true, hops: 2, claimsAsNodes: true })).toBe(4)
  })
})

describe('SearchPanel 고급 필터와 종류 칩', () => {
  it('고급 필터는 접힌 채 그려지고 머리글에 개수가 없다', () => {
    const html = render()
    expect(html).toMatch(/<details[^>]*data-testid="advanced-filters"/)
    expect(html).not.toMatch(/<details[^>]*data-testid="advanced-filters"[^>]*\bopen\b/)
    expect(html).toMatch(/data-testid="advanced-filters-toggle">고급 필터<\/summary>/)
  })

  it('이웃 단계를 바꾸면 머리글에 개수가 붙는다', () => {
    expect(render(2)).toMatch(/data-testid="advanced-filters-toggle">고급 필터 \(1\)<\/summary>/)
  })

  it('칩은 타입 순서대로 나오고 주장이 맨 뒤이며 눌림을 aria-pressed 로 보인다', () => {
    const html = render()
    const ids = [...html.matchAll(/data-testid="filter-type-([A-Za-z]+)"/g)].map((m) => m[1])
    expect(ids).toEqual([...orderedTypes(testOntology), 'Claim'])
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="filter-type-Company"|data-testid="filter-type-Company"[^>]*aria-pressed="true"/)
    expect(html).toMatch(/data-testid="filter-type-Person"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*data-testid="filter-type-Person"/)
  })
})
