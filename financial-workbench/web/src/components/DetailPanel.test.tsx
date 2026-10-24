import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { NodeView, RelationshipView } from '../api/types'
import { relationSentence } from '../lib/relationSentence'
import { hasClaimPredicateForNode } from './DetailPanel'
import { NodeReadCard } from './NodeReadCard'
import { RelationshipSection } from './RelationshipSection'
import { testOntology, withApp } from './testSupport'

const node = (over: Partial<NodeView>): NodeView => ({
  id: 'n1',
  type: 'Company',
  label: 'x',
  properties: {},
  revision: 1,
  archived: false,
  archivedAt: null,
  createdAt: '2026-10-20T03:15:00Z',
  createdBy: null,
  updatedAt: '2026-10-20T03:15:00Z',
  updatedBy: null,
  reviewStatus: null,
  ...over,
})

describe('주장 추가 가능 여부', () => {
  const ontology = {
    ...testOntology,
    nodeTypes: {
      ...testOntology.nodeTypes,
      Sector: {
        label: '산업',
        description: '산업 분류',
        labelProperty: 'name',
        properties: { name: { type: 'string' as const, label: '산업 이름', required: true } },
      },
      Gone: {
        label: '어느 끝에도 없는 타입',
        description: '주장에 쓰지 않는다',
        labelProperty: 'name',
        properties: { name: { type: 'string' as const, label: '이름', required: true } },
      },
    },
    claimPredicates: {
      BELONGS_TO_SECTOR: {
        label: '속한다',
        description: '',
        sentence: '{subject}이(가) {object}에 속한다',
        subjectTypes: ['Company'],
        objectTypes: ['Sector'],
      },
    },
  }

  it('대상 전용 타입도 주장 추가를 연다', () => {
    expect(hasClaimPredicateForNode(ontology, 'Sector')).toBe(true)
  })

  it('어느 끝에도 없는 타입에는 주장 추가를 열지 않는다', () => {
    expect(hasClaimPredicateForNode(ontology, 'Gone')).toBe(false)
  })
})

describe('읽기 카드의 속성 목록', () => {
  const render = (n: NodeView) => renderToStaticMarkup(withApp(<NodeReadCard node={n} />))
  const props = (html: string) => [...html.matchAll(/data-prop="([^"]+)"/g)].map((m) => m[1])

  it('빈 값 속성은 빼고 온톨로지 속성 순서대로 보인다', () => {
    // 저장 순서와 달리 온톨로지 순서(market, name)를 따른다. 빈 문자열과 null 은 숨긴다.
    expect(props(render(node({ type: 'Security', properties: { name: '가나 보통주', market: 'KRX_KOSPI' } })))).toEqual(['market', 'name'])
    expect(props(render(node({ properties: { name: '가나전자', country: '' } })))).toEqual(['name'])
    expect(props(render(node({ properties: { name: '가나전자', country: null } })))).toEqual(['name'])
  })

  it('enum 은 저장 값이 아니라 선택지 이름으로 보인다', () => {
    const html = render(node({ properties: { name: '가나전자', country: 'KR' } }))
    expect(html).toContain('<dt>국가</dt><dd>대한민국 (KR)</dd>')
    expect(html).toContain('<dt>기업 이름</dt><dd>가나전자</dd>')
  })

  it('값이 하나도 없으면 안내 문장을 보인다', () => {
    const html = render(node({ properties: { name: '', country: null } }))
    expect(html).toContain('적은 내용이 없습니다.')
    expect(html).not.toContain('data-testid="node-prop"')
  })
})

describe('연결 절의 관계 문장', () => {
  const company = { id: 'c1', type: 'Company', label: '가나전자', archived: false }
  const security = { id: 's1', type: 'Security', label: '가나 보통주', archived: false }
  const rel: RelationshipView = {
    id: 'r1',
    type: 'ISSUES',
    from: company,
    to: security,
    revision: 1,
    archived: false,
    createdAt: '2026-10-20T03:15:00Z',
    createdBy: null,
  }
  const render = (self: NodeView) =>
    renderToStaticMarkup(
      withApp(<RelationshipSection node={self} relationships={[rel]} onChanged={() => {}} onError={() => {}} onOpenNode={() => {}} />),
    )
  // 문장 칸의 글자만 남긴다. 뒤따르는 「연결 보관」 단추와 배지는 문장이 아니다
  const sentenceText = (html: string) => {
    const rest = html.slice(html.indexOf('class="rel-sentence"'))
    const cut = rest.search(/<button[^>]*relationship-archive-toggle|<span class="archived-badge"|<\/li>/)
    return rest.slice(rest.indexOf('>') + 1, cut).replace(/<[^>]+>/g, '')
  }

  it('이 항목이 시작이면 이름은 굵게, 상대 이름은 여는 링크로 보이고 방향은 out 이다', () => {
    const html = render(node({ id: 'c1', label: '가나전자' }))
    expect(html).toContain('data-direction="out"')
    expect(html).toMatch(/<strong data-testid="relationship-self">가나전자<\/strong>/)
    expect(html).toMatch(/<a[^>]*data-testid="relationship-open"[^>]*data-node-id="s1"[^>]*>가나 보통주<\/a>/)
    expect(sentenceText(html)).toBe(relationSentence(testOntology, 'ISSUES', '가나전자', '가나 보통주'))
    expect(sentenceText(html)).toBe('가나전자가 가나 보통주를 발행합니다')
  })

  it('상대 이름 링크는 그 항목의 작업 공간 상세 주소를 갖고, 조사는 이름 바로 뒤에 공백 없이 붙는다', () => {
    const html = render(node({ id: 'c1', label: '가나전자' }))
    expect(html).toMatch(/<a href="\/workspace\?node=s1&amp;pane=detail"[^>]*data-testid="relationship-open"/)
    expect(html).toMatch(/가나전자<\/strong><span>가 <\/span><a[^>]*>가나 보통주<\/a><span>를 발행합니다<\/span>/)
  })

  it('이 항목이 끝이어도 같은 문장이고 방향은 in 이다', () => {
    const html = render(node({ id: 's1', type: 'Security', label: '가나 보통주' }))
    expect(html).toContain('data-direction="in"')
    expect(html).toMatch(/<strong data-testid="relationship-self">가나 보통주<\/strong>/)
    expect(html).toMatch(/<a[^>]*data-testid="relationship-open"[^>]*data-node-id="c1"[^>]*>가나전자<\/a>/)
    expect(sentenceText(html)).toBe(relationSentence(testOntology, 'ISSUES', '가나전자', '가나 보통주'))
  })

  it('연결이 없으면 안내 문장을 보인다', () => {
    const html = renderToStaticMarkup(
      withApp(<RelationshipSection node={node({})} relationships={[]} onChanged={() => {}} onError={() => {}} onOpenNode={() => {}} />),
    )
    expect(html).toContain('아직 연결된 항목이 없습니다.')
    expect(html).toContain('＋ 연결 추가')
  })
})
