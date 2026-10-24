import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { admin, exact, loginAs, newPage, shot, shotElement, type TestUser } from './support'

// 두 편집자(A, B)와 관리자, 열람자가 같은 서버에서 협업하는 흐름을 순서대로 확인한다.
// 로그인은 실제 Google 대신 가짜 OIDC 서버(navikt/mock-oauth2-server, interactiveLogin)를 거친다.
// 데이터 이름과 이메일에 실행마다 다른 접미사를 붙여, 이전 실행이 남긴 데이터와 겹치지 않게 한다.

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

/** 작업 공간 왼쪽 검색으로 노드를 찾아 중심 노드로 연다. */
async function searchAndOpen(page: Page, label: string, options: { includeArchived?: boolean } = {}): Promise<void> {
  await page.getByTestId('tab-workspace').click()
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

function searchResult(page: Page, label: string): Locator {
  return page.getByTestId('search-result').filter({ has: page.locator('.result-label', { hasText: exact(label) }) })
}

/** 왼쪽 「새 노드 만들기」 폼으로 노드를 만든다. 만든 노드가 선택된다. */
async function createNode(page: Page, type: string, label: string, props: Record<string, string>): Promise<void> {
  await page.getByTestId('tab-workspace').click()
  await page.getByTestId('new-node-type').selectOption(type)
  await page.getByTestId('new-node-button').click()
  for (const [name, value] of Object.entries(props)) {
    const input = page.getByTestId(`create-prop-${name}`)
    const tag = await input.evaluate((el) => el.tagName)
    if (tag === 'SELECT') await input.selectOption(value)
    else await input.fill(value)
  }
  await page.getByTestId('create-submit').click()
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

test.describe('금융 온톨로지 워크벤치: 역할별 협업', () => {
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

    await pageAdmin.getByTestId('tab-users').click()
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
    await pageAdmin.getByTestId('tab-changes').click()
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
    await expect(pageAdmin.getByTestId('tab-changes')).toBeVisible()
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
    await pageAdmin.getByTestId('tab-changes').click()
    await expect(pageAdmin.getByTestId('error-boundary')).toContainText('이 화면을 불러오지 못했습니다.')
    await expect(pageAdmin.getByTestId('tab-workspace')).toBeVisible()
    await expect(pageAdmin.getByTestId('current-user-name')).toHaveText(admin.name)
    await shot(pageAdmin, '00d-error-boundary')

    // 다른 탭으로 옮기면 새 탭이 바로 그려진다.
    await pageAdmin.getByTestId('tab-list').click()
    await expect(pageAdmin.getByTestId('list-tab')).toBeVisible()
    await expect(pageAdmin.getByTestId('error-boundary')).toHaveCount(0)

    // 서버가 정상으로 돌아오면 「다시 시도」 로 화면이 돌아온다.
    await pageAdmin.getByTestId('tab-changes').click()
    await expect(pageAdmin.getByTestId('error-boundary')).toBeVisible()
    await pageAdmin.unroute('**/api/changes*')
    await pageAdmin.getByTestId('error-boundary-retry').click()
    await expect(pageAdmin.getByTestId('changes-table')).toBeVisible()
    await expect(pageAdmin.getByTestId('error-boundary')).toHaveCount(0)
  })

  test('0e) 첫 화면 안내와 만들기 폼이 한국어 표시 이름으로 보인다', async () => {
    await pageAdmin.getByTestId('tab-workspace').click()
    await expect(pageAdmin.getByTestId('welcome-guide')).toBeVisible()
    await expect(pageAdmin.getByTestId('welcome-guide')).toContainText('기업 추가')
    await expect(pageAdmin.getByTestId('welcome-guide')).toContainText('근거 문서 등록')
    await expect(pageAdmin.getByTestId('welcome-guide')).toContainText('주장 추가')
    await shot(pageAdmin, '00e-first-screen')

    const typeSelect = pageAdmin.getByTestId('new-node-type')
    await expect(typeSelect.locator('option')).toHaveText(['무엇을 만들까요?', '기업', '종목', '산업', '근거 문서', '인물', '개념', '세상의 변화', '병목', '밸류에이션', '시나리오', '투자 결정', '주장'])
    // 저장되는 값은 그대로다.
    await expect(typeSelect.locator('option')).toHaveCount(13)
    await typeSelect.selectOption('Claim')
    await pageAdmin.getByTestId('new-node-button').click()
    await expect(pageAdmin.getByTestId('claim-add-form')).toBeVisible()
    await expect(pageAdmin.getByTestId('claim-subject-picker-input')).toBeVisible()
    await expect(pageAdmin.getByTestId('claim-object-picker-input')).toBeVisible()
    await pageAdmin.getByTestId('claim-add-cancel').click()
    await typeSelect.selectOption('Company')
    await pageAdmin.getByTestId('new-node-button').click()
    const company = pageAdmin.getByTestId('create-form')
    await expect(company).toContainText('기업 이름')
    await expect(company).toContainText('국가')
    await expect(company).toContainText('기업이 등록된 나라')
    await expect(pageAdmin.getByTestId('create-prop-country').locator('option[value="KR"]')).toHaveText('대한민국 (KR)')
    await expect(company).not.toContainText('문자열')
    await expect(company).not.toContainText('registrationNumber')
    await shot(pageAdmin, '00e-company-form')
    await pageAdmin.getByTestId('create-cancel').click()

    await typeSelect.selectOption('Security')
    await pageAdmin.getByTestId('new-node-button').click()
    const market = pageAdmin.getByTestId('create-prop-market')
    await expect(market.locator('option')).toHaveText(['선택하세요', '코스피', '코스닥', '나스닥', '뉴욕증권거래소', '기타'])
    await expect(market.locator('option[value="KRX_KOSPI"]')).toHaveText('코스피')
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
    await pageAdmin.getByTestId('tab-changes').click()
    await expect(pageAdmin).toHaveURL(/\/changes(\?|$)/)
    await pageAdmin.goBack()
    await expect(pageAdmin).toHaveURL(/\/list(\?|$)/)
    await expect(pageAdmin.getByTestId('tab-list')).toHaveAttribute('aria-selected', 'true')
    await pageAdmin.reload()
    await expect(pageAdmin.getByTestId('tab-list')).toHaveAttribute('aria-selected', 'true')
    await expect(pageAdmin).toHaveURL(/\/list(\?|$)/)
    await pageAdmin.goto('/')
    await expect(pageAdmin).toHaveURL(/\/workspace$/)
    await expect(pageAdmin.getByTestId('tab-workspace')).toHaveAttribute('aria-selected', 'true')
  })

  test('1) A 가 기업과 산업, 종목을 만들고 ISSUES 관계를 잇는다', async ({ browser }) => {
    pageA = await open(browser)
    await loginAs(pageA, editorA)
    await expect(pageA.getByTestId('current-user-role')).toHaveAttribute('data-role', 'EDITOR')
    await expect(pageA.getByTestId('tab-users')).toHaveCount(0)
    // ADMIN 이 아니면 /users 는 작업 공간으로 바뀐다.
    await pageA.goto('/users')
    await expect(pageA).toHaveURL(/\/workspace$/)
    await expect(pageA.getByTestId('search-input')).toBeVisible()

    await createNode(pageA, 'Company', data.company, { name: data.company, country: 'KR' })
    await createNode(pageA, 'Sector', data.sector, { name: data.sector, scheme: 'GICS' })
    await createNode(pageA, 'Security', data.security, {
      market: 'KRX_KOSPI',
      ticker: data.ticker,
      name: data.security,
      securityType: 'COMMON',
      currency: 'KRW',
    })

    // 종목 쪽에서 (Company) —ISSUES→ 이 종목 관계를 추가한다.
    await pageA.getByTestId('relationship-add-toggle').click()
    await pageA.getByTestId('relationship-type-select').selectOption('ISSUES:in')
    await pick(pageA, 'relationship-target-picker', data.company)
    await expect(pageA.getByTestId('relationship-target-selected')).toContainText(data.company)
    await pageA.getByTestId('relationship-add-submit').click()

    const row = pageA.getByTestId('relationship-row').filter({ hasText: data.company })
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-rel-type', 'ISSUES')
    await expect(pageA.locator('[data-testid="graph-node"]').filter({ hasText: data.company })).toHaveCount(1)
    await shot(pageA, '01-issues')
  })

  test('1b) 같은 이름은 저장 전에 경고하고, 종목을 만들며 고른 발행 기업이 이어진다', async () => {
    await pageA.getByTestId('tab-workspace').click()
    await pageA.getByTestId('new-node-type').selectOption('Company')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-name').fill(data.supplier)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('create-duplicate')).toBeVisible()
    await expect(pageA.getByTestId('create-duplicate-item')).toHaveCount(1)
    await expect(pageA.getByTestId('create-duplicate-item')).toContainText('대한민국 (KR)')
    await shot(pageA, '01b-duplicate')
    await pageA.getByTestId('create-duplicate-open').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)

    // 그래도 만들면 같은 이름의 기업이 둘이 된다.
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-name').fill(data.supplier)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('create-duplicate')).toBeVisible()
    await pageA.getByTestId('create-duplicate-confirm').click()
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
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
    await pageA.getByTestId('node-archive-button').click()
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')

    // 종목을 만들면서 발행 기업을 고르면 ISSUES 관계가 함께 이어진다.
    await pageA.getByTestId('new-node-type').selectOption('Security')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-market').selectOption('KRX_KOSDAQ')
    await pageA.getByTestId('create-prop-ticker').fill(data.issuerTicker)
    await pageA.getByTestId('create-prop-name').fill(data.issuerSecurity)
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
    await pageA.getByTestId('new-node-type').selectOption('Security')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-market').selectOption('KRX_KOSDAQ')
    await pageA.getByTestId('create-prop-ticker').fill(data.failedTicker)
    await pageA.getByTestId('create-prop-name').fill(data.failedSecurity)
    await pageA.getByTestId('create-prop-securityType').selectOption('COMMON')
    await pageA.getByTestId('create-prop-currency').selectOption('USD')
    await pick(pageA, 'create-link-ISSUES-picker', data.company)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.failedSecurity)
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'error')
    await expect(pageA.getByTestId('detail-notice')).toContainText('발행 기업을 잇지 못했습니다')
    await pageA.unroute('**/api/relationships')
  })

  test('1c) 투자 논리 사슬을 만들고 결정에서 변화까지 따라간다', async () => {
    await createNode(pageA, 'Change', data.change, { title: data.change, category: 'TECHNOLOGY' })

    await pageA.getByTestId('new-node-type').selectOption('Bottleneck')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-title').fill(data.bottleneck)
    await pageA.getByTestId('create-prop-status').selectOption('CONFIRMED')
    await pick(pageA, 'create-link-CREATES-picker', data.change)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.bottleneck)

    await pageA.getByTestId('new-node-type').selectOption('Company')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-name').fill(data.investmentCompany)
    await pageA.getByTestId('create-prop-country').selectOption('US')
    await pick(pageA, 'create-link-BENEFITS-picker', data.bottleneck)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.investmentCompany)

    await pageA.getByTestId('new-node-type').selectOption('Security')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-market').selectOption('NASDAQ')
    await pageA.getByTestId('create-prop-ticker').fill(data.investmentTicker)
    await pageA.getByTestId('create-prop-name').fill(data.investmentSecurity)
    await pick(pageA, 'create-link-ISSUES-picker', data.investmentCompany)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.investmentSecurity)

    await pageA.getByTestId('new-node-type').selectOption('Valuation')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-title').fill(data.valuation)
    await pageA.getByTestId('create-prop-currentPrice').fill('100')
    await pick(pageA, 'create-link-HAS_VALUATION-picker', data.investmentCompany)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.valuation)

    await pageA.getByTestId('new-node-type').selectOption('Scenario')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-title').fill(data.scenario)
    await pageA.getByTestId('create-prop-kind').selectOption('BASE')
    await pick(pageA, 'create-link-HAS_SCENARIO-picker', data.valuation)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('create-prop-valuePerShare-error')).toBeVisible()
    await expect(pageA.getByTestId('detail-label')).not.toHaveText(data.scenario)
    await pageA.getByTestId('create-prop-valuePerShare').fill('120')
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.scenario)

    await pageA.getByTestId('new-node-type').selectOption('Decision')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-title').fill(data.decision)
    await pageA.getByTestId('create-prop-action').selectOption('BUY')
    await pick(pageA, 'create-link-HAS_DECISION-picker', data.investmentSecurity)
    await pick(pageA, 'create-link-BASED_ON-picker', data.valuation)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.decision)
    await expect(pageA.getByTestId('relationship-row').filter({ hasText: data.investmentSecurity })).toHaveAttribute('data-rel-type', 'HAS_DECISION')
    await expect(pageA.getByTestId('relationship-row').filter({ hasText: data.valuation })).toHaveAttribute('data-rel-type', 'BASED_ON')

    await pageA.getByTestId('graph-hops').selectOption('2')
    const companyNode = pageA.locator('[data-testid="graph-node"][data-node-type="Company"]').filter({ hasText: data.investmentCompany })
    await expect(companyNode).toHaveCount(1)
    await companyNode.getByRole('button').click()
    await pageA.getByTestId('graph-expand').click()
    await expect(pageA.locator('[data-testid="graph-node"][data-node-type="Change"]').filter({ hasText: data.change })).toHaveCount(1)
    await shot(pageA, '13a-investment-chain')
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
    await pageA.getByTestId('new-node-type').selectOption('Person')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-name').fill(personName)
    await pageA.getByTestId('create-prop-englishName').fill(englishName)
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(personName)

    await pageA.getByTestId('new-node-type').selectOption('Concept')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-name').fill(conceptName)
    await pageA.getByTestId('create-prop-summary').fill('투자 판단에서 손실 가능성을 줄이는 여유다.')
    await pageA.getByTestId('create-submit').click()
    await expect(pageA.getByTestId('detail-label')).toHaveText(conceptName)

    await pageA.getByTestId('new-node-type').selectOption('Document')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('create-prop-title').fill(bookTitle)
    await pageA.getByTestId('create-prop-url').fill(`https://example.com/book-${suffix}`)
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

  test('2c) A 가 왼쪽 「무엇을 만들까요?」 에서 주장을 만든다', async () => {
    await pageA.getByTestId('tab-workspace').click()
    await pageA.getByTestId('new-node-type').selectOption('Claim')
    await pageA.getByTestId('new-node-button').click()
    await pageA.getByTestId('claim-predicate-select').selectOption('BELONGS_TO_SECTOR')
    await pick(pageA, 'claim-subject-picker', data.company2)
    await pick(pageA, 'claim-object-picker', data.sector)
    await pick(pageA, 'claim-doc-picker', data.docTitle2)
    await pageA.getByTestId('claim-description').fill(`${data.company2} 는 ${data.sector} 에 속한다.`)
    await pageA.getByTestId('claim-evidence').fill(data.evidence2)
    await pageA.getByTestId('claim-add-submit').click()

    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-type', 'Claim')
    await expect(pageA.getByTestId('detail-label')).toHaveText(`${data.company2} → ${data.sector} 속한다`)
  })

  test('3) B 가 검토 대기 탭에서 Claim 을 검토 완료한다', async ({ browser }) => {
    // 작성자 A 에게는 그 주장이 「내가 쓰거나 고친 주장」 구역에만 있고, 링크를 복사할 수 있다.
    await pageA.getByTestId('tab-review').click()
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

    await pageB.getByTestId('tab-review').click()
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
    await pageA.getByTestId('graph-hops').selectOption('2')
    await expect(pageA).toHaveURL(/hops=2/)
    await pageA.goBack()
    await expect(pageA.getByTestId('detail-label')).toHaveText(data.supplier)
    await expect(pageA).not.toHaveURL(/hops=/)
    await shot(pageA, '04b-back-to-supplier')
  })

  test('5) 같은 노드를 동시에 고치면 나중 저장은 409 안내 뒤 최신 값을 보이고, 내 입력을 골라 다시 적용해 저장한다', async () => {
    await searchAndOpen(pageA, data.company)
    await searchAndOpen(pageB, data.company)
    const revisionBefore = Number(await pageB.getByTestId('node-revision').textContent())

    await pageA.getByTestId('edit-prop-description').fill(data.editByA)
    await pageA.getByTestId('node-save').click()
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageA.getByTestId('node-revision')).toHaveText(String(revisionBefore + 1))
    await shot(pageA, '05-saved-by-a')

    // B 는 아직 예전 revision 을 들고 있다.
    await expect(pageB.getByTestId('node-revision')).toHaveText(String(revisionBefore))
    await pageB.getByTestId('edit-prop-description').fill(data.editByB)
    await pageB.getByTestId('edit-prop-registrationNumber').fill(data.registrationByB)
    await pageB.getByTestId('node-save').click()

    const notice = pageB.getByTestId('detail-notice')
    await expect(notice).toHaveAttribute('data-kind', 'conflict')
    await expect(notice).toContainText('다른 탭이나 다른 사용자가 먼저 저장했습니다')
    await expect(notice).not.toContainText('서버 응답')
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
  })

  test('6) 보관하면 기본 검색에서 빠지고, 복원하면 이력에 ARCHIVE 와 RESTORE 가 남는다', async () => {
    await searchAndOpen(pageA, data.customer)
    await pageA.getByTestId('node-archive-reason').fill('e2e 보관 확인')
    await pageA.getByTestId('node-archive-button').click()
    await expect(pageA.getByTestId('detail-archived')).toBeVisible()

    // 기본 검색에서는 보이지 않는다.
    await pageA.getByTestId('search-input').fill(data.customer)
    await pageA.getByTestId('search-submit').click()
    await expect(pageA.getByTestId('search-empty')).toBeVisible()
    await expect(searchResult(pageA, data.customer)).toHaveCount(0)

    // 「보관 포함」 으로 찾아 복원한다.
    await searchAndOpen(pageA, data.customer, { includeArchived: true })
    await expect(pageA.getByTestId('detail-archived')).toBeVisible()
    await pageA.getByTestId('node-restore-button').click()
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageA.getByTestId('detail-archived')).toHaveCount(0)

    await pageA.getByTestId('node-history-link').click()
    await expect(pageA.getByTestId('changes-tab')).toBeVisible()
    await expect(pageA.locator('[data-testid="change-row"][data-action="ARCHIVE"]')).toHaveCount(1)
    await expect(pageA.locator('[data-testid="change-row"][data-action="RESTORE"]')).toHaveCount(1)
    await expect(pageA.locator('[data-testid="change-row"][data-action="ARCHIVE"] li').filter({ hasText: '보관: 아니오 → 예' })).toHaveCount(1)
    await shot(pageA, '06-archive-restore-history')
  })

  test('6c) 변경 이력에서 사용자를 표시 이름으로 고르고 주장 이력의 주체와 대상이 이름으로 보인다', async () => {
    await pageA.getByTestId('tab-changes').click()
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
    await pageA.getByTestId('node-history-link').click()
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

    await pageA.getByTestId('tab-changes').click()
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
    await pageA.getByTestId('node-archive-button').click()
    const notice = pageA.getByTestId('detail-notice')
    await expect(notice).toHaveAttribute('data-kind', 'error')
    await expect(notice).toContainText('그 주장을 먼저 보관하세요')
    await expect(notice).not.toContainText('근거를 더하거나')
    await shot(pageA, '06b-last-evidence')
    await notice.getByTestId('notice-action').click()
    await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-type', 'Claim')
    // 주장 상세에는 「이 항목에 걸린 주장」 절이 없고, 수정 폼은 「다시 검토」 안내를 쓴다. revision 은 「자세히」 안에 있다.
    await expect(pageA.getByTestId('node-claims-section')).toHaveCount(0)
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
    await expect(pageViewer.getByTestId('tab-users')).toHaveCount(0)
    await expect(pageViewer.getByTestId('new-node-button')).toHaveCount(0)

    await searchAndOpen(pageViewer, data.supplier)
    await expect(pageViewer.getByTestId('viewer-hint')).toBeVisible()
    for (const id of ['node-save', 'node-archive-button', 'node-restore-button', 'relationship-add-toggle', 'claim-add-toggle']) {
      await expect(pageViewer.getByTestId(id)).toHaveCount(0)
    }
    await expect(pageViewer.getByTestId('edit-prop-name')).toBeDisabled()

    await pageViewer.getByTestId('tab-review').click()
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

  test('8) 관리자가 열람자를 비활성화하면 열람자의 기존 세션이 끊긴다', async () => {
    await pageAdmin.getByTestId('tab-users').click()
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

    // 1. 기업: 「다음」 없이 연습 이름을 채운 폼이 열린다.
    await expect(bubble).toHaveAttribute('data-step', 'company')
    await expect(page.getByTestId('guide-next')).toHaveCount(0)
    const companyInput = page.getByTestId('create-prop-name')
    await expect(companyInput).toHaveValue(/^\[연습\] /)
    const practiceCompany = await companyInput.inputValue()
    await page.getByTestId('create-submit').click()

    // 2. 근거 문서: 제목이 채워진 폼이 열린다.
    await expect(bubble).toHaveAttribute('data-step', 'document')
    const titleInput = page.getByTestId('create-prop-title')
    await expect(titleInput).not.toHaveValue('')
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
    await pageAdmin.getByTestId('tab-ontology').click()
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
      await expect(pageA.getByTestId('new-node-type').locator('option', { hasText: '펀드' })).toHaveCount(1)

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

  test('9b) 관리자가 폼으로 인물에 속성을 더하면 편집자의 고치기 폼에 그 칸이 나오고, 되돌린다', async () => {
    const propKey = `nickname${suffix}`
    // 1. 관리자가 저장 전 버전 번호를 읽어 둔다.
    await pageAdmin.getByTestId('tab-ontology').click()
    const versionText = await pageAdmin.getByTestId('ontology-version').innerText()
    const before = Number(/\d+/.exec(versionText)?.[0])
    expect(before, '저장 전 온톨로지 버전').toBeGreaterThan(0)

    try {
      // 2. 폼에서 인물에 string 속성을 더하고 확인한 뒤 저장한다.
      await pageAdmin.getByTestId('ontology-edit-form').click()
      const person = pageAdmin.locator('[data-testid="ontology-form-type"][data-type="Person"]')
      await expect(person).toBeVisible()
      await person.getByTestId('ontology-form-prop-add').click()
      await person.getByTestId('ontology-form-new-key').fill(propKey)
      await person.getByTestId('ontology-form-new-label').fill('별명')
      await person.getByTestId('ontology-form-new-submit').click()
      await expect(person.locator(`[data-testid="ontology-form-prop"][data-prop="${propKey}"]`)).toBeVisible()
      await pageAdmin.getByTestId('ontology-preview').click()
      await expect(pageAdmin.getByTestId('ontology-diff-added')).toContainText(`nodeTypes.Person.properties.${propKey}`)
      await shotElement(pageAdmin.getByTestId('ontology-preview-panel'), '09b-ontology-form-preview')
      await pageAdmin.getByTestId('ontology-save').click()
      await expect(pageAdmin.getByTestId('ontology-message')).toHaveAttribute('data-kind', 'success')
      await shot(pageAdmin, '09b-ontology-form')

      // 3. 편집자 A 가 API 를 부르는 동작을 하면 안내가 나오고, 다시 읽으면 인물의 고치기 폼에 「별명」 칸이 있다.
      await pageA.getByTestId('tab-workspace').click()
      await pageA.getByTestId('search-input').fill(`Warren Buffett ${suffix}`)
      await pageA.getByTestId('search-submit').click()
      await expect(pageA.getByTestId('ontology-stale')).toBeVisible()
      await pageA.getByTestId('ontology-reload').click()
      await expect(pageA.getByTestId('ontology-stale')).toHaveCount(0)
      await searchResult(pageA, `워런 버핏-${suffix}`).click()
      await expect(pageA.getByTestId(`edit-prop-${propKey}`)).toBeVisible()
      await expect(pageA.getByTestId('node-edit-form')).toContainText('별명')

      // 4. 관리자가 관계 종류의 문장 틀에서 {to} 를 빼면 입력 아래와 미리보기에 오류가 보인다. 저장하지 않고 초안을 버린다.
      await pageAdmin.getByTestId('tab-ontology').click()
      await pageAdmin.getByTestId('ontology-edit-form').click()
      const issues = pageAdmin.locator('[data-testid="ontology-form-rel"][data-rel="ISSUES"]')
      await expect(issues).toBeVisible()
      await issues.getByTestId('ontology-form-rel-sentence').fill('{from} 테스트')
      await expect(issues.getByTestId('ontology-form-error')).toHaveText('문장 틀에 {from} 과 {to} 를 한 번씩 넣습니다')
      await pageAdmin.getByTestId('ontology-preview').click()
      await expect(pageAdmin.getByTestId('ontology-preview-error')).toContainText(['ISSUES 의 sentence 는 {from} 과 {to} 를 한 번씩 담아야 한다'])
      await expect(pageAdmin.getByTestId('ontology-save')).toHaveCount(0)
      await pageAdmin.getByTestId('ontology-draft-discard').click()
      await expect(pageAdmin.getByTestId('ontology-form')).toHaveCount(0)
    } finally {
      // 단계가 중간에 실패해도 속성이 남지 않게 저장 전 버전으로 되돌린다.
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

  test('9c) 관리자가 기존 데이터와 어긋나는 변경을 미리보면 영향과 확인란이 보이고, 저장하지 않고 초안을 버린다', async () => {
    const propKey = `required${suffix}`
    // 1. 관리자가 시작 전 버전 번호를 읽어 둔다. 9b 의 정리는 API 로 되돌려 화면이 예전 버전을 들고 있으므로 새로고침해 최신 버전을 읽는다.
    await pageAdmin.getByTestId('tab-ontology').click()
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

    // 4. 초안을 버리면 버전이 그대로다.
    await pageAdmin.getByTestId('ontology-draft-discard').click()
    await expect(pageAdmin.getByTestId('ontology-version')).toHaveText(`버전 ${before}`)
  })
})
