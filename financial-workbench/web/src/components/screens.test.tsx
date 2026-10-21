import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NodeView } from '../api/types'
import { NodeCreateForm } from './NodeCreateForm'
import { NodeEditForm } from './NodeEditForm'
import { PropertyFields } from './PropertyFields'
import { SearchPanel } from './SearchPanel'
import { StatusBadge, TypeBadge } from './TypeBadge'
import { WelcomeGuide } from './WelcomeGuide'
import { testOntology, withApp } from './testSupport'

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

  it('종목 만들기 폼에만 발행 기업 고르기 칸이 있다', () => {
    const security = renderToStaticMarkup(withApp(<NodeCreateForm type="Security" testIdPrefix="create" onCreated={() => {}} onCancel={() => {}} />))
    expect(security).toContain('발행 기업')
    expect(security).toContain('create-link-ISSUES-picker-input')
    const company = renderToStaticMarkup(withApp(<NodeCreateForm type="Company" testIdPrefix="create" onCreated={() => {}} onCancel={() => {}} />))
    expect(company).not.toContain('create-link-ISSUES-picker-input')
  })

  it('저장된 값이 목록 밖인 enum 칸은 선택지로 보인다', () => {
    const defs = testOntology.nodeTypes.Company.properties
    const render = (country: string) =>
      renderToStaticMarkup(
        <PropertyFields defs={defs} values={{ name: 'x', country }} testIdPrefix="edit-prop" onChange={() => {}} />,
      )
    const unlisted = render('KOR')
    expect(unlisted).toContain('목록에 없는 값: KOR')
    expect(unlisted).toContain('edit-prop-country-unlisted')
    expect(render('KR')).not.toContain('edit-prop-country-unlisted')
  })

  it('주소 입력칸은 브라우저 형식 검사를 받지 않는다', () => {
    const html = renderToStaticMarkup(withApp(<NodeCreateForm type="Document" testIdPrefix="claim-doc-create" onCreated={() => {}} onCancel={() => {}} />))
    expect(html).toContain('inputMode="url"')
    expect(html).not.toContain('type="url"')
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
    // Claim 은 전용 API 로 만들지만 주장 폼을 여는 선택지로 나온다.
    expect(html).toContain('<option value="Claim">주장</option>')
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

describe('노드 편집 409 뒤 입력 지키기', () => {
  const node = (over: Partial<NodeView> = {}): NodeView => ({
    id: 'n1',
    type: 'Company',
    label: 'x',
    properties: { name: 'x', country: 'KR' },
    revision: 3,
    archived: false,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: null,
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: null,
    reviewStatus: null,
    ...over,
  })
  const draft = (over: Record<string, unknown> = {}) => ({
    nodeId: 'n1',
    revision: 2,
    base: { name: 'x', country: 'KR' },
    mine: { name: 'y', country: 'KR' },
    ...over,
  })
  const render = (n: NodeView, d: ReturnType<typeof draft>) =>
    renderToStaticMarkup(withApp(<NodeEditForm node={n} draft={d} onSaved={() => {}} onError={() => {}} />))

  it('다시 읽은 뒤 내 입력이 있으면 나만 바꾼 칸을 보인다', () => {
    const html = render(node(), draft())
    expect(html).toContain('data-testid="edit-conflict"')
    expect(html).toContain('data-kind="mine"')
  })

  it('아직 다시 읽지 않았거나 다른 노드의 draft 이면 비교가 없다', () => {
    expect(render(node(), draft({ revision: 3 }))).not.toContain('edit-conflict')
    expect(render(node(), draft({ nodeId: 'other' }))).not.toContain('edit-conflict')
  })

  it('보관된 노드에는 비교가 없다', () => {
    expect(render(node({ archived: true }), draft())).not.toContain('edit-conflict')
  })

  it('둘 다 바꾼 칸은 최신 값이 기본으로 골라진다', () => {
    const html = render(node({ properties: { name: 'z', country: 'KR' } }), draft())
    expect(html).toContain('data-kind="both"')
    expect(html).toMatch(/<input[^>]*data-testid="edit-conflict-choice-name-latest"[^>]*checked/)
    expect(html).not.toMatch(/<input[^>]*data-testid="edit-conflict-choice-name-mine"[^>]*checked/)
  })
})
