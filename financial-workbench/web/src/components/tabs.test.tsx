import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ClaimView, CurrentUser, Page } from '../api/types'
import { ListTab } from './ListTab'
import { LoginView } from './LoginView'
import { ChangesTab } from './ChangesTab'
import { OntologyTab } from './OntologyTab'
import { Pager } from './Pager'
import { ReviewRow, ReviewTab } from './ReviewTab'
import { UsersTab } from './UsersTab'
import { testOntology, withApp } from './testSupport'

describe('머리글 밖 탭의 첫 렌더', () => {
  it('LoginView 는 거절 안내와 로그인 버튼을 보이고 옛 카드 class 를 쓰지 않는다', () => {
    const html = renderToStaticMarkup(<LoginView denied={true} />)
    expect(html).toContain('data-testid="login-denied"')
    expect(html).toContain('data-testid="login-google"')
    expect(html).not.toContain('login-card')
  })

  it('LoginView 는 거절이 아니면 세션 안내를 role 없이 보인다', () => {
    const html = renderToStaticMarkup(<LoginView denied={false} notice="세션이 만료되었습니다." />)
    expect(html).toContain('data-testid="login-notice"')
    expect(html).not.toContain('data-testid="login-denied"')
    expect(html).toMatch(/<div[^>]*data-testid="login-notice"/)
    expect(html.match(/<div[^>]*data-testid="login-notice"[^>]*>/)?.[0]).not.toContain('role=')
  })

  it('ListTab 은 HTML 기본 select 도구 줄을 그리고 옛 표 class 를 쓰지 않는다', () => {
    const html = renderToStaticMarkup(withApp(<ListTab onOpen={() => {}} />))
    expect(html).toContain('<select')
    expect(html).toContain('data-testid="list-type-filter"')
    expect(html).not.toContain('data-table')
  })

  it('UsersTab 은 역할 선택을 HTML 기본 select 로 그리고 옛 class 를 쓰지 않는다', () => {
    const html = renderToStaticMarkup(withApp(<UsersTab onOpenHistory={() => {}} />))
    expect(html).toMatch(/<select[^>]*data-testid="users-add-role"/)
    expect(html).toContain('data-slot="native-select"')
    for (const old of ['sub-form', 'data-table', 'disabled-row']) expect(html).not.toContain(old)
  })

  it('Pager 는 shadcn 버튼 두 개와 쪽 번호를 그린다', () => {
    const page: Page<unknown> = { items: [], page: 1, size: 20, totalItems: 45, totalPages: 3 }
    const html = renderToStaticMarkup(<Pager page={page} onPage={() => {}} testIdPrefix="p" />)
    expect(html.match(/data-slot="button"/g)).toHaveLength(2)
    expect(html).not.toContain('class="pager"')
    expect(html).toContain('2 / 3 쪽 (전체 45건)')
  })

  it('Pager 는 첫 쪽에서 이전을, 끝 쪽에서 다음을 막는다', () => {
    const base = { items: [], size: 20, totalItems: 45, totalPages: 3 }
    const first = renderToStaticMarkup(<Pager page={{ ...base, page: 0 }} onPage={() => {}} testIdPrefix="p" />)
    expect(first).toMatch(/<button[^>]*data-testid="p-prev"[^>]*disabled/)
    const last = renderToStaticMarkup(<Pager page={{ ...base, page: 2 }} onPage={() => {}} testIdPrefix="p" />)
    expect(last).toMatch(/<button[^>]*data-testid="p-next"[^>]*disabled/)
  })

  it('OntologyTab 은 버전 표시를 그리고 옛 타입 구역 class 를 쓰지 않는다', () => {
    const html = renderToStaticMarkup(withApp(<OntologyTab />))
    expect(html).toContain('data-testid="ontology-version"')
    expect(html).not.toContain('ontology-type')
  })

  it('ReviewTab 은 첫 렌더에 shadcn 표를 그리고 옛 표 class 를 쓰지 않는다', () => {
    const html = renderToStaticMarkup(withApp(<ReviewTab onOpen={() => {}} />))
    expect(html).toContain('data-testid="review-tab"')
    expect(html).toContain('data-slot="table"')
    expect(html).not.toContain('data-table')
    expect(html).toContain('data-testid="review-section-reviewable"')
    expect(html).toContain('data-testid="review-section-mine"')
    expect(html).toContain('내가 검토할 주장')
    expect(html).toContain('내가 쓰거나 고친 주장')
  })

  it('ReviewTab 은 열람자에게 구역 없이 한 목록만 보인다', () => {
    const viewer: CurrentUser = { id: 'v1', email: 'v@example.com', displayName: 'V', role: 'VIEWER' }
    const html = renderToStaticMarkup(withApp(<ReviewTab onOpen={() => {}} />, testOntology, viewer))
    expect(html).not.toContain('review-section-')
    expect(html).toContain('data-testid="review-table"')
  })

  it('ReviewRow 는 마지막으로 내용을 고친 사람에게 승인을 막고 안내한다', () => {
    const claim = {
      id: 'c2',
      revision: 1,
      type: 'Claim',
      properties: { predicate: 'SUPPLIES', evidenceText: '근거' },
      createdBy: { id: 'other', email: 'o@example.com', displayName: 'Other' },
      contentUpdatedBy: { id: 'u1', email: 'a@example.com', displayName: 'A' },
      createdAt: '2026-10-20T03:15:00Z',
      subject: null,
      object: null,
    } as unknown as ClaimView
    const html = renderToStaticMarkup(
      withApp(
        <table>
          <tbody>
            <ReviewRow claim={claim} onDone={() => {}} onError={() => {}} onOpen={() => {}} />
          </tbody>
        </table>,
      ),
    )
    expect(html).toContain('data-testid="review-own-hint"')
    expect(html).toMatch(/<button[^>]*data-testid="review-row-approve"[^>]*disabled/)
  })

  it('ReviewRow 는 승인과 반려 버튼을 shadcn 버튼으로 그리고 옛 class 를 쓰지 않는다', () => {
    const claim = {
      id: 'c1',
      revision: 1,
      type: 'Claim',
      properties: { predicate: 'SUPPLIES', evidenceText: '근거' },
      createdBy: { id: 'other', email: 'o@example.com', displayName: 'Other' },
      createdAt: '2026-10-20T03:15:00Z',
      subject: null,
      object: null,
    } as unknown as ClaimView
    const html = renderToStaticMarkup(
      withApp(
        <table>
          <tbody>
            <ReviewRow claim={claim} onDone={() => {}} onError={() => {}} onOpen={() => {}} />
          </tbody>
        </table>,
      ),
    )
    expect(html).toMatch(/<button[^>]*data-testid="review-row-approve"/)
    expect(html).toMatch(/<button[^>]*data-testid="review-row-reject"/)
    expect(html).toMatch(/<input[^>]*data-testid="review-row-note"/)
    expect(html).not.toContain('review-actions')
  })

  it('ChangesTab 은 대상 필터를 input 으로 그리고 옛 표 class 를 쓰지 않는다', () => {
    const html = renderToStaticMarkup(withApp(<ChangesTab targetId="" onTargetIdChange={() => {}} onOpen={() => {}} />))
    expect(html).toMatch(/<input[^>]*data-testid="changes-target-filter"/)
    expect(html).not.toContain('data-table')
  })
})
