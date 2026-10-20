import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NodeCreateForm } from './NodeCreateForm'
import { SearchPanel } from './SearchPanel'
import { StatusBadge, TypeBadge } from './TypeBadge'
import { WelcomeGuide } from './WelcomeGuide'
import { withApp } from './testSupport'

// 「Person」 은 화면 코드에 없는 타입이다. 온톨로지에만 있어도 화면이 따라오는지 본다.
describe('온톨로지에 새로 더한 타입', () => {
  it('만들기 폼이 한국어 칸 이름, 선택지, 도움말을 보이고 타입 표시를 보이지 않는다', () => {
    const html = renderToStaticMarkup(withApp(<NodeCreateForm type="Person" testIdPrefix="create" onCreated={() => {}} onCancel={() => {}} />))
    expect(html).toContain('>이름')
    expect(html).toContain('투자 스타일')
    expect(html).toContain('>가치 투자</option>')
    expect(html).toContain('널리 알려진 이름')
    expect(html).toContain('인물 만들기')
    expect(html).not.toContain('문자열')
    expect(html).not.toContain('>VALUE<')
  })

  it('종목 선택지는 저장 값은 그대로 두고 표시 이름만 바꾼다', () => {
    const html = renderToStaticMarkup(withApp(<NodeCreateForm type="Security" testIdPrefix="create" onCreated={() => {}} onCancel={() => {}} />))
    expect(html).toContain('<option value="KRX_KOSPI">코스피</option>')
    expect(html).toContain('<option value="KRX_KOSDAQ">코스닥</option>')
  })

  it('검색 패널의 종류 필터와 만들기 선택지에 새 타입이 나온다', () => {
    const html = renderToStaticMarkup(
      withApp(
        <SearchPanel
          filters={{ q: '', types: ['Company', 'Security', 'Person', 'Claim'], reviewStatus: '', includeArchived: false }}
          onFiltersChange={() => {}}
          selectedId={null}
          onFocus={() => {}}
          onCreated={() => {}}
          refreshTick={0}
          typesParam={() => undefined}
        />,
      ),
    )
    expect(html).toContain('data-testid="filter-type-Person"')
    expect(html).toContain('<option value="Person">인물</option>')
    expect(html).toContain('<option value="DRAFT">초안</option>')
    // Claim 은 전용 API 로 만들므로 만들기 선택지에 없다.
    expect(html).not.toContain('<option value="Claim">')
    expect(html).not.toContain('새 노드')
  })

  it('배지는 표시 이름을 보이고 키를 data 속성에 남긴다', () => {
    const html = renderToStaticMarkup(withApp(<><TypeBadge type="Person" /><StatusBadge status="REJECTED" /><TypeBadge type="Mystery" /></>))
    expect(html).toContain('>인물<')
    expect(html).toContain('data-type="Person"')
    expect(html).toContain('>반려<')
    expect(html).toContain('>Mystery<')
  })
})

describe('첫 화면 안내', () => {
  it('앱을 한 줄로 소개하고 시작 순서를 보인다', () => {
    const html = renderToStaticMarkup(withApp(<WelcomeGuide />))
    expect(html).toContain('투자 지식을 근거와 함께 쌓는 곳')
    expect(html).toContain('기업 추가')
    expect(html).toContain('근거 문서 등록')
    expect(html).toContain('주장 추가')
    // 소개 문장은 종목에만 묶이지 않는다.
    expect(html).not.toContain('종목을')
  })
})
