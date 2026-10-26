import { expect, request, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import {
  admin,
  authorizeUrl,
  exact,
  fillMockOidc,
  issueToken,
  loginAs,
  newPage,
  newPkce,
  OAUTH_CALLBACK,
  openScreen,
  registerOAuthClient,
  revokeConnections,
  revokeTokensExcept,
  shot,
  shotElement,
  tokenIds,
  type TestUser,
} from './support'

// 두 편집자(A, B)와 관리자, 열람자가 같은 서버에서 협업하는 흐름을 순서대로 확인한다.
// 로그인은 실제 Google 대신 가짜 OIDC 서버(navikt/mock-oauth2-server, interactiveLogin)를 거친다.
// 데이터 이름과 이메일에 실행마다 다른 접미사를 붙여, 이전 실행이 남긴 데이터와 겹치지 않게 한다.

/** 관리자 페이지로 온톨로지를 주어진 버전으로 되돌린다. 단계가 중간에 실패해도 다음 단계에 정의가 남지 않게 finally 에서 부른다. */
async function restoreOntologyVersion(page: Page, version: number): Promise<void> {
  const base = new URL(page.url()).origin
  await page.request.get(`${base}/api/auth/csrf`)
  const xsrf = (await page.context().cookies(base)).find((c) => c.name === 'XSRF-TOKEN')?.value
  const latest = ((await (await page.request.get(`${base}/api/ontology`)).json()) as { version: number }).version
  if (latest === version) return
  const res = await page.request.post(`${base}/api/ontology/versions/${version}/restore`, {
    headers: { 'X-XSRF-TOKEN': xsrf ?? '', 'Content-Type': 'application/json' },
    data: { baseVersion: latest, note: '테스트 정리', confirm: true },
  })
  // 이미 되돌려 바뀐 점이 없으면 서버가 400 으로 답한다.
  expect([201, 400]).toContain(res.status())
}

const suffix = String(Date.now())
const data = {
  company: `가상전자-${suffix}`,
  sector: `가상산업-${suffix}`,
  supplier: `가상전자-${suffix}`,
  customer: `가상산업-${suffix}`,
  security: `가상전자 보통주-${suffix}`,
  ticker: `T${suffix.slice(-10)}`,
  issuerSecurity: `가상발행 우선주-${suffix}`,
  issuerTicker: `I${suffix.slice(-10)}`,
  failedSecurity: `가상실패 보통주-${suffix}`,
  failedTicker: `F${suffix.slice(-10)}`,
  docTitle: `가상부품 사업보고서-${suffix}`,
  docUrl: `https://example.com/financial-workbench/${suffix}`,
  description: `가상전자-${suffix} 는 가상산업-${suffix} 에 속한다.`,
  evidence: `가상전자-${suffix} 는 가상산업-${suffix} 분류에 속한다.`,
  company2: `가상소재-${suffix}`,
  supplier2: `가상소재-${suffix}`,
  docTitle2: `가상소재 감사보고서-${suffix}`,
  docUrl2: `https://example.com/financial-workbench/${suffix}/2`,
  description2: `가상소재-${suffix} 는 가상산업-${suffix} 에 속한다.`,
  evidence2: `가상소재-${suffix} 는 가상산업-${suffix} 분류에 속한다.`,
  reviewNote: '공시 원문과 대조함',
  editByA: `A 가 고친 메모 ${suffix}`,
  editByB: `B 가 고친 메모 ${suffix}`,
  registrationByB: `110111-${suffix.slice(-7)}`,
  change: `AI 서버 증가-${suffix}`,
  bottleneck: `HBM 공급-${suffix}`,
  investmentCompany: `가상수혜기업-${suffix}`,
  investmentSecurity: `가상수혜기업 보통주-${suffix}`,
  investmentTicker: `V${suffix.slice(-10)}`,
  valuation: `가상수혜기업 평가-${suffix}`,
  scenario: `가상수혜기업 기준-${suffix}`,
  decision: `가상수혜기업 매수-${suffix}`,
}

const editorA: TestUser = { sub: `editor-a-${suffix}`, email: `editor-a-${suffix}@example.com`, name: '편집자A' }
const editorB: TestUser = { sub: `editor-b-${suffix}`, email: `editor-b-${suffix}@example.com`, name: '편집자B' }
const viewer: TestUser = { sub: `viewer-${suffix}`, email: `viewer-${suffix}@example.com`, name: '열람자' }
const stranger: TestUser = { sub: `stranger-${suffix}`, email: `stranger-${suffix}@example.com`, name: '외부인' }
// 첫 접속 가이드를 처음 보는 사용자. 다른 테스트의 로그인은 가이드를 건너뛰어 끝낸 기록이 남는다.
const connectUser: TestUser = { sub: `connect-user-${suffix}`, email: `connect-user-${suffix}@example.com`, name: '앱연결사용자' }
const guideViewer: TestUser = { sub: `guide-viewer-${suffix}`, email: `guide-viewer-${suffix}@example.com`, name: '가이드열람자' }
const guideEditor: TestUser = { sub: `guide-editor-${suffix}`, email: `guide-editor-${suffix}@example.com`, name: '가이드편집자' }

async function addUser(page: Page, user: TestUser, role: 'VIEWER' | 'EDITOR' | 'ADMIN'): Promise<void> {
  await page.getByTestId('users-add-email').fill(user.email)
  await page.getByTestId('users-add-name').fill(user.name)
  await page.getByTestId('users-add-role').selectOption(role)
  await page.getByTestId('users-add-submit').click()
  await expect(page.getByTestId('users-message')).toHaveAttribute('data-kind', 'success')
  const row = usersRow(page, user.email)
  await expect(row).toBeVisible()
  await expect(row.getByTestId('users-row-role')).toHaveValue(role)
  await expect(row.getByTestId('users-row-linked')).toHaveText('첫 로그인 전')
}

function usersRow(page: Page, email: string): Locator {
  return page.locator(`[data-testid="users-row"][data-email="${email}"]`)
}

/** 고급 필터를 연다. 이미 열려 있으면 누르지 않는다 */
async function openAdvancedFilters(page: Page): Promise<void> {
  const details = page.getByTestId('advanced-filters')
  if ((await details.getAttribute('open')) === null) await page.getByTestId('advanced-filters-toggle').click()
  await expect(details).toHaveAttribute('open', '')
}

/** 작업 공간 왼쪽 검색으로 노드를 찾아 중심 노드로 연다. */
async function searchAndOpen(page: Page, label: string, options: { includeArchived?: boolean } = {}): Promise<void> {
  await page.getByTestId('tab-workspace').click()
  await openAdvancedFilters(page)
  const archived = page.getByTestId('filter-include-archived')
  if ((await archived.isChecked()) !== !!options.includeArchived) await archived.setChecked(!!options.includeArchived)
  await page.getByTestId('search-input').fill(label)
  await page.getByTestId('search-submit').click()
  // 이미 같은 노드가 열려 있으면 라벨이 처음부터 같다. 상세를 새로 읽은 응답을 기다려야 예전 revision 으로 저장하지 않는다.
  const detailLoaded = page.waitForResponse((r) => r.request().method() === 'GET' && /\/api\/nodes\/[^/?]+$/.test(new URL(r.url()).pathname))
  await searchResult(page, label).click()
  await detailLoaded
  await expect(page.getByTestId('detail-label')).toHaveText(label)
}

/** 상세의 「⋯」 메뉴를 열고 항목을 누른다 */
async function detailMenu(page: Page, item: 'node-copy-link' | 'node-history-link' | 'node-archive-button' | 'node-restore-button'): Promise<void> {
  await page.getByTestId('node-more').click()
  await page.getByTestId(item).click()
}

/** 상세의 「⋯」 메뉴에서 보관 창을 열고 보관한다. 성공하든 실패하든 창은 닫힌다 */
async function archiveFromDetail(page: Page, reason?: string): Promise<void> {
  await detailMenu(page, 'node-archive-button')
  const dialog = page.getByTestId('node-archive-dialog')
  await expect(dialog).toBeVisible()
  if (reason) await dialog.getByTestId('node-archive-reason').fill(reason)
  await dialog.getByTestId('node-archive-confirm').click()
  await expect(dialog).toHaveCount(0)
}

/** 초기 데이터가 만든 항목 이름 */
const seedDecision = 'FLNC 첫 매수'
const seedBottleneck = '데이터센터 전력 접속과 ESS 공급'
const seedChange = '데이터센터가 늘면서 전력 공급과 계통 접속이 막히고, 전력을 저장하고 운영하는 ESS 수요가 커진다'
const seedValuation = 'FLNC 간이 DCF (Valley AI 화면)'

/** 근거 따라가기 화면에서 이름이 같은 단계 카드 */
function traceStep(page: Page, name: string): Locator {
  return page.getByTestId('trace-step').filter({ has: page.getByTestId('trace-step-name').filter({ hasText: exact(name) }) })
}

function searchResult(page: Page, label: string): Locator {
  return page.getByTestId('search-result').filter({ has: page.locator('.result-label', { hasText: exact(label) }) })
}

/** 머리글 「＋ 추가」 에서 타입을 골라 만들기 창을 연다. */
async function openAdd(page: Page, type: string): Promise<Locator> {
  await page.getByTestId('add-open').click()
  await page.getByTestId(`add-type-${type}`).click()
  const dialog = page.getByTestId('add-dialog')
  await expect(dialog).toHaveAttribute('data-type', type)
  return dialog
}

/** 만들기 창의 선택 항목을 펼친다. 이미 펼쳤으면 그대로 둔다. */
async function showOptional(page: Page): Promise<void> {
  const toggle = page.getByTestId('create-optional-toggle')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

/** 「＋ 추가」 창으로 노드를 만든다. 창이 닫히고 작업 공간에서 만든 노드의 상세가 열린다. */
async function createNode(page: Page, type: string, label: string, props: Record<string, string>): Promise<void> {
  const dialog = await openAdd(page, type)
  for (const [name, value] of Object.entries(props)) {
    const input = dialog.getByTestId(`create-prop-${name}`)
    // 선택 속성은 펼쳐야 보인다.
    if ((await input.count()) === 0) await showOptional(page)
    const tag = await input.evaluate((el) => el.tagName)
    if (tag === 'SELECT') await input.selectOption(value)
    else await input.fill(value)
  }
  await dialog.getByTestId('create-submit').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('detail-label')).toHaveText(label)
  // 만든 직후 상세 위에 성공 안내가 나온다.
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  await expect(page.getByTestId('detail-notice')).toContainText('만들었습니다')
}

/** 노드 고르기 입력에서 검색해 정확히 그 이름의 결과를 고른다. */
async function pick(page: Page, prefix: string, label: string): Promise<void> {
  await page.getByTestId(`${prefix}-input`).fill(label)
  await page.getByTestId(`${prefix}-search`).click()
  await page.getByTestId(`${prefix}-result`).filter({ hasText: label }).first().click()
}

test.describe.configure({ mode: 'serial' })

test.describe('가치투자 온톨로지: 역할별 협업', () => {
  const contexts: BrowserContext[] = []
  let pageAdmin: Page
  let pageA: Page
  let pageB: Page
  let pageViewer: Page
  let contextViewer: BrowserContext
  // 2) 에서 만든 산업 소속 주장의 id. 링크와 이력 단계가 쓴다.
  let supplyClaimId = ''

  async function open(browser: Browser): Promise<Page> {
    const { context, page } = await newPage(browser)
    contexts.push(context)
    return page
  }

  test.afterAll(async () => {
    for (const context of contexts) await context.close()
  })

  test('0) 관리자가 편집자 두 명과 열람자를 허용 사용자로 추가한다', async ({ browser }) => {
    pageAdmin = await open(browser)
    await loginAs(pageAdmin, admin)
    await expect(pageAdmin.getByTestId('current-user-role')).toHaveAttribute('data-role', 'ADMIN')

    await openScreen(pageAdmin, 'users')
    await expect(pageAdmin.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(pageAdmin.getByTestId('users-table')).toBeVisible()
    await addUser(pageAdmin, editorA, 'EDITOR')
    await addUser(pageAdmin, editorB, 'EDITOR')
    await addUser(pageAdmin, viewer, 'VIEWER')
    await addUser(pageAdmin, guideViewer, 'VIEWER')
    await addUser(pageAdmin, guideEditor, 'EDITOR')
    await shot(pageAdmin, '00-users-admin')
  })

  test('0b) 목록에 없는 이메일과 확인되지 않은 이메일은 로그인을 거절한다', async ({ browser }) => {
    const strangerPage = await open(browser)
    await loginAs(strangerPage, stranger, 'denied')

    const unverifiedPage = await open(browser)
    await loginAs(unverifiedPage, { ...editorA, sub: `unverified-${suffix}`, emailVerified: false }, 'denied')
    await shot(unverifiedPage, '00b-denied')
  })

  test('0c) 변경 이력 탭을 필터 없이 열어도 작성자가 없는 이력(첫 관리자 생성)이 「시스템」 으로 보이고 화면이 유지된다', async () => {
    const waitForChangesPage = (page: number) =>
      pageAdmin.waitForResponse((response) => {
        const url = new URL(response.url())
        return response.request().method() === 'GET' && url.pathname === '/api/changes' && url.searchParams.get('page') === String(page) && url.searchParams.get('size') === '20'
      })
    const initialPage = waitForChangesPage(0)
    await openScreen(pageAdmin, 'changes')
    await initialPage
    await expect(pageAdmin.getByTestId('changes-table')).toBeVisible()
    // 첫 관리자를 만든 이력은 가장 오래돼서 뒤쪽 쪽에 있을 수 있다.
    const systemRow = pageAdmin.getByTestId('change-row').filter({ hasText: '시작 설정으로 만든 첫 관리자' })
    for (let i = 0; i < 50 && (await systemRow.count()) === 0; i += 1) {
      const next = pageAdmin.getByTestId('changes-pager-next')
      if (await next.isDisabled()) break
      const nextPage = i + 1
      const pageLoaded = waitForChangesPage(nextPage)
      await next.click()
      await pageLoaded
      await expect(pageAdmin.getByTestId('changes-pager-info')).toContainText(`${nextPage + 1} /`)
    }
    await expect(systemRow).toHaveCount(1)
    await expect(systemRow).toContainText('시스템')
    // 머리글과 탭이 남아 있다.
    await expect(pageAdmin.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(pageAdmin.getByTestId('current-user-name')).toHaveText(admin.name)
    await expect(pageAdmin.getByTestId('error-boundary')).toHaveCount(0)
    await shot(pageAdmin, '00c-changes-all-system-actor')
  })

  test('0d) 한 탭이 렌더링 오류를 내도 머리글과 탭이 남고 「다시 시도」 로 돌아온다', async () => {
    // 서버가 모양이 어긋난 응답을 주는 상황을 만든다(items 가 null).
    await pageAdmin.route('**/api/changes*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: null, page: 0, size: 20, totalItems: 0, totalPages: 0 }) }),
    )
    await pageAdmin.getByTestId('tab-list').click()
    await openScreen(pageAdmin, 'changes')
    await expect(pageAdmin.getByTestId('error-boundary')).toContainText('이 화면을 불러오지 못했습니다.')
    await expect(pageAdmin.getByTestId('tab-workspace')).toBeVisible()
    await expect(pageAdmin.getByTestId('current-user-name')).toHaveText(admin.name)
    await shot(pageAdmin, '00d-error-boundary')

    // 다른 탭으로 옮기면 새 탭이 바로 그려진다.
    await pageAdmin.getByTestId('tab-list').click()
    await expect(pageAdmin.getByTestId('list-tab')).toBeVisible()
    await expect(pageAdmin.getByTestId('error-boundary')).toHaveCount(0)

    // 서버가 정상으로 돌아오면 「다시 시도」 로 화면이 돌아온다.
    await openScreen(pageAdmin, 'changes')
    await expect(pageAdmin.getByTestId('error-boundary')).toBeVisible()
    await pageAdmin.unroute('**/api/changes*')
    await pageAdmin.getByTestId('error-boundary-retry').click()
    await expect(pageAdmin.getByTestId('changes-table')).toBeVisible()
    await expect(pageAdmin.getByTestId('error-boundary')).toHaveCount(0)
  })

  test('0e) 첫 화면 안내와 만들기 폼이 한국어 표시 이름으로 보인다', async () => {
    await openScreen(pageAdmin, 'map')
    await expect(pageAdmin.getByTestId('map-intro')).toBeVisible()
    await expect(pageAdmin.getByTestId('map-intro')).toContainText('투자 온톨로지')
    await expect(pageAdmin.getByTestId('map-intro')).toContainText('상자를 누르면 그 종류의 항목을 보고 바로 추가할 수 있습니다.')
    await shot(pageAdmin, '00e-first-screen')

    await openScreen(pageAdmin, 'workspace')

    // 메뉴의 줄은 타입 순서이고 주장은 맨 아래다. 타입 목록은 온톨로지가 정하므로 여기에 다시 적지 않는다.
    await pageAdmin.getByTestId('add-open').click()
    const addTypes = pageAdmin.locator('[data-testid^="add-type-"]')
    await expect(addTypes.first()).toHaveAttribute('data-testid', /^add-type-/)
    await expect(addTypes.last()).toHaveAttribute('data-testid', 'add-type-Claim')
    await expect(addTypes.last()).toContainText('주장')
    await pageAdmin.keyboard.press('Escape')
    await openAdd(pageAdmin, 'Claim')
    await expect(pageAdmin.getByTestId('claim-add-form')).toBeVisible()
    await expect(pageAdmin.getByTestId('claim-subject-picker-input')).toBeVisible()
    await expect(pageAdmin.getByTestId('claim-object-picker-input')).toBeVisible()
    await pageAdmin.getByTestId('claim-add-cancel').click()
    await expect(pageAdmin.getByTestId('add-dialog')).toHaveCount(0)
    await openAdd(pageAdmin, 'Company')
    const company = pageAdmin.getByTestId('create-form')
    await expect(company).toContainText('기업 이름')
    await showOptional(pageAdmin)
    await expect(company).toContainText('국가')
    await expect(company).toContainText('기업이 등록된 나라')
    await expect(pageAdmin.getByTestId('create-prop-country').locator('option[value="KR"]')).toHaveText('대한민국 (KR)')
    await expect(company).not.toContainText('문자열')
    await expect(company).not.toContainText('registrationNumber')
    await shot(pageAdmin, '00e-company-form')
    await pageAdmin.getByTestId('create-cancel').click()

    await openAdd(pageAdmin, 'Security')
    const market = pageAdmin.getByTestId('create-prop-market')
    await expect(market.locator('option')).toHaveText(['선택하세요', '코스피', '코스닥', '나스닥', '뉴욕증권거래소', '기타'])
    await expect(market.locator('option[value="KRX_KOSPI"]')).toHaveText('코스피')
    await showOptional(pageAdmin)
    await expect(pageAdmin.getByTestId('create-prop-securityType').locator('option')).toHaveText(['(없음)', '보통주', '우선주', 'ETF', '예탁증서(ADR)', '기타'])
    await shot(pageAdmin, '00e-security-form')
    await pageAdmin.getByTestId('create-cancel').click()

    // 시작할 때 들어간 종목은 종목 코드로도 찾고, 타입 배지는 온톨로지의 표시 이름이다.
    await pageAdmin.getByTestId('search-input').fill('FLNC')
    await pageAdmin.getByTestId('search-submit').click()
    const flnc = searchResult(pageAdmin, 'Fluence Energy Class A')
    await expect(flnc).toBeVisible()
    await expect(flnc.locator('.type-badge')).toHaveText('종목')
  })

  test('0f) 상단 탭은 경로를 바꾸고 뒤로가기로 앞 탭에 돌아온다', async () => {
    await pageAdmin.getByTestId('tab-list').click()
    await expect(pageAdmin).toHaveURL(/\/list(\?|$)/)
    await openScreen(pageAdmin, 'changes')
    await expect(pageAdmin).toHaveURL(/\/changes(\?|$)/)
    await pageAdmin.goBack()
    await expect(pageAdmin).toHaveURL(/\/list(\?|$)/)
    await expect(pageAdmin.getByTestId('tab-list')).toHaveAttribute('aria-selected', 'true')
    await pageAdmin.reload()
    await expect(pageAdmin.getByTestId('tab-list')).toHaveAttribute('aria-selected', 'true')
    await expect(pageAdmin).toHaveURL(/\/list(\?|$)/)
    await pageAdmin.goto('/')
    await expect(pageAdmin).toHaveURL(/\/map$/)
    await expect(pageAdmin.getByTestId('tab-map')).toHaveAttribute('aria-selected', 'true')
  })

  test('0g) 개념 지도가 첫 화면이고 타입을 고르면 칸이 열린다', async () => {
    await pageAdmin.goto('/')
    await expect(pageAdmin).toHaveURL(/\/map$/)
    const canvas = pageAdmin.getByTestId('concept-map-canvas')
    await expect(canvas).toHaveAttribute('data-layout-done', 'true')
    expect(await pageAdmin.getByTestId('map-type').count()).toBeGreaterThan(0)

    await pageAdmin.locator('[data-testid="map-type"][data-type="Bottleneck"]').click()
    const panel = pageAdmin.getByTestId('map-type-panel')
    await expect(panel).toHaveAttribute('data-type', 'Bottleneck')
    await expect(pageAdmin).toHaveURL(/[?&]type=Bottleneck(&|$)/)
    await expect(pageAdmin.locator('[data-testid="map-type"][data-type="Bottleneck"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.getByTestId('map-relation').first()).toBeVisible()
    await expect(panel.getByTestId('map-recent-item').first()).toBeVisible()
    await shot(pageAdmin, 'map-wide')

    await panel.getByTestId('map-open-list').click()
    await expect(pageAdmin).toHaveURL(/\/list\?type=Bottleneck$/)
    await expect(pageAdmin.getByTestId('tab-list')).toHaveAttribute('aria-selected', 'true')
  })

  test('0h) 개념 지도의 ＋ 타입 추가로 만든 항목이 작업 공간 상세로 열린다', async () => {
    const name = `지도에서 만든 산업-${suffix}`
    await openScreen(pageAdmin, 'map')
    await pageAdmin.locator('[data-testid="map-type"][data-type="Sector"]').click()
    await expect(pageAdmin.getByTestId('map-type-panel')).toHaveAttribute('data-type', 'Sector')
    await pageAdmin.getByTestId('map-add-type').click()
    const dialog = pageAdmin.getByTestId('add-dialog')
    await expect(dialog).toHaveAttribute('data-type', 'Sector')
    await expect(dialog.getByTestId('add-steps')).toBeVisible()
    // 창은 투명에서 나타나는 애니메이션으로 열린다. 다 열린 뒤에 찍는다
    await expect(dialog).toHaveCSS('opacity', '1')
    await shot(pageAdmin, 'add-dialog')

    // 필수 칸만 채워 저장한다.
    await dialog.getByTestId('create-prop-name').fill(name)
    await dialog.getByTestId('create-submit').click()
    await expect(dialog).toHaveCount(0)
    await expect(pageAdmin).toHaveURL(/\/workspace\?node=[^&]+&pane=detail/)
    await expect(pageAdmin.getByTestId('detail-label')).toHaveText(name)
    await expect(pageAdmin.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  })

  test('1) A 가 기업과 산업, 종목을 만들고 ISSUES 관계를 잇는다', async ({ browser }) => {
    pageA = await open(browser)
    await loginAs(pageA, editorA)
    await expect(pageA.getByTestId('current-user-role')).toHaveAttribute('data-role', 'EDITOR')
    await pageA.getByTestId('more-open').click()
    await expect(pageA.getByTestId('more-item-changes')).toBeVisible()
    await expect(pageA.getByTestId('more-item-users')).toHaveCount(0)
    await pageA.keyboard.press('Escape')
    // ADMIN 이 아니면 /users 는 개념 지도로 바뀐다.
    await pageA.goto('/users')
    await expect(pageA).toHaveURL(/\/map$/)
    await expect(pageA.getByTestId('concept-map')).toBeVisible()

    await createNode(pageA, 'Company', data.company, { name: data.company, country: 'KR' })
    await createNode(pageA, 'Sector', data.sector, { name: data.sector, scheme: 'GICS' })
    await createNode(pageA, 'Security', data.security, {
      market: 'KRX_KOSPI',
      ticker: data.ticker,
      name: data.security,
      securityType: 'COMMON',
      currency: 'KRW',
    })

    // 종목 쪽에서 「기업이 이 종목을 발행한다」 관계를 추가한다.
    await pageA.getByTestId('relationship-add-toggle').click()
    await pageA.getByTestId('relationship-type-select').selectOption('ISSUES:in')
    await pick(pageA, 'relationship-target-picker', data.company)
    await expect(pageA.getByTestId('relationship-target-selected')).toContainText(data.company)
    await pageA.getByTestId('relationship-add-submit').click()

    const row = pageA.getByTestId('relationship-row').filter({ hasText: data.company })
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-rel-type', 'ISSUES')
    // 종목은 관계의 끝이다. 문장에서 종목 이름은 굵게, 기업 이름은 여는 단추로 보인다.
    await expect(row).toHaveAttribute('data-direction', 'in')
    await expect(row.getByTestId('relationship-self')).toHaveText(data.security)
    await expect(row.getByTestId('relationship-open')).toHaveText(data.company)
    await expect(pageA.locator('[data-testid="graph-node"]').filter({ hasText: data.company })).toHaveCount(1)
    await shot(pageA, '01-issues')
  })

  test('1b) 같은 이름은 저장 전에 경고하고, 종목을 만들며 고른 발행 기업이 이어진다', async () => {
    await pageA.getByTestId('tab-workspace').click()
    await openAdd(pageA, 'Company')
    await pageA.getByTestId('create-prop-name').fill(data.supplier)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('create-duplicate')).toBeVisible()
    await expect(pageA.getByTestId('create-duplicate-item')).toHaveCount(1)
    await expect(pageA.getByTestId('create-duplicate-item')).toContainText('대한민국 (KR)')
    await shot(pageA, '01b-duplicate')
    await pageA.getByTestId('create-duplicate-open').click()
    await expect(pageA.getByTestId('add-dialog')).toHaveCount(0)
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)
    const firstId = (await pageA.getByTestId('detail-panel').getAttribute('data-node-id'))!

    // 그래도 만들면 같은 이름의 기업이 둘이 된다.
    await openAdd(pageA, 'Company')
    await pageA.getByTestId('create-prop-name').fill(data.supplier)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('create-duplicate')).toBeVisible()
    await pageA.getByTestId('create-duplicate-confirm').click()
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    // 이름이 같아 라벨로는 구분되지 않는다. 새 상세를 다 읽기 전에는 앞 기업이 보이므로 id 가 바뀔 때까지 기다린다.
    await expect(pageA.getByTestId('detail-panel')).not.toHaveAttribute('data-node-id', firstId)
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)
    const secondId = (await pageA.getByTestId('detail-panel').getAttribute('data-node-id'))!
    await pageA.getByTestId('search-input').fill(data.supplier)
    await pageA.getByTestId('search-submit').click()
    const same = pageA.getByTestId('search-result').filter({ has: pageA.locator('.result-label', { hasText: exact(data.supplier) }) })
    await expect(same).toHaveCount(2)
    for (const hint of await same.getByTestId('search-result-hint').allTextContents()) expect(hint.trim()).not.toBe('')
    // 뒤 테스트의 검색과 고르기에 섞이지 않게 두 번째 기업을 보관한다.
    await pageA.locator(`[data-testid="search-result"][data-node-id="${secondId}"]`).click()
    await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-id', secondId)
    await archiveFromDetail(pageA)
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')

    // 종목을 만들면서 발행 기업을 고르면 ISSUES 관계가 함께 이어진다.
    await openAdd(pageA, 'Security')
    await pageA.getByTestId('create-prop-market').selectOption('KRX_KOSDAQ')
    await pageA.getByTestId('create-prop-ticker').fill(data.issuerTicker)
    await pageA.getByTestId('create-prop-name').fill(data.issuerSecurity)
    await showOptional(pageA)
    await pageA.getByTestId('create-prop-securityType').selectOption('COMMON')
    await pageA.getByTestId('create-prop-currency').selectOption('USD')
    await pick(pageA, 'create-link-ISSUES-picker', data.company)
    await expect(pageA.getByTestId('create-link-ISSUES-selected')).toContainText(data.company)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.issuerSecurity)
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    const row = pageA.getByTestId('relationship-row').filter({ hasText: data.company })
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-rel-type', 'ISSUES')
    await shot(pageA, '01b-issuer-linked')

    // 관계만 실패하면 종목은 남고 안내가 오류로 나온다.
    await pageA.route('**/api/relationships', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INTERNAL_ERROR', message: '테스트로 만든 실패', details: null }),
      }),
    )
    await openAdd(pageA, 'Security')
    await pageA.getByTestId('create-prop-market').selectOption('KRX_KOSDAQ')
    await pageA.getByTestId('create-prop-ticker').fill(data.failedTicker)
    await pageA.getByTestId('create-prop-name').fill(data.failedSecurity)
    await showOptional(pageA)
    await pageA.getByTestId('create-prop-securityType').selectOption('COMMON')
    await pageA.getByTestId('create-prop-currency').selectOption('USD')
    await pick(pageA, 'create-link-ISSUES-picker', data.company)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.failedSecurity)
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'error')
    await expect(pageA.getByTestId('detail-notice')).toContainText('발행 기업을 잇지 못했습니다')
    await pageA.unroute('**/api/relationships')
  })

  test('1c) 투자 온톨로지 항목을 이어 만들고 결정에서 변화까지 따라간다', async () => {
    await createNode(pageA, 'Change', data.change, { title: data.change, category: 'TECHNOLOGY' })

    await openAdd(pageA, 'Bottleneck')
    await pageA.getByTestId('create-prop-title').fill(data.bottleneck)
    await pageA.getByTestId('create-prop-status').selectOption('CONFIRMED')
    await pick(pageA, 'create-link-CREATES-picker', data.change)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.bottleneck)

    await openAdd(pageA, 'Company')
    await pageA.getByTestId('create-prop-name').fill(data.investmentCompany)
    await showOptional(pageA)
    await pageA.getByTestId('create-prop-country').selectOption('US')
    await pick(pageA, 'create-link-BENEFITS-picker', data.bottleneck)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.investmentCompany)

    await openAdd(pageA, 'Security')
    await pageA.getByTestId('create-prop-market').selectOption('NASDAQ')
    await pageA.getByTestId('create-prop-ticker').fill(data.investmentTicker)
    await pageA.getByTestId('create-prop-name').fill(data.investmentSecurity)
    await pick(pageA, 'create-link-ISSUES-picker', data.investmentCompany)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.investmentSecurity)

    await openAdd(pageA, 'Valuation')
    await pageA.getByTestId('create-prop-title').fill(data.valuation)
    await pageA.getByTestId('create-prop-currentPrice').fill('100')
    await pick(pageA, 'create-link-HAS_VALUATION-picker', data.investmentCompany)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.valuation)

    await openAdd(pageA, 'Scenario')
    await pageA.getByTestId('create-prop-title').fill(data.scenario)
    await pageA.getByTestId('create-prop-kind').selectOption('BASE')
    await pick(pageA, 'create-link-HAS_SCENARIO-picker', data.valuation)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('create-prop-valuePerShare-error')).toBeVisible()
    await expect(pageA.getByTestId('detail-label')).not.toHaveText(data.scenario)
    await pageA.getByTestId('create-prop-valuePerShare').fill('120')
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.scenario)

    await openAdd(pageA, 'Decision')
    await pageA.getByTestId('create-prop-title').fill(data.decision)
    await pageA.getByTestId('create-prop-action').selectOption('BUY')
    await pick(pageA, 'create-link-HAS_DECISION-picker', data.investmentSecurity)
    await pick(pageA, 'create-link-BASED_ON-picker', data.valuation)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.decision)
    await expect(pageA.getByTestId('relationship-row').filter({ hasText: data.investmentSecurity })).toHaveAttribute('data-rel-type', 'HAS_DECISION')
    await expect(pageA.getByTestId('relationship-row').filter({ hasText: data.valuation })).toHaveAttribute('data-rel-type', 'BASED_ON')

    await openAdvancedFilters(pageA)
    await pageA.getByTestId('graph-hops').selectOption('2')
    const companyNode = pageA.locator('[data-testid="graph-node"][data-node-type="Company"]').filter({ hasText: data.investmentCompany })
    await expect(companyNode).toHaveCount(1)
    await companyNode.getByRole('button').click()
    await pageA.getByTestId('graph-expand').click()
    await expect(pageA.locator('[data-testid="graph-node"][data-node-type="Change"]').filter({ hasText: data.change })).toHaveCount(1)
    await shot(pageA, '13a-investment-chain')
    await openAdvancedFilters(pageA)
    await pageA.getByTestId('graph-hops').selectOption('1')
  })

  test('2) A 가 문서를 등록하고 BELONGS_TO_SECTOR Claim 을 만든다', async () => {
    await createNode(pageA, 'Document', data.docTitle, {
      title: data.docTitle,
      url: data.docUrl,
      publisher: '가상부품',
      documentType: 'FILING',
      publishedAt: '2026-03-15',
      collectedAt: '2026-10-20T12:00',
    })

    await searchAndOpen(pageA, data.company)
    await pageA.getByTestId('claim-add-toggle').click()
    await expect(pageA.getByTestId('claim-predicate-select')).toHaveValue('BELONGS_TO_SECTOR')
    await pick(pageA, 'claim-object-picker', data.sector)
    await expect(pageA.getByTestId('claim-object-selected')).toContainText(data.sector)
    await pick(pageA, 'claim-doc-picker', data.docTitle)
    await expect(pageA.getByTestId('claim-doc-selected')).toContainText(data.docTitle)
    await pageA.getByTestId('claim-description').fill(data.description)
    await pageA.getByTestId('claim-evidence').fill(data.evidence)
    await pageA.getByTestId('claim-add-submit').click()

    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    const card = pageA.getByTestId('node-claims-section').getByTestId('claim-card').filter({ hasText: data.evidence })
    await expect(card).toBeVisible()
    await expect(card).toHaveAttribute('data-review-status', 'DRAFT')
    await expect(card.getByTestId('claim-valid-from')).toHaveText('미상')
    supplyClaimId = (await card.getAttribute('data-claim-id')) ?? ''
    expect(supplyClaimId).not.toBe('')
    await shot(pageA, '02-claim-created')
  })

  test('2d) A 가 책을 근거로 거장의 생각을 주장으로 만든다', async () => {
    const bookTitle = `안전마진 해설서-${suffix}`
    const personName = `워런 버핏-${suffix}`
    const englishName = `Warren Buffett ${suffix}`
    const conceptName = `안전마진-${suffix}`
    await pageA.getByTestId('tab-workspace').click()
    await openAdd(pageA, 'Person')
    await pageA.getByTestId('create-prop-name').fill(personName)
    await showOptional(pageA)
    await pageA.getByTestId('create-prop-englishName').fill(englishName)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(personName)

    await openAdd(pageA, 'Concept')
    await pageA.getByTestId('create-prop-name').fill(conceptName)
    await pageA.getByTestId('create-prop-summary').fill('투자 판단에서 손실 가능성을 줄이는 여유다.')
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(conceptName)

    await openAdd(pageA, 'Document')
    await pageA.getByTestId('create-prop-title').fill(bookTitle)
    await pageA.getByTestId('create-prop-url').fill(`https://example.com/book-${suffix}`)
    await showOptional(pageA)
    await pageA.getByTestId('create-prop-documentType').selectOption('BOOK')
    await pageA.getByTestId('create-prop-collectedAt').fill('2026-10-20T12:00')
    await pick(pageA, 'create-link-AUTHORED-picker', personName)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(bookTitle)
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageA.getByTestId('relationship-row').filter({ hasText: personName })).toHaveAttribute('data-rel-type', 'AUTHORED')

    await searchAndOpen(pageA, personName)
    await pageA.getByTestId('claim-add-toggle').click()
    await pageA.getByTestId('claim-predicate-select').selectOption('ADVOCATES')
    await expect(pageA.getByTestId('claim-sentence')).toContainText('강조한다')
    await pick(pageA, 'claim-object-picker', conceptName)
    await expect(pageA.getByTestId('claim-object-selected')).toContainText(conceptName)
    await pick(pageA, 'claim-doc-picker', bookTitle)
    await pageA.getByTestId('claim-description').fill('버핏은 안전마진을 투자의 핵심으로 본다.')
    await pageA.getByTestId('claim-evidence').fill(`안전마진은 투자의 핵심이다(테스트 문장 ${suffix})`)
    await pageA.getByTestId('claim-add-submit').click()

    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    const card = pageA.getByTestId('node-claims-section').getByTestId('claim-card').filter({ hasText: suffix })
    await expect(card).toBeVisible()
    const claimId = (await card.getAttribute('data-claim-id')) ?? ''
    expect(claimId).not.toBe('')
    const list = pageA.getByTestId('graph-node-list')
    await expect(list).toContainText(conceptName)
    await expect(list.locator(`[data-node-id="${claimId}"]`)).toContainText(`${personName} → ${conceptName} 강조한다`)
    await shot(pageA, '02d-master-claim')
  })

  test('2b) A 가 산업 상세에서 「주체와 대상 바꾸기」 로 산업 소속 주장을 만든다', async () => {
    await createNode(pageA, 'Company', data.company2, { name: data.company2, country: 'KR' })
    await createNode(pageA, 'Document', data.docTitle2, {
      title: data.docTitle2,
      url: data.docUrl2,
      publisher: '가상소재',
      documentType: 'FILING',
      publishedAt: '2026-03-15',
      collectedAt: '2026-10-20T12:00',
    })

    await searchAndOpen(pageA, data.sector)
    await pageA.getByTestId('claim-add-toggle').click()
    await expect(pageA.getByTestId('claim-subject-selected')).toContainText(data.sector)
    await expect(pageA.getByTestId('claim-predicate-select')).toHaveValue('BELONGS_TO_SECTOR')
    await pageA.getByTestId('claim-swap').click()
    await expect(pageA.getByTestId('claim-object-selected')).toContainText(data.sector)
    await expect(pageA.getByTestId('claim-subject-selected')).toHaveCount(0)
    await pick(pageA, 'claim-subject-picker', data.company2)
    await expect(pageA.getByTestId('claim-subject-selected')).toContainText(data.company2)
    await expect(pageA.getByTestId('claim-sentence')).toContainText('에 속한다')
    await pick(pageA, 'claim-doc-picker', data.docTitle2)
    await pageA.getByTestId('claim-description').fill(data.description2)
    await pageA.getByTestId('claim-evidence').fill(data.evidence2)
    await pageA.getByTestId('claim-add-submit').click()

    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    const card = pageA.getByTestId('node-claims-section').getByTestId('claim-card').filter({ hasText: data.evidence2 })
    await expect(card.getByTestId('claim-subject')).toContainText(data.company2)
    await expect(card.getByTestId('claim-object')).toContainText(data.sector)
    await shot(pageA, '02b-claim-from-object')
  })

  test('2c) A 가 「＋ 추가」 의 주장 줄에서 주장을 만든다', async () => {
    await openScreen(pageA, 'map')
    const dialog = await openAdd(pageA, 'Claim')
    await expect(dialog.getByTestId('add-steps')).not.toContainText('3. 연결하기')
    await pageA.getByTestId('claim-predicate-select').selectOption('BELONGS_TO_SECTOR')
    await pick(pageA, 'claim-subject-picker', data.company2)
    await pick(pageA, 'claim-object-picker', data.sector)
    await pick(pageA, 'claim-doc-picker', data.docTitle2)
    await pageA.getByTestId('claim-description').fill(`${data.company2} 는 ${data.sector} 에 속한다.`)
    await pageA.getByTestId('claim-evidence').fill(data.evidence2)
    await pageA.getByTestId('claim-add-submit').click()

    // 개념 지도에서 만들어도 창이 닫히고 작업 공간에서 새 주장의 상세가 열린다.
    await expect(dialog).toHaveCount(0)
    await expect(pageA).toHaveURL(/\/workspace\?.*node=.*pane=detail/)
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageA.getByTestId('detail-notice')).toContainText('다른 편집자의 검토를 기다립니다')
    await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-type', 'Claim')
    await expect(pageA.getByTestId('detail-label')).toHaveText(`${data.company2} → ${data.sector} 속한다`)
  })

  test('3) B 가 검토 대기 탭에서 Claim 을 검토 완료한다', async ({ browser }) => {
    // 작성자 A 에게는 그 주장이 「내가 쓰거나 고친 주장」 구역에만 있고, 링크를 복사할 수 있다.
    await openScreen(pageA, 'review')
    const mineSection = pageA.getByTestId('review-section-mine')
    const mineRow = mineSection.locator(`[data-testid="review-mine-row"][data-claim-id="${supplyClaimId}"]`)
    await expect(mineRow).toBeVisible()
    const reviewableA = pageA.getByTestId('review-section-reviewable')
    await expect(reviewableA.getByTestId('review-pager-info')).toBeVisible()
    await expect(reviewableA.locator(`[data-claim-id="${supplyClaimId}"]`)).toHaveCount(0)
    await mineRow.getByTestId('review-mine-copy-link').click()
    await expect(mineRow.getByTestId('review-mine-copy-link-done').or(mineRow.getByTestId('review-mine-copy-link-fallback'))).toBeVisible()
    // 클립보드를 쓸 수 없어 주소를 입력칸에 보인 경우에만 새 형식의 주소인지 본다.
    const fallback = mineRow.getByTestId('review-mine-copy-link-fallback')
    if (await fallback.isVisible()) await expect(fallback).toHaveValue(/\/workspace\?node=/)
    await shot(pageA, '03-review-mine-a')

    pageB = await open(browser)
    await loginAs(pageB, editorB)

    await openScreen(pageB, 'review')
    const reviewable = pageB.getByTestId('review-section-reviewable')
    await expect(reviewable.getByTestId('review-table')).toBeVisible()
    const row = reviewable.getByTestId('review-row').filter({ hasText: data.company })
    const pagerInfo = reviewable.getByTestId('review-pager-info')
    await expect(pagerInfo).toBeVisible()
    // 검토 대기 목록은 오래된 것부터라 새 Claim 이 뒤쪽 페이지에 있을 수 있다.
    for (let i = 0; i < 50 && (await row.count()) === 0; i += 1) {
      const next = reviewable.getByTestId('review-pager-next')
      if (await next.isDisabled()) break
      const before = await pagerInfo.textContent()
      await next.click()
      await expect(pagerInfo).not.toHaveText(before ?? '')
    }
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(data.sector)
    await row.getByTestId('review-row-note').fill(data.reviewNote)
    await row.getByTestId('review-row-approve').click()

    await expect(pageB.getByTestId('review-message')).toContainText(`${data.company} → ${data.sector} 속한다`)
    await expect(row).toHaveCount(0)
    await shot(pageB, '03-reviewed-by-b')
  })

  test('3b) 링크로 들어오면 로그인한 뒤 그 주장의 상세가 열린다', async ({ browser }) => {
    const { context, page } = await newPage(browser)
    try {
      // 이미 보낸 /?node= 링크도 열리고, 새 주소로 바뀐다.
      await loginAs(page, editorB, 'success', `/?node=${encodeURIComponent(supplyClaimId)}`)
      await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', supplyClaimId)
      await expect(page.getByTestId('detail-label')).toHaveText(`${data.company} → ${data.sector} 속한다`)
      await page.getByTestId('node-more').click()
      await expect(page.getByTestId('node-copy-link')).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/workspace\\?node=${supplyClaimId}&pane=detail$`))
    } finally {
      await context.close()
    }
    // 새 형식의 링크도 같은 상세를 연다.
    const fresh = await newPage(browser)
    try {
      await loginAs(fresh.page, editorB, 'success', `/workspace?node=${encodeURIComponent(supplyClaimId)}`)
      await expect(fresh.page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', supplyClaimId)
      await expect(fresh.page.getByTestId('detail-label')).toHaveText(`${data.company} → ${data.sector} 속한다`)
    } finally {
      await fresh.context.close()
    }
  })

  test('4) A 가 기업 주변 그래프와 근거, 검토자를 확인한다', async () => {
    await searchAndOpen(pageA, data.company)

    const canvas = pageA.getByTestId('graph-canvas')
    await expect(canvas).toHaveAttribute('data-collapsed-claims', '1')

    const card = pageA.getByTestId('node-claims-section').getByTestId('claim-card').filter({ hasText: data.evidence })
    const claimId = (await card.getAttribute('data-claim-id'))!
    const claimItem = pageA.locator(`[data-testid="graph-node"][data-node-id="${claimId}"]`)
    const companies = (name: string) => pageA.locator('[data-testid="graph-node"][data-node-type="Company"]').filter({ hasText: name })
    const sectors = (name: string) => pageA.locator('[data-testid="graph-node"][data-node-type="Sector"]').filter({ hasText: name })
    const documents = pageA.locator('[data-testid="graph-node"][data-node-type="Document"]').filter({ hasText: data.docTitle })
    // 주장은 기업에서 산업으로 가는 선 하나로 접혀 있고, 목록에는 접힌 주장으로 남는다
    await expect(claimItem).toHaveAttribute('data-collapsed', 'true')
    await expect(claimItem).toHaveAttribute('data-review-status', 'REVIEWED')
    await expect(claimItem).toContainText(`${data.company} → ${data.sector} 속한다`)
    await expect(sectors(data.sector)).toHaveCount(1)

    await expect(card).toHaveAttribute('data-review-status', 'REVIEWED')
    await expect(card.getByTestId('claim-evidence-text')).toHaveText(data.evidence)
    await expect(card.getByTestId('claim-document-title')).toHaveText(data.docTitle)
    await expect(card.getByTestId('claim-reviewer')).toHaveText(editorB.name)
    await expect(card.getByTestId('claim-review-note')).toContainText(data.reviewNote)
    await shot(pageA, '04-graph-and-evidence')

    // 접힌 주장을 골라 이웃 확장해도 새로 오는 것은 숨긴 문서뿐이라 화면이 그대로다
    await claimItem.locator('button').click()
    await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-id', claimId)
    await pageA.getByTestId('graph-expand').click()
    await expect(pageA.getByTestId('graph-loading')).toHaveCount(0)
    await expect(companies(data.company)).toHaveCount(1)
    await expect(sectors(data.sector)).toHaveCount(1)
    await expect(documents).toHaveCount(0)
    await expect(canvas).toHaveAttribute('data-collapsed-claims', '1')

    // 주장을 따로 보면 마름모 노드와 근거 문서가 나온다
    await openAdvancedFilters(pageA)
    await pageA.getByTestId('graph-claims-as-nodes').setChecked(true)
    await expect(canvas).toHaveAttribute('data-collapsed-claims', '0')
    await expect(documents).toHaveCount(1)
    await expect(claimItem).toHaveAttribute('data-collapsed', 'false')
    await shot(pageA, '04-expanded')

    await pageA.getByTestId('graph-claims-as-nodes').setChecked(false)
    await expect(canvas).toHaveAttribute('data-collapsed-claims', '1')
  })

  test('4b) 작업 공간에서 뒤로가기는 앞 항목으로 돌아가고 검색 조건은 남는다', async () => {
    await pageA.getByTestId('tab-workspace').click()
    await pageA.getByTestId('search-input').fill(data.supplier)
    await pageA.getByTestId('search-submit').click()
    await searchResult(pageA, data.supplier).click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)
    await expect(pageA).toHaveURL(/node=/)
    await expect(pageA).toHaveURL(/q=/)

    // 「그래프에 나온 항목」 에서 고객사를 열면 상세만 바뀐다.
    const customerItem = pageA.locator('[data-testid="graph-node"][data-node-type="Sector"]').filter({ hasText: data.sector })
    await customerItem.getByRole('button').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.sector)
    await pageA.goBack()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)
    await expect(pageA.getByTestId('search-input')).toHaveValue(data.supplier)

    // 다른 탭에 갔다 뒤로가기로 돌아와도 검색 조건과 열어 둔 항목이 그대로다.
    await pageA.getByTestId('tab-list').click()
    await expect(pageA).toHaveURL(/\/list(\?|$)/)
    await pageA.goBack()
    await expect(pageA.getByTestId('tab-workspace')).toHaveAttribute('aria-selected', 'true')
    await expect(pageA.getByTestId('search-input')).toHaveValue(data.supplier)
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)

    // 홉 수는 주소만 바꾸고 기록을 쌓지 않는다. 고객사를 연 뒤 홉을 바꿔도 뒤로가기 한 번이면 공급사다.
    await customerItem.getByRole('button').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.sector)
    await openAdvancedFilters(pageA)
    await pageA.getByTestId('graph-hops').selectOption('2')
    await expect(pageA).toHaveURL(/hops=2/)
    await pageA.goBack()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)
    await expect(pageA).not.toHaveURL(/hops=/)
    await shot(pageA, '04b-back-to-supplier')
  })

  test('4c) 고급 필터는 접혀 있고 바꾼 개수를 보인다', async () => {
    // 앞 테스트가 같은 화면에서 고급 필터를 열어 두었을 수 있어 새로 연다.
    await pageA.goto('/workspace')
    await expect(pageA.getByTestId('advanced-filters')).not.toHaveAttribute('open', /.*/)
    await expect(pageA.getByTestId('advanced-filters-toggle')).toHaveText('고급 필터')

    await openAdvancedFilters(pageA)
    await pageA.getByTestId('graph-hops').selectOption('2')
    await expect(pageA).toHaveURL(/hops=2/)
    await expect(pageA.getByTestId('advanced-filters-toggle')).toHaveText('고급 필터 (1)')

    // 열림은 주소에 두지 않아 새로고침하면 접히고, 조건이 걸린 개수는 남는다.
    await pageA.reload()
    await expect(pageA.getByTestId('advanced-filters')).not.toHaveAttribute('open', /.*/)
    await expect(pageA.getByTestId('advanced-filters-toggle')).toHaveText('고급 필터 (1)')

    await openAdvancedFilters(pageA)
    await pageA.getByTestId('graph-hops').selectOption('1')
    await expect(pageA.getByTestId('advanced-filters-toggle')).toHaveText('고급 필터')
  })

  test('4d) 상세는 읽기 카드로 열리고 편집을 눌러야 폼이 열린다', async () => {
    await searchAndOpen(pageA, data.company)
    await expect(pageA.getByTestId('node-props')).toBeVisible()
    await expect(pageA.locator('[data-testid="node-prop"][data-prop="name"]')).toContainText(data.company)
    // enum 은 저장 값(KR)이 아니라 선택지 이름으로 보인다.
    await expect(pageA.locator('[data-testid="node-prop"][data-prop="country"]')).toContainText('대한민국 (KR)')
    await expect(pageA.locator('[data-testid^="edit-prop-"]')).toHaveCount(0)
    await expect(pageA.getByTestId('node-save')).toHaveCount(0)
    // 「편집자A」 는 영문자 A(받침 없음)로 끝나 「가」 가 붙는다.
    await expect(pageA.getByTestId('node-created-line')).toContainText(`${editorA.name}가 `)
    await expect(pageA.getByTestId('node-created-line')).toContainText('에 등록')
    await expect(pageA.getByTestId('node-meta-details')).not.toHaveAttribute('open', '')
    await shot(pageA, 'detail-read-card')

    await pageA.getByTestId('node-edit').click()
    await expect(pageA.getByTestId('node-edit-form')).toBeVisible()
    await expect(pageA.getByTestId('edit-prop-name')).toHaveValue(data.company)
    await expect(pageA.getByTestId('node-props')).toHaveCount(0)
    await pageA.getByTestId('node-edit-cancel').click()
    await expect(pageA.getByTestId('node-edit-form')).toHaveCount(0)
    await expect(pageA.getByTestId('node-props')).toBeVisible()
  })

  test('5) 같은 노드를 동시에 고치면 나중 저장은 409 안내 뒤 최신 값을 보이고, 내 입력을 골라 다시 적용해 저장한다', async () => {
    await searchAndOpen(pageA, data.company)
    await searchAndOpen(pageB, data.company)
    const revisionBefore = Number(await pageB.getByTestId('node-revision').textContent())

    await pageA.getByTestId('node-edit').click()
    await pageA.getByTestId('edit-prop-description').fill(data.editByA)
    await pageA.getByTestId('node-save').click()
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageA.getByTestId('node-revision')).toHaveText(String(revisionBefore + 1))
    await shot(pageA, '05-saved-by-a')

    // B 는 아직 예전 revision 을 들고 있다.
    await expect(pageB.getByTestId('node-revision')).toHaveText(String(revisionBefore))
    await pageB.getByTestId('node-edit').click()
    await pageB.getByTestId('edit-prop-description').fill(data.editByB)
    await pageB.getByTestId('edit-prop-registrationNumber').fill(data.registrationByB)
    await pageB.getByTestId('node-save').click()

    const notice = pageB.getByTestId('detail-notice')
    await expect(notice).toHaveAttribute('data-kind', 'conflict')
    await expect(notice).toContainText('다른 탭이나 다른 사용자가 먼저 저장했습니다')
    await expect(notice).not.toContainText('서버 응답')
    // 409 뒤에도 편집 폼은 열린 채로 비교를 보인다.
    await expect(pageB.getByTestId('node-edit-form')).toBeVisible()
    await expect(pageB.getByTestId('edit-prop-description')).toHaveValue(data.editByA)
    await expect(pageB.locator('[data-testid="edit-conflict-field"][data-field="description"]')).toHaveAttribute('data-kind', 'both')
    await expect(pageB.locator('[data-testid="edit-conflict-field"][data-field="registrationNumber"]')).toHaveAttribute('data-kind', 'mine')
    await expect(pageB.getByTestId('node-revision')).toHaveText(String(revisionBefore + 1))
    await shot(pageB, '05-conflict-b')

    await pageB.getByTestId('edit-conflict-choice-description-mine').check()
    await pageB.getByTestId('edit-conflict-apply').click()
    await expect(pageB.getByTestId('edit-prop-description')).toHaveValue(data.editByB)
    await expect(pageB.getByTestId('edit-prop-registrationNumber')).toHaveValue(data.registrationByB)
    await expect(pageB.getByTestId('edit-conflict')).toHaveCount(0)
    // 단추가 폼을 제출하지 않았다는 근거다.
    await expect(pageB.getByTestId('node-edit-local-message')).toContainText('내 입력을 다시 넣었습니다')
    await expect(pageB.getByTestId('node-edit-local-message')).not.toContainText('바뀐 내용이 없습니다')
    await shot(pageB, '05-reapplied-b')
    await pageB.getByTestId('node-save').click()
    await expect(pageB.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageB.getByTestId('node-revision')).toHaveText(String(revisionBefore + 2))
    // 저장에 성공하면 읽기 카드로 돌아온다.
    await expect(pageB.getByTestId('node-edit-form')).toHaveCount(0)
    await expect(pageB.getByTestId('node-props')).toBeVisible()
  })

  test('6) 보관하면 기본 검색에서 빠지고, 복원하면 이력에 ARCHIVE 와 RESTORE 가 남는다', async () => {
    await searchAndOpen(pageA, data.customer)
    await archiveFromDetail(pageA, 'e2e 보관 확인')
    await expect(pageA.getByTestId('detail-archived')).toBeVisible()
    // 보관된 항목에는 「편집」 이 없다.
    await expect(pageA.getByTestId('node-edit')).toHaveCount(0)

    // 기본 검색에서는 보이지 않는다.
    await pageA.getByTestId('search-input').fill(data.customer)
    await pageA.getByTestId('search-submit').click()
    await expect(pageA.getByTestId('search-empty')).toBeVisible()
    await expect(searchResult(pageA, data.customer)).toHaveCount(0)

    // 「보관 포함」 으로 찾아 복원한다.
    await searchAndOpen(pageA, data.customer, { includeArchived: true })
    await expect(pageA.getByTestId('detail-archived')).toBeVisible()
    await detailMenu(pageA, 'node-restore-button')
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageA.getByTestId('detail-archived')).toHaveCount(0)

    await detailMenu(pageA, 'node-history-link')
    await expect(pageA.getByTestId('changes-tab')).toBeVisible()
    await expect(pageA.locator('[data-testid="change-row"][data-action="ARCHIVE"]')).toHaveCount(1)
    await expect(pageA.locator('[data-testid="change-row"][data-action="RESTORE"]')).toHaveCount(1)
    await expect(pageA.locator('[data-testid="change-row"][data-action="ARCHIVE"] li').filter({ hasText: '보관: 아니오 → 예' })).toHaveCount(1)
    await shot(pageA, '06-archive-restore-history')
  })

  test('6c) 변경 이력에서 사용자를 표시 이름으로 고르고 주장 이력의 주체와 대상이 이름으로 보인다', async () => {
    await openScreen(pageA, 'changes')
    await expect(pageA.getByTestId('changes-tab')).toBeVisible()
    const clear = pageA.getByTestId('changes-filter-clear')
    await expect(pageA.getByTestId('changes-target-selected')).toBeVisible()
    await clear.click()
    await expect(pageA.getByTestId('changes-target-picker-input')).toBeVisible()

    const actorSelect = pageA.getByTestId('changes-actor-filter')
    await expect(actorSelect).toContainText(editorA.name)
    const pagerInfo = pageA.getByTestId('changes-pager-info')
    await expect(pagerInfo).toBeVisible()
    const allInfo = (await pagerInfo.textContent()) ?? ''
    await actorSelect.selectOption({ value: editorA.email })
    await expect(pagerInfo).not.toHaveText(allInfo)
    const rows = pageA.getByTestId('change-row')
    await expect(rows.first()).toBeVisible()
    await expect
      .poll(async () => [...new Set(await pageA.getByTestId('change-actor').allTextContents())].join('|'))
      .toBe(editorA.name)

    await actorSelect.selectOption({ value: '' })
    await pageA.getByTestId('changes-target-picker-input').fill(data.supplier)
    await pageA.getByTestId('changes-target-picker-search').click()
    await pageA.getByTestId('changes-target-picker-result').filter({ hasText: data.supplier }).first().click()
    await expect(pageA.getByTestId('changes-target-selected')).toContainText(data.supplier)
    await expect(rows.first()).toBeVisible()
    await expect
      .poll(async () => new Set(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-target-id')))).size)
      .toBe(1)

    // 주장은 기업 이름으로 검색되지 않으므로(docs/prd.md 「남은 한계」) 링크로 연다.
    await pageA.goto('/?node=' + supplyClaimId)
    await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-id', supplyClaimId)
    await expect(pageA).toHaveURL(new RegExp('/workspace\\?node=' + supplyClaimId))
    await detailMenu(pageA, 'node-history-link')
    const created = pageA.locator('[data-testid="change-row"][data-action="CREATE"]')
    await expect(created).toHaveCount(1)
    await expect(created).toContainText('주체')
    await expect(created).toContainText(data.supplier)
    await expect(created).toContainText('대상')
    await expect(created).toContainText(data.customer)
    await expect(created).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/)
    await shot(pageA, '06c-changes-names')
  })

  test('6d) 목록과 이력에서 항목을 열었다가 뒤로가기로 돌아오면 조건이 그대로다', async () => {
    await pageA.getByTestId('tab-list').click()
    await pageA.getByTestId('list-type-filter').selectOption('Company')
    await pageA.getByTestId('list-search-input').fill(data.supplier)
    await pageA.getByTestId('list-search-submit').click()
    await expect(pageA).toHaveURL(/type=Company/)
    await expect(pageA).toHaveURL(/q=/)
    const listUrl = pageA.url()
    const listRow = pageA.getByTestId('list-row').filter({ hasText: data.supplier })
    await expect(listRow).toHaveCount(1)
    await listRow.click()
    await expect(pageA).toHaveURL(/\/workspace\?node=/)
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)
    await pageA.goBack()
    await expect(pageA).toHaveURL(listUrl)
    await expect(pageA.getByTestId('list-type-filter')).toHaveValue('Company')
    await expect(pageA.getByTestId('list-search-input')).toHaveValue(data.supplier)
    await expect(pageA.getByTestId('list-row').filter({ hasText: data.supplier })).toHaveCount(1)
    await shot(pageA, '06d-list-back')

    await openScreen(pageA, 'changes')
    await expect(pageA.getByTestId('changes-tab')).toBeVisible()
    await pageA.getByTestId('changes-actor-filter').selectOption({ value: editorA.email })
    await expect(pageA).toHaveURL(/actor=/)
    const targetButton = pageA.locator('[data-testid="change-row"] td:nth-child(5) button').first()
    await expect(targetButton).toBeVisible()
    await targetButton.click()
    await expect(pageA).toHaveURL(/\/workspace\?node=/)
    await pageA.goBack()
    await expect(pageA).toHaveURL(/\/changes/)
    await expect(pageA.getByTestId('changes-actor-filter')).toHaveValue(editorA.email)
    await expect(pageA.getByTestId('change-row').first()).toBeVisible()
    await shot(pageA, '06d-changes-back')

    // 쪽을 넘겨도 기록이 쌓이지 않는다. 쪽이 둘 이상일 때만 본다.
    const next = pageA.getByTestId('changes-pager-next')
    if (await next.isEnabled()) {
      await next.click()
      await expect(pageA).toHaveURL(/page=1/)
      await pageA.goBack()
      await expect(pageA).toHaveURL(/\/workspace\?node=/)
    }
  })

  test('6b) 유일한 근거 문서를 보관하려 하면 해당 주장을 여는 버튼이 나온다', async () => {
    await searchAndOpen(pageA, data.docTitle)
    // 실패해도 보관 창은 닫히고 오류는 상세 위에 보인다.
    await archiveFromDetail(pageA)
    const notice = pageA.getByTestId('detail-notice')
    await expect(notice).toHaveAttribute('data-kind', 'error')
    await expect(notice).toContainText('그 주장을 먼저 보관하세요')
    await expect(notice).not.toContainText('근거를 더하거나')
    await shot(pageA, '06b-last-evidence')
    await notice.getByTestId('notice-action').click()
    await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-type', 'Claim')
    // 주장 상세에는 「이 항목에 걸린 주장」 절이 없고, 수정 폼은 「다시 검토」 안내를 쓴다. revision 은 「자세히」 안에 있다.
    await expect(pageA.getByTestId('node-claims-section')).toHaveCount(0)
    await expect(pageA.getByTestId('claim-edit-form')).toHaveCount(0)
    await pageA.getByTestId('node-edit').click()
    await expect(pageA.getByTestId('claim-edit-form')).toContainText('다시 검토를 받아야 합니다')
    await expect(pageA.getByTestId('claim-edit-confidence')).toHaveCount(0)
    await expect(pageA.getByTestId('node-meta-details')).not.toHaveAttribute('open', '')
  })

  test('7) 열람자는 편집 버튼이 없고, API 로 직접 만들어도 403 FORBIDDEN 이다', async ({ browser }) => {
    const { context, page } = await newPage(browser)
    contexts.push(context)
    contextViewer = context
    pageViewer = page
    await loginAs(pageViewer, viewer)
    await expect(pageViewer.getByTestId('current-user-role')).toHaveAttribute('data-role', 'VIEWER')
    await openScreen(pageViewer, 'workspace')
    await expect(pageViewer.getByTestId('search-input')).toBeVisible()
    // 열람자에게는 「＋ 추가」 와 그래프의 ＋ 단추가 없다.
    await expect(pageViewer.getByTestId('graph-canvas')).toBeVisible()
    await expect(pageViewer.getByTestId('add-open')).toHaveCount(0)
    await expect(pageViewer.getByTestId('graph-add')).toHaveCount(0)

    await searchAndOpen(pageViewer, data.supplier)
    await expect(pageViewer.getByTestId('viewer-hint')).toBeVisible()
    // 열람자에게는 편집 폼이 그려지지 않는다.
    for (const id of ['node-edit', 'node-save', 'edit-prop-name', 'relationship-add-toggle', 'claim-add-toggle']) {
      await expect(pageViewer.getByTestId(id)).toHaveCount(0)
    }
    // 「⋯」 메뉴에는 링크 복사와 변경 이력만 있다.
    await pageViewer.getByTestId('node-more').click()
    await expect(pageViewer.getByTestId('node-history-link')).toBeVisible()
    for (const id of ['node-archive-button', 'node-restore-button']) {
      await expect(pageViewer.getByTestId(id)).toHaveCount(0)
    }
    await pageViewer.keyboard.press('Escape')

    // 열람자의 더보기 메뉴에는 검토 대기가 없지만 주소로는 열린다.
    await pageViewer.goto('/review')
    await expect(pageViewer.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(pageViewer.getByTestId('review-table')).toBeVisible()
    const approveButtons = pageViewer.getByTestId('review-row-approve')
    for (let i = 0; i < (await approveButtons.count()); i += 1) await expect(approveButtons.nth(i)).toBeDisabled()

    // 화면을 거치지 않고 같은 세션 쿠키로 직접 보내도 서버가 막는다.
    const base = new URL(pageViewer.url()).origin
    await pageViewer.request.get(`${base}/api/auth/csrf`)
    const xsrf = (await contextViewer.cookies(base)).find((c) => c.name === 'XSRF-TOKEN')?.value
    expect(xsrf, 'XSRF-TOKEN 쿠키').toBeTruthy()
    const res = await pageViewer.request.post(`${base}/api/nodes`, {
      headers: { 'X-XSRF-TOKEN': xsrf!, 'Content-Type': 'application/json' },
      data: { type: 'Company', properties: { name: `열람자가 만든 기업-${suffix}` } },
    })
    expect(res.status()).toBe(403)
    expect((await res.json()).code).toBe('FORBIDDEN')

    await pageViewer.getByTestId('tab-workspace').click()
    await searchAndOpen(pageViewer, data.supplier)
    await shot(pageViewer, '07-viewer')
  })

  test('7b) 더보기 메뉴는 역할별 항목을 보이고 열린 화면을 표시한다', async () => {
    const itemsOf = async (page: Page): Promise<string[]> => {
      await page.getByTestId('more-open').click()
      const items = page.locator('[data-testid^="more-item-"]')
      await expect(items.first()).toBeVisible()
      const ids = await items.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') ?? ''))
      await page.keyboard.press('Escape')
      await expect(items).toHaveCount(0)
      return ids
    }
    expect(await itemsOf(pageAdmin)).toEqual([
      'more-item-changes',
      'more-item-ontology',
      'more-item-review',
      'more-item-users',
      'more-item-tokens',
      'more-item-proposals',
      'more-item-trades',
    ])
    expect(await itemsOf(pageA)).toEqual([
      'more-item-changes',
      'more-item-ontology',
      'more-item-review',
      'more-item-tokens',
      'more-item-proposals',
      'more-item-trades',
    ])
    expect(await itemsOf(pageViewer)).toEqual(['more-item-changes', 'more-item-ontology', 'more-item-tokens', 'more-item-proposals', 'more-item-trades'])

    await openScreen(pageAdmin, 'map')
    await expect(pageAdmin.getByTestId('more-open')).toHaveAttribute('data-active', 'false')
    await openScreen(pageAdmin, 'changes')
    await expect(pageAdmin).toHaveURL(/\/changes(\?|$)/)
    await expect(pageAdmin.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(pageAdmin.getByTestId('tab-map')).toHaveAttribute('aria-selected', 'false')
  })

  test('7c) 결정의 근거 따라가기가 변화까지 단계를 보이고, 후보 밸류에이션을 이으면 그 단계가 생긴다', async () => {
    await searchAndOpen(pageA, seedDecision)
    await pageA.getByTestId('node-trace').click()
    await expect(pageA).toHaveURL(/\/trace\?node=/)
    await expect(pageA.getByTestId('trace-step').first()).toBeVisible()

    const steps = pageA.getByTestId('trace-step')
    // 결정에서 종목, 기업, 병목, 변화까지 이어진다. 가장 깊은 단계(변화와 산업)가 출발점이다.
    await expect(pageA.locator('[data-testid="trace-step"][data-role="root"]')).toHaveCount(1)
    await expect(steps.filter({ hasText: 'FLNC' }).first()).toBeVisible()
    await expect(steps.filter({ hasText: 'Fluence Energy' }).first()).toBeVisible()
    await expect(traceStep(pageA, seedChange)).toHaveAttribute('data-role', 'origin')
    const root = pageA.locator('[data-testid="trace-step"][data-role="root"]')
    await expect(root.getByTestId('trace-step-name')).toHaveText(exact(seedDecision))
    await expect(traceStep(pageA, seedBottleneck)).toHaveAttribute('data-status', 'SUPPORTED')
    await expect(traceStep(pageA, seedChange).getByTestId('trace-step-description')).toContainText('원문 대조 대기')

    const summary = pageA.getByTestId('trace-summary')
    const stepsBefore = Number(await summary.getAttribute('data-steps'))
    expect(stepsBefore).toBeGreaterThanOrEqual(5)
    const missing = root.locator('[data-testid="trace-missing"][data-relationship="BASED_ON"]')
    await expect(missing).toBeVisible()
    await missing.getByTestId('trace-candidate-link').filter({ hasText: seedValuation }).click()

    await expect(summary).toHaveAttribute('data-steps', String(stepsBefore + 1))
    const valuation = traceStep(pageA, seedValuation)
    await expect(valuation).toBeVisible()
    await expect(valuation.getByTestId('concept-chip').filter({ hasText: exact('개념 · DCF') })).toBeVisible()
    await shot(pageA, 'trace-wide')
  })

  test('7d) 이해 표시는 본인에게만 보이고 공부 탭에 단계 맥락과 함께 모인다', async () => {
    const note = '계통 접속이 왜 막히는지 모르겠다'
    const bottleneck = traceStep(pageA, seedBottleneck)
    const bottleneckId = (await bottleneck.getAttribute('data-node-id')) ?? ''
    expect(bottleneckId).not.toBe('')
    await bottleneck.getByTestId('knowledge-unsure').click()
    await expect(bottleneck.getByTestId('knowledge-unsure')).toHaveAttribute('aria-pressed', 'true')
    await bottleneck.getByTestId('knowledge-note-open').click()
    await bottleneck.getByTestId('knowledge-note-input').fill(note)
    await bottleneck.getByTestId('knowledge-note-save').click()
    await expect(bottleneck.getByTestId('knowledge-note')).toContainText(note)
    await expect(pageA.getByTestId('trace-summary')).toHaveAttribute('data-unsure', '1')

    // 공부 탭에 단계 맥락과 메모가 함께 모인다.
    await openScreen(pageA, 'study')
    const item = pageA.locator(`[data-testid="study-item"][data-node-id="${bottleneckId}"]`)
    await expect(item).toBeVisible()
    await expect(item.getByTestId('study-item-name')).toHaveText(seedBottleneck)
    await expect(item.getByTestId('study-item-context')).toContainText(seedDecision)
    await expect(item.getByTestId('study-item-note')).toContainText(note)
    await shot(pageA, 'study-wide')

    // 편집자 B 의 공부 탭과 API 에는 그 표시가 없다.
    await openScreen(pageB, 'study')
    await expect(pageB.getByTestId('study-counts')).toBeVisible()
    await expect(pageB.locator(`[data-testid="study-item"][data-node-id="${bottleneckId}"]`)).toHaveCount(0)
    const baseB = new URL(pageB.url()).origin
    const others = await pageB.request.get(`${baseB}/api/me/knowledge/${encodeURIComponent(bottleneckId)}`)
    expect(others.status()).toBe(200)
    expect((await others.json()).level).toBeNull()

    // 「이해했어요」 를 누르면 카드가 사라지고 이해함 개수가 하나 늘어난다.
    const counts = pageA.getByTestId('study-counts')
    const knownBefore = Number(await counts.getAttribute('data-known'))
    await item.getByTestId('study-known').click()
    await expect(item).toHaveCount(0)
    await expect(counts).toHaveAttribute('data-known', String(knownBefore + 1))

    // 열람자의 표시는 저장되고 새로고침 뒤에도 남지만 A 의 개수는 그대로다.
    const unsureBefore = await counts.getAttribute('data-unsure')
    const knownAfter = await counts.getAttribute('data-known')
    await searchAndOpen(pageViewer, seedBottleneck)
    const viewerUnsure = pageViewer.getByTestId('detail-panel').getByTestId('knowledge-unsure')
    await viewerUnsure.click()
    await expect(viewerUnsure).toHaveAttribute('aria-pressed', 'true')
    await pageViewer.reload()
    await expect(pageViewer.getByTestId('detail-panel').getByTestId('knowledge-unsure')).toHaveAttribute('aria-pressed', 'true')

    await pageA.reload()
    await expect(pageA.getByTestId('study-counts')).toHaveAttribute('data-unsure', unsureBefore ?? '')
    await expect(pageA.getByTestId('study-counts')).toHaveAttribute('data-known', knownAfter ?? '')
  })

  test('7e) 개념 칩은 한 줄 정의를 보이고 개념 상세는 쓴 곳을 보인다', async () => {
    await searchAndOpen(pageA, seedValuation)
    const chip = pageA.getByTestId('detail-panel').getByTestId('concept-chip').filter({ hasText: exact('개념 · DCF') })
    await chip.hover()
    await expect(pageA.getByTestId('concept-summary')).toContainText('현금흐름')
    await chip.click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(exact('DCF'))
    const usedBy = pageA.locator('[data-testid="concept-section"][data-section="used-by"]')
    await expect(usedBy.getByTestId('concept-section-item').filter({ hasText: seedValuation })).toBeVisible()
    await shot(pageA, 'concept-wide')
  })

  test('7f) 넓은 화면 개념 지도의 노드 글자는 13px 이상이다', async () => {
    await openScreen(pageA, 'map')
    const canvas = pageA.getByTestId('concept-map-canvas')
    await expect(canvas).toHaveAttribute('data-layout-done', 'true')
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-node-font-px')), { message: '개념 지도 노드 글자 크기(px)' })
      .toBeGreaterThanOrEqual(13)
    await shot(pageA, 'map-wide')
  })

  test('7g) 연동 토큰을 발급해 복사하고 그 토큰으로 에이전트 API 를 부르며, 폐기하면 막힌다', async () => {
    const origin = new URL(pageA.url()).origin
    await pageA.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
    await openScreen(pageA, 'tokens')
    await expect(pageA).toHaveURL(/\/tokens(\?|$)/)
    await expect(pageA.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(pageA.getByTestId('tokens-guide')).toContainText('Hermes')

    // 중간에 실패해도 이 테스트가 발급한 토큰이 남지 않게, 시작 전 목록에 없던 토큰을 끝에 폐기한다.
    const kept = await tokenIds(pageA)
    try {
      // 발급하면 원문이 한 번만 보이고, 복사 단추가 클립보드에 그 값을 넣는다.
      const advanced = pageA.getByTestId('tokens-advanced')
      if (!(await advanced.evaluate((el) => (el as HTMLDetailsElement).open))) await advanced.locator('summary').click()
      await pageA.getByTestId('tokens-issue-open').click()
      await pageA.getByTestId('tokens-issue-name').fill('e2e 토큰')
      await pageA.getByTestId('tokens-issue-submit').click()
      const issuedValue = pageA.getByTestId('tokens-issued-value')
      await expect(issuedValue).toHaveValue(/^fwb_[A-Za-z0-9_-]{43}$/)
      await expect(pageA.getByTestId('tokens-issued-warning')).toBeVisible()
      const token = await issuedValue.inputValue()
      await shot(pageA, 'tokens-issued-wide')

      await pageA.getByTestId('tokens-issued-copy').click()
      await expect(pageA.getByTestId('tokens-issued-copied')).toBeVisible()
      expect(await pageA.evaluate(() => navigator.clipboard.readText())).toBe(token)

      // 닫으면 목록에는 끝 네 자리만 남고 원문은 화면 어디에도 없다.
      await pageA.getByTestId('tokens-issued-close').click()
      await expect(pageA.getByTestId('tokens-issue-dialog')).toHaveCount(0)
      const row = pageA.locator('[data-testid="tokens-row"][data-name="e2e 토큰"]')
      await expect(row).toHaveCount(1)
      await expect(row.getByTestId('tokens-row-last4')).toHaveText(`…${token.slice(-4)}`)
      await expect(row.getByTestId('tokens-row-last-used')).toContainText('아직 쓰지 않음')
      expect(await pageA.content()).not.toContain(token)
      await shot(pageA, 'tokens-list-wide')
      const tokenId = (await row.getAttribute('data-id')) ?? ''
      expect(tokenId).not.toBe('')

      // 쿠키 없는 요청에 토큰만 담으면 열리고, 토큰이 없거나 쿠키뿐이면 막힌다.
      const bare = await request.newContext({ baseURL: origin })
      try {
        const ok = await bare.get('/api/v1/ontology', { headers: { Authorization: `Bearer ${token}` } })
        expect(ok.status()).toBe(200)
        expect(Array.isArray((await ok.json()).nodeTypes)).toBe(true)
        expect((await bare.get('/api/v1/ontology')).status()).toBe(401)
        expect(await pageA.evaluate(async () => (await fetch('/api/v1/ontology')).status)).toBe(401)

        // 쓴 뒤에는 마지막 사용 시각이 생긴다.
        await pageA.reload()
        await expect(row.getByTestId('tokens-row-last-used')).not.toContainText('아직 쓰지 않음')

        // 다른 사용자(편집자 B)에게는 이 토큰이 목록에도 API 응답에도 없다.
        await openScreen(pageB, 'tokens')
        await expect(pageB.getByTestId('tokens-tab')).toBeVisible()
        await expect(pageB.locator('[data-testid="tokens-row"][data-name="e2e 토큰"]')).toHaveCount(0)
        const idsOfB = await pageB.evaluate(async () => {
          const list: { id: string }[] = await (await fetch('/api/me/tokens')).json()
          return list.map((t) => t.id)
        })
        expect(idsOfB).not.toContain(tokenId)

        // 폐기하면 행이 사라지고 같은 토큰은 401 이다.
        await row.getByTestId('tokens-row-revoke').click()
        await expect(pageA.getByTestId('tokens-revoke-dialog')).toContainText('e2e 토큰')
        await pageA.getByTestId('tokens-revoke-confirm').click()
        await expect(row).toHaveCount(0)
        await expect(pageA.getByTestId('tokens-message')).toHaveAttribute('data-kind', 'success')
        const revoked = await bare.get('/api/v1/ontology', { headers: { Authorization: `Bearer ${token}` } })
        expect(revoked.status()).toBe(401)
      } finally {
        await bare.dispose()
      }
    } finally {
      await revokeTokensExcept(pageA, kept)
    }
  })

  test('7i) 앱 연결 동의와 연결된 앱 끊기: 허용하면 코드가 붙은 주소로 돌아가고, 토큰을 받고, 끊으면 갱신 토큰이 막힌다', async () => {
    const origin = new URL(pageA.url()).origin
    const appName = `e2e 앱 ${suffix}`
    const pkce = newPkce()
    const state = `state-${suffix}`
    // 앱이 돌아올 loopback 주소는 실제로 열리지 않으므로 브라우저 요청을 가로채 받는다.
    await pageA.route('http://127.0.0.1:43210/**', (r) => r.fulfill({ body: 'ok' }))
    try {
      const clientId = await registerOAuthClient(pageA, appName)

      // 앱이 연 인가 주소는 머리글 없는 동의 화면으로 이어진다.
      await pageA.goto(authorizeUrl(origin, clientId, pkce, state))
      await expect(pageA.getByTestId('connect-page')).toBeVisible()
      await expect(pageA).toHaveURL(/\/connect\?/)
      await expect(pageA.getByTestId('current-user-name')).toHaveCount(0)
      await expect(pageA.getByTestId('connect-user')).toContainText(editorA.name)
      await expect(pageA.getByTestId('connect-sentence')).toContainText(`${appName} 이(가) 가치투자 온톨로지를 내 계정으로 조회하고 기록하려 합니다.`)
      await expect(pageA.getByTestId('connect-scope-write')).toBeChecked()
      await shot(pageA, '07i-connect-consent')

      await pageA.getByTestId('connect-allow').click()
      await pageA.waitForURL(/127\.0\.0\.1:43210\/callback\?/)
      const back = new URL(pageA.url())
      expect(back.searchParams.get('state')).toBe(state)
      expect(back.searchParams.get('iss')).toBe(origin)
      const code = back.searchParams.get('code') ?? ''
      expect(code).toMatch(/^fwc_/)

      const tokenRes = await pageA.request.post(`${origin}/oauth/token`, {
        form: { grant_type: 'authorization_code', code, code_verifier: pkce.verifier, client_id: clientId, redirect_uri: OAUTH_CALLBACK },
      })
      expect(tokenRes.status()).toBe(200)
      const refreshToken = (await tokenRes.json()).refresh_token as string
      expect(refreshToken).toBeTruthy()

      // 「연동」 화면의 「연결된 앱」 에 보이고, 끊으면 사라진다.
      await pageA.goto(`${origin}/tokens`)
      const row = pageA.locator(`[data-testid="connections-row"][data-name="${appName}"]`)
      await expect(row).toHaveCount(1)
      await expect(row.getByTestId('connections-row-scope')).toHaveAttribute('data-scope', 'READ_WRITE')
      await shot(pageA, '07i-connections-wide')
      await row.getByTestId('connections-row-disconnect').click()
      await expect(pageA.getByTestId('connections-confirm')).toContainText(appName)
      await pageA.getByTestId('connections-confirm-submit').click()
      await expect(row).toHaveCount(0)
      await expect(pageA.getByTestId('connections-message')).toHaveAttribute('data-kind', 'success')

      // 끊은 연결의 갱신 토큰은 더 쓸 수 없다.
      const refreshed = await pageA.request.post(`${origin}/oauth/token`, {
        form: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId },
      })
      expect(refreshed.status()).toBe(400)
    } finally {
      await pageA.unroute('http://127.0.0.1:43210/**')
      await revokeConnections(pageA)
    }
  })

  test('7j) 로그아웃 상태에서 앱 연결을 시작하면 로그인 안내가 나오고, 로그인하면 가이드 없이 동의 화면이 열린다', async ({ browser }) => {
    const origin = new URL(pageAdmin.url()).origin
    // 첫 접속 가이드를 끝내지 않은 새 사용자다.
    await openScreen(pageAdmin, 'users')
    await addUser(pageAdmin, connectUser, 'VIEWER')
    const clientId = await registerOAuthClient(pageAdmin, `e2e 로그아웃 앱 ${suffix}`)

    const { context, page } = await newPage(browser)
    contexts.push(context)
    await page.route('http://127.0.0.1:43210/**', (r) => r.fulfill({ body: 'ok' }))
    await page.goto(authorizeUrl(origin, clientId, newPkce(), `state-${suffix}`))
    await expect(page.getByTestId('login-notice')).toContainText('앱을 연결하려면')
    await page.getByTestId('login-google').click()
    await fillMockOidc(page, connectUser)

    await expect(page.getByTestId('connect-page')).toBeVisible()
    await expect(page.getByTestId('connect-user')).toContainText(connectUser.name)
    await expect(page.getByTestId('guide-bubble')).toHaveCount(0)
    await expect(page).toHaveURL(/\/connect\?/)
    await shot(page, '07j-connect-after-login')

    // 거절하면 연결이 만들어지지 않고 앱의 loopback 주소로 access_denied 가 돌아간다.
    await page.getByTestId('connect-deny').click()
    await page.waitForURL(/127\.0\.0\.1:43210\/callback\?/)
    expect(new URL(page.url()).searchParams.get('error')).toBe('access_denied')
  })

  test('7h) 기록 토큰으로 체결과 제안을 쓰고, 제안을 고쳐 승인하면 결정과 체결이 이어지며 다른 사용자에게는 보이지 않는다', async () => {
    const origin = new URL(pageA.url()).origin
    const keptA = await tokenIds(pageA)
    await openScreen(pageViewer, 'tokens')
    const keptViewer = await tokenIds(pageViewer)
    const bare = await request.newContext({ baseURL: origin })
    const externalId = `e2e-${Date.now()}`
    const newTitle = `e2e 추가 매수 ${suffix}`
    const editedTitle = `e2e 추가 매수(고침) ${suffix}`
    const rejectReason = `e2e 거절 이유 ${suffix}`
    try {
      // 1. 「조회와 기록」 토큰과 「조회만」 토큰을 발급한다.
      await openScreen(pageA, 'tokens')
      const advanced = pageA.getByTestId('tokens-advanced')
      if (!(await advanced.evaluate((el) => (el as HTMLDetailsElement).open))) await advanced.locator('summary').click()
      await pageA.getByTestId('tokens-issue-open').click()
      await pageA.getByTestId('tokens-issue-scope-write').check()
      await expect(pageA.getByTestId('tokens-issue-scope-hint')).toBeVisible()
      await pageA.getByTestId('tokens-issue-cancel').click()
      await expect(pageA.getByTestId('tokens-issue-dialog')).toHaveCount(0)
      const writeToken = await issueToken(pageA, 'e2e 기록 토큰', 'write')
      const readToken = await issueToken(pageA, 'e2e 조회 토큰', 'read')
      await expect(pageA.locator('[data-testid="tokens-row"][data-name="e2e 기록 토큰"]').getByTestId('tokens-row-scope')).toHaveAttribute('data-scope', 'READ_WRITE')
      await expect(pageA.locator('[data-testid="tokens-row"][data-name="e2e 조회 토큰"]').getByTestId('tokens-row-scope')).toHaveAttribute('data-scope', 'READ')
      const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
      const trade = {
        broker: 'OTHER',
        externalId,
        side: 'BUY',
        market: 'US',
        ticker: 'flnc',
        name: 'Fluence Energy',
        quantity: 3,
        price: 10,
        currency: 'USD',
        amount: 30,
        fee: 0.1,
        executedAt: '2026-10-24T23:31:05+09:00',
      }

      // 2. 조회만 토큰은 쓰지 못한다.
      const denied = await bare.post('/api/v1/trades', { headers: bearer(readToken), data: { trades: [trade] } })
      expect(denied.status()).toBe(403)
      expect((await denied.json()).code).toBe('INSUFFICIENT_SCOPE')

      // 3. 같은 체결을 두 번 보내면 처음은 created, 다음은 existing 이고 FLNC 종목에 이어진다.
      const lookup = await (await bare.get('/api/v1/securities/lookup?market=US&ticker=FLNC', { headers: bearer(writeToken) })).json()
      const flnc = lookup.matches[0].security as { id: string; label: string }
      const valuationId = lookup.matches[0].valuations[0].node.id as string
      const first = await bare.post('/api/v1/trades', { headers: bearer(writeToken), data: { trades: [trade] } })
      expect(first.status()).toBe(200)
      const firstBody = await first.json()
      expect(firstBody.results[0].status).toBe('created')
      expect(firstBody.results[0].trade.security.label).toBe(flnc.label)
      const tradeId = firstBody.results[0].trade.id as string
      const second = await (await bare.post('/api/v1/trades', { headers: bearer(writeToken), data: { trades: [trade] } })).json()
      expect(second.results[0].status).toBe('existing')
      expect(second.results[0].trade.id).toBe(tradeId)

      // 4. 항목 만들기 제안과 공부 메모 제안을 올린다.
      const proposed = await bare.post('/api/v1/proposals', {
        headers: bearer(writeToken),
        data: {
          proposals: [
            {
              kind: 'CREATE_NODE',
              payload: {
                type: 'Decision',
                properties: { title: newTitle, action: 'ADD' },
                links: [{ type: 'HAS_DECISION', fromId: flnc.id }],
                tradeIds: [tradeId],
              },
              rationale: '방금 체결한 FLNC 매수는 추가 매수 결정을 실행한 것이다.',
              evidence: { nodeIds: [flnc.id], tradeIds: [tradeId], urls: [] },
              dedupeKey: `e2e-create-${externalId}`,
            },
            {
              kind: 'STUDY_NOTE',
              payload: { nodeId: flnc.id, level: 'UNSURE', note: `e2e 메모 ${suffix}` },
              rationale: '체결한 종목이라 이해 표시를 남긴다.',
              dedupeKey: `e2e-note-${externalId}`,
            },
          ],
        },
      })
      expect(proposed.status()).toBe(200)
      const [createdProposal, noteProposal] = (await proposed.json()).results.map((r: { proposal: { id: string } }) => r.proposal.id) as string[]
      const card = (id: string) => pageA.locator(`[data-testid="proposal-card"][data-id="${id}"]`)
      const badgeCount = async (testId: string) => Number((await pageA.getByTestId(testId).getAttribute('data-count')) ?? '0')

      // 5. 새로 고치면 대기 수 배지가 보이고 더보기 안의 배지와 같다.
      await pageA.reload()
      await expect(pageA.getByTestId('more-pending-badge')).toBeVisible()
      const pending = await badgeCount('more-pending-badge')
      expect(pending).toBeGreaterThanOrEqual(2)
      await pageA.getByTestId('more-open').click()
      await expect(pageA.getByTestId('more-item-proposals-badge')).toHaveAttribute('data-count', String(pending))
      await pageA.keyboard.press('Escape')
      await openScreen(pageA, 'proposals')
      await expect(card(createdProposal)).toBeVisible()
      await expect(card(noteProposal)).toBeVisible()
      await expect(card(createdProposal).getByTestId('proposal-summary')).toContainText(newTitle)
      await expect(card(createdProposal).getByTestId('proposal-rationale')).toBeVisible()
      await shot(pageA, 'proposals-wide')

      // 6. 항목 만들기는 제목을 고쳐 승인하고, 공부 메모는 이유를 적어 거절한다. 그때마다 배지가 한 개씩 준다.
      await card(createdProposal).getByTestId('proposal-edit-open').click()
      await card(createdProposal).getByTestId('proposal-edit-prop-title').fill(editedTitle)
      await card(createdProposal).getByTestId('proposal-edit-submit').click()
      await expect(pageA.getByTestId('proposals-message')).toHaveAttribute('data-kind', 'success')
      await expect(card(createdProposal)).toHaveCount(0)
      await expect.poll(() => badgeCount('more-pending-badge')).toBe(pending - 1)
      await card(noteProposal).getByTestId('proposal-reject-open').click()
      await pageA.getByTestId('proposal-reject-reason').fill(rejectReason)
      await pageA.getByTestId('proposal-reject-confirm').click()
      await expect(card(noteProposal)).toHaveCount(0)

      // 7. 승인함에서 새 결정을 열면 체결 한 줄이 보이고, 근거 따라가기에도 체결 절이 있다.
      await pageA.getByTestId('proposals-status-ACCEPTED').click()
      await expect(card(createdProposal)).toHaveAttribute('data-status', 'ACCEPTED')
      const open = card(createdProposal).getByTestId('proposal-result-open')
      const decisionId = (await open.getAttribute('data-node-id')) ?? ''
      expect(decisionId).not.toBe('')
      await open.click()
      await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-id', decisionId)
      await expect(pageA.getByTestId('detail-label')).toHaveText(editedTitle)
      await expect(pageA.getByTestId('detail-trades').getByTestId('trade-list-item')).toHaveCount(1)
      await pageA.getByTestId('node-trace').click()
      await expect(pageA.getByTestId('trace-step-trades')).toBeVisible()

      // 8. 에이전트는 거절 이유를 읽는다.
      const rejected = await (await bare.get('/api/v1/proposals?status=REJECTED', { headers: bearer(writeToken) })).json()
      const rejectedNote = rejected.items.find((p: { id: string }) => p.id === noteProposal)
      expect(rejectedNote.decisionNote).toBe(rejectReason)

      // 9. 내 체결에 한 줄이 있고 이은 결정은 고친 이름이다. 종목 상세에도 체결 절이 있다.
      await openScreen(pageA, 'trades')
      const row = pageA.locator(`[data-testid="trade-row"][data-id="${tradeId}"]`)
      await expect(row).toHaveCount(1)
      await expect(row).toHaveAttribute('data-ticker', 'FLNC')
      await expect(row.getByTestId('trade-decisions')).toContainText(editedTitle)
      await shot(pageA, 'trades-wide')
      await row.getByTestId('trade-security').click()
      await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-id', flnc.id)
      await expect(pageA.getByTestId('detail-trades')).toBeVisible()

      // 10. 다른 사용자(편집자 B)와 관리자에게는 체결도 제안도 배지도 없다.
      await pageB.reload()
      await openScreen(pageB, 'trades')
      await expect(pageB.getByTestId('trades-empty').or(pageB.getByTestId('trades-table'))).toBeVisible()
      await expect(pageB.locator(`[data-testid="trade-row"][data-id="${tradeId}"]`)).toHaveCount(0)
      await shot(pageB, 'trades-other-user-wide')
      for (const id of [flnc.id, decisionId]) {
        const loaded = pageB.waitForResponse((r) => r.url().includes('/api/me/trades') && r.request().method() === 'GET')
        await pageB.goto(`/workspace?node=${id}&pane=detail`)
        await loaded
        await expect(pageB.getByTestId('detail-panel')).toHaveAttribute('data-node-id', id)
        await expect(pageB.getByTestId('detail-trades')).toHaveCount(0)
      }
      await openScreen(pageB, 'proposals')
      await expect(pageB.getByTestId('proposals-empty')).toBeVisible()
      await expect(pageB.getByTestId('more-pending-badge')).toHaveCount(0)
      await pageB.getByTestId('more-open').click()
      await expect(pageB.getByTestId('more-item-proposals')).toBeVisible()
      await expect(pageB.getByTestId('more-item-proposals-badge')).toHaveCount(0)
      await pageB.keyboard.press('Escape')
      const adminTrades = await pageAdmin.evaluate(async () => {
        const body: { items: { id: string }[] } = await (await fetch('/api/me/trades?size=50')).json()
        return body.items.map((t) => t.id)
      })
      expect(adminTrades).not.toContain(tradeId)

      // 11. 열람자의 토큰도 제안을 올리지만 승인은 막히고 거절만 한다.
      const viewerToken = await issueToken(pageViewer, 'e2e 열람자 기록 토큰', 'write')
      const viewerProposed = await bare.post('/api/v1/proposals', {
        headers: bearer(viewerToken),
        data: {
          proposals: [
            {
              kind: 'CREATE_RELATIONSHIP',
              payload: { type: 'BASED_ON', fromId: valuationId, toId: decisionId },
              rationale: '추가 매수는 이 밸류에이션을 근거로 했다.',
              dedupeKey: `e2e-viewer-${externalId}`,
            },
          ],
        },
      })
      expect(viewerProposed.status()).toBe(200)
      const viewerProposalId = (await viewerProposed.json()).results[0].proposal.id as string
      await openScreen(pageViewer, 'proposals')
      const viewerCard = pageViewer.locator(`[data-testid="proposal-card"][data-id="${viewerProposalId}"]`)
      await expect(viewerCard.getByTestId('proposal-editor-required')).toBeVisible()
      await expect(viewerCard.getByTestId('proposal-accept')).toBeDisabled()
      await viewerCard.getByTestId('proposal-reject-open').click()
      await pageViewer.getByTestId('proposal-reject-confirm').click()
      await expect(viewerCard).toHaveCount(0)

      // 12. 체결을 지우면 행이 사라진다. 승인으로 만든 결정은 보관한다.
      await openScreen(pageA, 'trades')
      await row.getByTestId('trade-delete').click()
      await pageA.getByTestId('trades-delete-confirm').click()
      await expect(pageA.getByTestId('trades-message')).toHaveAttribute('data-kind', 'success')
      await expect(row).toHaveCount(0)
      await pageA.goto(`/workspace?node=${decisionId}&pane=detail`)
      await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-id', decisionId)
      await archiveFromDetail(pageA)
    } finally {
      await bare.dispose()
      await revokeTokensExcept(pageA, keptA)
      await revokeTokensExcept(pageViewer, keptViewer)
    }
  })

  test('8) 관리자가 열람자를 비활성화하면 열람자의 기존 세션이 끊긴다', async () => {
    await openScreen(pageAdmin, 'users')
    await pageAdmin.getByTestId('users-refresh').click()
    const row = usersRow(pageAdmin, viewer.email)
    await expect(row.getByTestId('users-row-linked')).toHaveText('로그인함')
    await row.getByTestId('users-row-disable').click()
    await expect(pageAdmin.getByTestId('users-message')).toHaveAttribute('data-kind', 'success')
    await expect(row).toHaveAttribute('data-enabled', 'false')
    await expect(row.getByTestId('users-row-enable')).toBeVisible()

    const base = new URL(pageViewer.url()).origin
    const me = await pageViewer.request.get(`${base}/api/auth/me`)
    expect(me.status()).toBe(401)

    await pageViewer.reload()
    await expect(pageViewer.getByTestId('login-google')).toBeVisible()
    await expect(pageViewer.getByTestId('current-user-name')).toHaveCount(0)
    await shot(pageViewer, '08-disabled')
  })

  test('10) 열람자는 처음 로그인하면 둘러보기 가이드가 열리고, 끝내면 다시 열리지 않으며 「사용법」 으로 다시 본다', async ({ browser }) => {
    const page = await open(browser)
    await loginAs(page, guideViewer, 'success', '/', { guide: 'keep' })
    const bubble = page.getByTestId('guide-bubble')
    await expect(bubble).toHaveAttribute('data-step', 'intro')
    await page.getByTestId('guide-start').click()

    // 개념 지도 단계는 지도에서, 다음 단계부터는 작업 공간에서 가리킨다.
    await expect(page).toHaveURL(/\/map$/)
    await expect(bubble).toHaveAttribute('data-step', 'map')
    await expect(page.getByTestId('concept-map-canvas')).toHaveClass(/(^|\s)guide-target(\s|$)/)
    await page.getByTestId('guide-next').click()
    await expect(page).toHaveURL(/\/workspace(\?|$)/)

    const steps: [string, string][] = [
      ['search', 'search-input'],
      ['graph', 'graph-canvas'],
      ['detail', 'workspace-pane-detail'],
    ]
    for (const [step, target] of steps) {
      await expect(bubble).toHaveAttribute('data-step', step)
      await expect(page.getByTestId(target)).toHaveClass(/(^|\s)guide-target(\s|$)/)
      if (step === 'graph') await shot(page, '10-guide-browse')
      if (step !== 'detail') await page.getByTestId('guide-next').click()
    }
    await page.getByTestId('guide-finish').click()
    await expect(bubble).toHaveCount(0)
    await expect(page.locator('.guide-target')).toHaveCount(0)

    // 끝낸 기록이 서버에 남은 뒤에는 새로고침해도 열리지 않는다.
    const base = new URL(page.url()).origin
    await expect
      .poll(async () => (await (await page.request.get(`${base}/api/auth/me`)).json()).guideDoneAt, { message: 'guideDoneAt' })
      .not.toBeNull()
    await page.reload()
    await expect(page.getByTestId('search-input')).toBeVisible()
    // 가이드는 온톨로지를 받은 직후에 열린다. 열리지 않는 것을 보려면 그 시점이 지나도록 잠시 둔다.
    await page.waitForTimeout(1000)
    await expect(bubble).toHaveCount(0)

    // 「사용법」 은 끝낸 기록과 상관없이 처음부터 다시 연다.
    await page.getByTestId('guide-open').click()
    await expect(bubble).toHaveAttribute('data-step', 'intro')
    await page.getByTestId('guide-skip').click()
    await expect(bubble).toHaveCount(0)
  })

  test('11) 편집자는 처음 로그인하면 연습 기업, 근거 문서, 주장을 따라 만들고, 끝내면 연습 항목이 보관된다', async ({ browser }) => {
    // 따라하기는 주장의 대상으로 고를 산업이 있어야 열린다.
    const sector = `가이드산업-${suffix}`
    await createNode(pageAdmin, 'Sector', sector, { name: sector })

    const page = await open(browser)
    await loginAs(page, guideEditor, 'success', '/', { guide: 'keep' })
    const bubble = page.getByTestId('guide-bubble')
    await expect(bubble).toHaveAttribute('data-step', 'intro')
    await page.getByTestId('guide-start').click()

    // 1. 기업: 「다음」 없이 말풍선이 「＋ 추가」 를 가리키고, 메뉴에서 기업을 고르면 연습 이름을 채운 창이 열린다.
    await expect(bubble).toHaveAttribute('data-step', 'company')
    await expect(page.getByTestId('guide-next')).toHaveCount(0)
    await expect(page.getByTestId('add-open')).toHaveClass(/(^|\s)guide-target(\s|$)/)
    await openAdd(page, 'Company')
    const companyInput = page.getByTestId('create-prop-name')
    await expect(companyInput).toHaveValue(/^\[연습\] /)
    await expect(page.getByTestId('create-submit')).toHaveClass(/(^|\s)guide-target(\s|$)/)
    const practiceCompany = await companyInput.inputValue()
    await page.getByTestId('create-submit').click()

    // 2. 근거 문서: 같은 방법으로 제목이 채워진 창이 열린다.
    await expect(bubble).toHaveAttribute('data-step', 'document')
    await expect(page.getByTestId('add-open')).toHaveClass(/(^|\s)guide-target(\s|$)/)
    await openAdd(page, 'Document')
    const titleInput = page.getByTestId('create-prop-title')
    await expect(titleInput).not.toHaveValue('')
    await expect(page.getByTestId('create-submit')).toHaveClass(/(^|\s)guide-target(\s|$)/)
    const practiceDocument = await titleInput.inputValue()
    await page.getByTestId('create-submit').click()

    // 3. 주장: 연습 기업의 상세에서 관계, 근거 문서, 설명이 채워진 주장 폼이 열린다.
    await expect(bubble).toHaveAttribute('data-step', 'claim')
    await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-type', 'Company')
    await expect(page.getByTestId('claim-predicate-select')).toHaveValue('BELONGS_TO_SECTOR')
    await expect(page.getByTestId('claim-doc-selected')).toContainText(practiceDocument)
    await expect(page.getByTestId('claim-description')).not.toHaveValue('')
    await pick(page, 'claim-object-picker', sector)
    await page.getByTestId('claim-add-submit').click()

    // 4. 마침
    await expect(bubble).toHaveAttribute('data-step', 'done')
    // 그래프처럼 큰 대상이면 말풍선이 그 안쪽에 있어 상세 칸의 성공 안내와 입력칸을 덮지 않는다.
    await expect(bubble).toHaveAttribute('data-placement', 'anchored')
    await expect
      .poll(async () => {
        const b = await bubble.boundingBox()
        const d = await page.getByTestId('detail-panel').boundingBox()
        if (!b || !d) return null
        return b.x < d.x + d.width && d.x < b.x + b.width && b.y < d.y + d.height && d.y < b.y + b.height
      }, { message: '마침 말풍선과 상세 칸이 겹치지 않는다' })
      .toBe(false)
    await shot(page, '11-guide-practice-done')

    const created = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('workbench.guide') ?? '{}') as { created?: Record<string, string> }).created ?? {},
    )
    const ids = [created.company, created.document, created.claim]
    for (const id of ids) expect(id, '연습 항목 ID').toBeTruthy()
    await page.getByTestId('guide-finish').click()
    await expect(bubble).toHaveCount(0)

    const base = new URL(page.url()).origin
    for (const id of ids) {
      await expect
        .poll(async () => (await (await page.request.get(`${base}/api/nodes/${id}`)).json()).node.archived, { message: `${id} 보관` })
        .toBe(true)
    }
    await page.getByTestId('search-input').fill(practiceCompany)
    await page.getByTestId('search-submit').click()
    await expect(page.getByTestId('search-empty')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('search-input')).toBeVisible()
    // 가이드는 온톨로지를 받은 직후에 열린다. 열리지 않는 것을 보려면 그 시점이 지나도록 잠시 둔다.
    await page.waitForTimeout(1000)
    await expect(bubble).toHaveCount(0)
  })

  test('11b) 다시 연습하다 새로고침하면 이어서 하기를 묻고, 그만두면 만든 연습 항목을 보관한다', async () => {
    const page = pageAdmin
    await page.getByTestId('guide-open').click()
    const bubble = page.getByTestId('guide-bubble')
    await expect(bubble).toHaveAttribute('data-step', 'intro')
    await page.getByTestId('guide-start').click()
    await expect(bubble).toHaveAttribute('data-step', 'company')
    await expect(page.getByTestId('add-open')).toHaveClass(/(^|\s)guide-target(\s|$)/)
    await openAdd(page, 'Company')
    await expect(page.getByTestId('create-prop-name')).toHaveValue(/^\[연습\] /)
    await expect(page.getByTestId('create-submit')).toHaveClass(/(^|\s)guide-target(\s|$)/)
    await page.getByTestId('create-submit').click()
    await expect(bubble).toHaveAttribute('data-step', 'document')
    const companyId = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('workbench.guide') ?? '{}') as { created?: Record<string, string> }).created?.company ?? '',
    )
    expect(companyId, '연습 기업 ID').not.toBe('')

    await page.reload()
    await expect(bubble).toHaveAttribute('data-step', 'resume')
    await expect(page.getByTestId('guide-resume')).toBeVisible()
    await expect(page.getByTestId('guide-stop')).toBeVisible()
    await page.getByTestId('guide-stop').click()
    await expect(bubble).toHaveCount(0)

    const base = new URL(page.url()).origin
    await expect
      .poll(async () => (await (await page.request.get(`${base}/api/nodes/${companyId}`)).json()).node.archived, { message: '연습 기업 보관' })
      .toBe(true)
  })

  test('9) 관리자가 YAML 로 새 타입을 더하면 편집자 화면에 안내가 나오고, 되돌리면 타입이 사라진다', async () => {
    const typeKey = `Fund${suffix}`
    // 1. 편집자 A 가 온톨로지를 한 번 읽어 둔 상태(작업 공간)로 둔다.
    await pageA.getByTestId('tab-workspace').click()
    await expect(pageA.getByTestId('search-input')).toBeVisible()

    // 2. 관리자가 저장 전 버전 번호를 읽어 두고 YAML 로 새 타입을 더해 저장한다.
    await openScreen(pageAdmin, 'ontology')
    const versionText = await pageAdmin.getByTestId('ontology-version').innerText()
    const before = Number(/\d+/.exec(versionText)?.[0])
    expect(before, '저장 전 온톨로지 버전').toBeGreaterThan(0)

    try {
      await pageAdmin.getByTestId('ontology-edit-yaml').click()
      const input = pageAdmin.getByTestId('ontology-yaml-input')
      await expect(input).not.toHaveValue('')
      const lines = (await input.inputValue()).split('\n')
      const at = lines.findIndex((line) => line === 'nodeTypes:')
      expect(at, '정규화된 YAML 의 nodeTypes: 줄').toBeGreaterThanOrEqual(0)
      lines.splice(
        at + 1,
        0,
        `  ${typeKey}:`,
        '    label: 펀드',
        '    description: 투자 펀드',
        '    labelProperty: name',
        '    properties:',
        '      name:',
        '        type: string',
        '        label: 펀드 이름',
        '        required: true',
      )
      await input.fill(lines.join('\n'))
      await pageAdmin.getByTestId('ontology-preview').click()
      await expect(pageAdmin.getByTestId('ontology-diff-added')).toContainText(`nodeTypes.${typeKey}`)
      await shotElement(pageAdmin.getByTestId('ontology-preview-panel'), '09-ontology-preview')
      await pageAdmin.getByTestId('ontology-save').click()
      await expect(pageAdmin.getByTestId('ontology-message')).toHaveAttribute('data-kind', 'success')
      await shot(pageAdmin, '09-ontology-saved')

      // 3. 편집자 A 가 API 를 부르는 동작을 하면 안내가 나오고, 다시 읽으면 새 타입이 선택지에 있다.
      await pageA.getByTestId('search-input').fill(data.supplier)
      await pageA.getByTestId('search-submit').click()
      await expect(pageA.getByTestId('ontology-stale')).toBeVisible()
      await pageA.getByTestId('ontology-reload').click()
      await expect(pageA.getByTestId('ontology-stale')).toHaveCount(0)
      await pageA.getByTestId('add-open').click()
      await expect(pageA.getByTestId(`add-type-${typeKey}`)).toContainText('펀드')
      await pageA.keyboard.press('Escape')

      // 4. 관리자가 버전 기록에서 저장 전 버전으로 되돌린다.
      await pageAdmin.getByTestId('ontology-history-open').click()
      await pageAdmin.locator(`[data-testid="ontology-history-row"][data-version="${before}"]`).click()
      await pageAdmin.getByTestId('ontology-restore').click()
      await expect(pageAdmin.getByTestId('ontology-diff-removed')).toContainText(`nodeTypes.${typeKey}`)
      await pageAdmin.getByTestId('ontology-save').click()
      await expect(pageAdmin.getByTestId('ontology-message')).toHaveAttribute('data-kind', 'success')
      await shot(pageAdmin, '09-ontology-restored')
    } finally {
      // 단계가 중간에 실패해도 새 타입이 남아 다음 실행의 타입 선택지 단언을 깨지 않게 저장 전 버전으로 되돌린다.
      const base = new URL(pageAdmin.url()).origin
      await pageAdmin.request.get(`${base}/api/auth/csrf`)
      const xsrf = (await pageAdmin.context().cookies(base)).find((c) => c.name === 'XSRF-TOKEN')?.value
      const latest = ((await (await pageAdmin.request.get(`${base}/api/ontology`)).json()) as { version: number }).version
      if (latest !== before) {
        const res = await pageAdmin.request.post(`${base}/api/ontology/versions/${before}/restore`, {
          headers: { 'X-XSRF-TOKEN': xsrf ?? '', 'Content-Type': 'application/json' },
          data: { baseVersion: latest, note: '테스트 정리', confirm: true },
        })
        // 이미 되돌려 바뀐 점이 없으면 서버가 400 으로 답한다.
        expect([201, 400]).toContain(res.status())
      }
    }
  })

  test('9b) 관리자가 YAML 로 인물에 속성을 더하고 저장하면 편집자의 고치기 폼에 그 칸이 나오고, 되돌린다', async () => {
    const propKey = `nickname${suffix}`
    // 1. 관리자가 저장 전 버전 번호를 읽어 둔다.
    await openScreen(pageAdmin, 'ontology')
    const versionText = await pageAdmin.getByTestId('ontology-version').innerText()
    const before = Number(/\d+/.exec(versionText)?.[0])
    expect(before, '저장 전 온톨로지 버전').toBeGreaterThan(0)

    try {
      // 2. YAML 의 Person 타입 properties 아래에 string 속성을 더하고 확인한 뒤 저장한다.
      await pageAdmin.getByTestId('ontology-edit-yaml').click()
      const input = pageAdmin.getByTestId('ontology-yaml-input')
      await expect(input).not.toHaveValue('')
      const lines = (await input.inputValue()).split('\n')
      const person = lines.findIndex((line) => line === '  Person:')
      expect(person, '정규화된 YAML 의 Person 줄').toBeGreaterThanOrEqual(0)
      const props = lines.findIndex((line, i) => i > person && line === '    properties:')
      expect(props, 'Person 의 properties 줄').toBeGreaterThan(person)
      lines.splice(props + 1, 0, `      ${propKey}:`, '        type: string', '        label: 별명')
      await input.fill(lines.join('\n'))
      await pageAdmin.getByTestId('ontology-preview').click()
      await expect(pageAdmin.getByTestId('ontology-diff-added')).toContainText(`nodeTypes.Person.properties.${propKey}`)
      await shotElement(pageAdmin.getByTestId('ontology-preview-panel'), '09b-ontology-yaml-preview')
      await pageAdmin.getByTestId('ontology-save').click()
      await expect(pageAdmin.getByTestId('ontology-message')).toHaveAttribute('data-kind', 'success')
      await shot(pageAdmin, '09b-ontology-yaml')

      // 3. 편집자 A 가 API 를 부르는 동작을 하면 안내가 나오고, 다시 읽으면 인물의 고치기 폼에 「별명」 칸이 있다.
      await pageA.getByTestId('tab-workspace').click()
      await pageA.getByTestId('search-input').fill(`Warren Buffett ${suffix}`)
      await pageA.getByTestId('search-submit').click()
      await expect(pageA.getByTestId('ontology-stale')).toBeVisible()
      await pageA.getByTestId('ontology-reload').click()
      await expect(pageA.getByTestId('ontology-stale')).toHaveCount(0)
      await searchResult(pageA, `워런 버핏-${suffix}`).click()
      await expect(pageA.getByTestId('detail-label')).toHaveText(`워런 버핏-${suffix}`)
      await pageA.getByTestId('node-edit').click()
      await expect(pageA.getByTestId(`edit-prop-${propKey}`)).toBeVisible()
      await expect(pageA.getByTestId('node-edit-form')).toContainText('별명')

      // 4. 예전 주소 /ontology?view=form 을 열면 YAML 편집기로 열리고 주소가 view=yaml 이 된다.
      await pageAdmin.goto('/ontology?view=form')
      await expect(pageAdmin.getByTestId('ontology-yaml-editor')).toBeVisible()
      await expect(pageAdmin).toHaveURL(/view=yaml/)
    } finally {
      // 단계가 중간에 실패해도 속성이 남지 않게 저장 전 버전으로 되돌린다.
      await restoreOntologyVersion(pageAdmin, before)
    }
  })

  test('9d) 긴 YAML 을 스크롤해도 툴바와 결과가 화면 안에 있고, 틀린 키의 줄 번호를 누르면 편집칸이 그 줄을 고른다', async () => {
    await openScreen(pageAdmin, 'ontology')
    await pageAdmin.reload()
    await pageAdmin.getByTestId('ontology-edit-yaml').click()
    const input = pageAdmin.getByTestId('ontology-yaml-input')
    await expect(input).not.toHaveValue('')
    const lines = (await input.inputValue()).split('\n')
    const person = lines.findIndex((line) => line === '  Person:')
    expect(person, '정규화된 YAML 의 Person 줄').toBeGreaterThanOrEqual(0)
    const props = lines.findIndex((line, i) => i > person && line === '    properties:')
    expect(props, 'Person 의 properties 줄').toBeGreaterThan(person)

    // 1. 운영 크기를 흉내 내 속성을 많이 더해 편집칸을 늘린다. 저장하지 않는다.
    const extra = Array.from({ length: 150 }, (_, i) => [`      long${i}${suffix}:`, '        type: string', `        label: 긴 속성 ${i}`]).flat()
    lines.splice(props + 1, 0, ...extra)
    await input.fill(lines.join('\n'))
    await input.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(pageAdmin.getByTestId('ontology-yaml-toolbar')).toBeInViewport()
    await pageAdmin.getByTestId('ontology-preview').click()
    await expect(pageAdmin.getByTestId('ontology-preview-panel')).toBeInViewport()
    await expect(pageAdmin.getByTestId('ontology-yaml-toolbar')).toBeInViewport()

    // 2. 알 수 없는 키를 Person 바로 아래에 넣고 확인하면 오류의 줄 번호 단추가 그 줄을 가리키고, 누르면 편집칸이 그 줄을 고른다.
    const broken = (await input.inputValue()).split('\n')
    broken.splice(person + 1, 0, `    nokey${suffix}: 1`)
    await input.fill(broken.join('\n'))
    await pageAdmin.getByTestId('ontology-preview').click()
    const errorLine = pageAdmin.getByTestId('ontology-preview-error-line').first()
    await expect(errorLine).toHaveAttribute('data-line', String(person + 2))
    await errorLine.click()
    const selectedLine = await input.evaluate((el) => {
      const area = el as HTMLTextAreaElement
      return area.value.slice(0, area.selectionStart).split('\n').length
    })
    expect(selectedLine).toBe(person + 2)
    await shot(pageAdmin, '09d-ontology-yaml-error-line')

    // 3. 고친 초안은 확인 창을 거쳐 버린다.
    await pageAdmin.getByTestId('ontology-draft-discard').click()
    await pageAdmin.getByTestId('ontology-discard-confirm-submit').click()
    await expect(pageAdmin.getByTestId('ontology-yaml-editor')).toHaveCount(0)
  })

  test('9e) 연동 토큰으로 올린 온톨로지 변경 제안을 「제안」 에서 바뀐 점을 보고 승인하면 버전이 하나 오르고, 되돌린다', async () => {
    const propKey = `proposed${suffix}`
    await openScreen(pageAdmin, 'ontology')
    await pageAdmin.reload()
    const before = Number(/\d+/.exec(await pageAdmin.getByTestId('ontology-version').innerText())?.[0])
    expect(before, '시작 전 온톨로지 버전').toBeGreaterThan(0)
    const origin = new URL(pageAdmin.url()).origin
    const keptAdmin = await tokenIds(pageAdmin)
    const bare = await request.newContext({ baseURL: origin })
    try {
      // 1. 관리자의 「조회와 기록」 토큰으로 지금 정의에 속성을 더한 변경 제안을 올린다.
      const token = await issueToken(pageAdmin, 'e2e 온톨로지 토큰', 'write')
      const headers = { Authorization: `Bearer ${token}` }
      const current = await (await bare.get('/api/v1/ontology/yaml', { headers })).json()
      const lines = (current.yaml as string).split('\n')
      const person = lines.findIndex((line) => line === '  Person:')
      const props = lines.findIndex((line, i) => i > person && line === '    properties:')
      expect(props, 'Person 의 properties 줄').toBeGreaterThan(person)
      lines.splice(props + 1, 0, `      ${propKey}:`, '        type: string', '        label: 제안 속성')
      const posted = await bare.post('/api/v1/proposals', {
        headers,
        data: {
          proposals: [
            {
              kind: 'ONTOLOGY_CHANGE',
              payload: { baseVersion: current.version, yaml: lines.join('\n') },
              rationale: '인물에 제안 속성을 더한다.',
              dedupeKey: `e2e-ontology-${suffix}`,
            },
          ],
        },
      })
      expect(posted.status()).toBe(200)
      const proposalId = (await posted.json()).results[0].proposal.id as string

      // 2. 「제안」 의 카드에 바뀐 점이 보이고, 승인하면 버전이 하나 오른다.
      await openScreen(pageAdmin, 'proposals')
      const card = pageAdmin.locator(`[data-testid="proposal-card"][data-id="${proposalId}"]`)
      await expect(card.getByTestId('proposal-ontology-preview')).toContainText(`nodeTypes.Person.properties.${propKey}`)
      await shot(pageAdmin, '10-ontology-change-proposal')
      const confirm = card.getByTestId('proposal-ontology-confirm')
      if (await confirm.count()) await confirm.check()
      await card.getByTestId('proposal-accept').click()
      await expect(pageAdmin.getByTestId('proposals-message')).toHaveAttribute('data-kind', 'success')
      await expect(card).toHaveCount(0)
      await openScreen(pageAdmin, 'ontology')
      await expect(pageAdmin.getByTestId('ontology-version')).toHaveText(`버전 ${before + 1}`)
    } finally {
      await bare.dispose()
      await revokeTokensExcept(pageAdmin, keptAdmin)
      await restoreOntologyVersion(pageAdmin, before)
    }
  })

  test('9c) 관리자가 기존 데이터와 어긋나는 변경을 미리보면 영향과 확인란이 보이고, 저장하지 않고 초안을 버린다', async () => {
    const propKey = `required${suffix}`
    // 1. 관리자가 시작 전 버전 번호를 읽어 둔다. 9b 의 정리는 API 로 되돌려 화면이 예전 버전을 들고 있으므로 새로고침해 최신 버전을 읽는다.
    await openScreen(pageAdmin, 'ontology')
    await pageAdmin.reload()
    await expect(pageAdmin.getByTestId('ontology-stale')).toHaveCount(0)
    const before = Number(/\d+/.exec(await pageAdmin.getByTestId('ontology-version').innerText())?.[0])
    expect(before, '시작 전 온톨로지 버전').toBeGreaterThan(0)

    // 2. YAML 의 Concept 타입 properties 아래에 필수 속성을 더한다. 2d 에서 만든 개념에는 이 값이 없다.
    await pageAdmin.getByTestId('ontology-edit-yaml').click()
    const input = pageAdmin.getByTestId('ontology-yaml-input')
    await expect(input).not.toHaveValue('')
    const lines = (await input.inputValue()).split('\n')
    const concept = lines.findIndex((line) => line === '  Concept:')
    expect(concept, '정규화된 YAML 의 Concept 줄').toBeGreaterThanOrEqual(0)
    const props = lines.findIndex((line, i) => i > concept && line === '    properties:')
    expect(props, 'Concept 의 properties 줄').toBeGreaterThan(concept)
    lines.splice(
      props + 1,
      0,
      `      ${propKey}:`,
      '        type: string',
      '        label: 필수 시험',
      '        required: true',
      '        maxLength: 50',
    )
    await input.fill(lines.join('\n'))

    // 3. 영향 행과 개수, 꺼진 저장 단추, 확인란을 확인한다. 저장은 누르지 않는다.
    await pageAdmin.getByTestId('ontology-preview').click()
    const impact = pageAdmin.locator('[data-testid="ontology-impact"][data-kind="NOW_REQUIRED"]')
    await expect(impact).toBeVisible()
    await expect(impact).toContainText(/\d+개/)
    // 더한 것은 이 단계의 속성 하나뿐이다. 앞 단계가 남긴 항목이 섞이지 않는다.
    await expect(pageAdmin.getByTestId('ontology-diff-added').locator('li')).toHaveCount(1)
    const save = pageAdmin.getByTestId('ontology-save')
    await expect(save).toBeDisabled()
    await pageAdmin.getByTestId('ontology-save-confirm').check()
    await expect(save).toBeEnabled()
    await shotElement(pageAdmin.getByTestId('ontology-preview-panel'), '09c-ontology-impact')

    // 4. 고친 초안을 버리면 확인 창이 먼저 열리고, 버리면 버전이 그대로다.
    await pageAdmin.getByTestId('ontology-draft-discard').click()
    await pageAdmin.getByTestId('ontology-discard-confirm-submit').click()
    await expect(pageAdmin.getByTestId('ontology-version')).toHaveText(`버전 ${before}`)
  })
})
