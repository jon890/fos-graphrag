import path from 'node:path'
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'

// 두 편집자(A, B)와 관리자, 열람자가 같은 서버에서 협업하는 흐름을 순서대로 확인한다.
// 로그인은 실제 Google 대신 가짜 OIDC 서버(navikt/mock-oauth2-server, interactiveLogin)를 거친다.
// 데이터 이름과 이메일에 실행마다 다른 접미사를 붙여, 이전 실행이 남긴 데이터와 겹치지 않게 한다.

const suffix = String(Date.now())
const data = {
  supplier: `가상부품-${suffix}`,
  customer: `가상전자-${suffix}`,
  security: `가상전자 보통주-${suffix}`,
  ticker: `T${suffix.slice(-10)}`,
  docTitle: `가상부품 사업보고서-${suffix}`,
  docUrl: `https://example.com/financial-workbench/${suffix}`,
  description: `가상부품-${suffix} 이 가상전자-${suffix} 에 메모리 기판을 공급한다.`,
  evidence: `당사의 주요 매출처는 가상전자-${suffix} 이다.`,
  reviewNote: '공시 원문과 대조함',
  editByA: `A 가 고친 메모 ${suffix}`,
  editByB: `B 가 고친 메모 ${suffix}`,
}

interface TestUser {
  sub: string
  email: string
  name: string
  emailVerified?: boolean
}

const admin: TestUser = {
  sub: process.env.E2E_ADMIN_SUB ?? 'admin-sub',
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com',
  name: process.env.E2E_ADMIN_NAME ?? '관리자',
}
const editorA: TestUser = { sub: `editor-a-${suffix}`, email: `editor-a-${suffix}@example.com`, name: '편집자A' }
const editorB: TestUser = { sub: `editor-b-${suffix}`, email: `editor-b-${suffix}@example.com`, name: '편집자B' }
const viewer: TestUser = { sub: `viewer-${suffix}`, email: `viewer-${suffix}@example.com`, name: '열람자' }
const stranger: TestUser = { sub: `stranger-${suffix}`, email: `stranger-${suffix}@example.com`, name: '외부인' }

const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? 'test-results/screenshots'

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true })
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exact(text: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`)
}

/**
 * 앱의 「Google 로 로그인」 을 눌러 가짜 OIDC 서버의 로그인 폼을 채운다.
 * expect 가 success 면 앱에 로그인된 것을, denied 면 「접근 권한이 없습니다」 화면을 확인한다.
 */
async function loginAs(page: Page, user: TestUser, expectResult: 'success' | 'denied' = 'success'): Promise<void> {
  await page.goto('/')
  await page.getByTestId('login-google').click()
  // 가짜 서버(http://localhost:8090/default/authorize?...)의 interactiveLogin 폼이다.
  await page.waitForURL(/\/authorize/)
  await page.locator('input[name=username]').fill(user.sub)
  await page
    .locator('textarea[name=claims]')
    .fill(JSON.stringify({ email: user.email, email_verified: user.emailVerified ?? true, name: user.name }))
  await page.locator('input[type=submit]').click()

  if (expectResult === 'denied') {
    await expect(page.getByTestId('login-denied')).toBeVisible()
    await expect(page.getByTestId('login-google')).toBeVisible()
    return
  }
  await expect(page.getByTestId('current-user-name')).toHaveText(user.name)
  // 온톨로지를 받아야 작업 공간이 그려진다.
  await expect(page.getByTestId('search-input')).toBeVisible()
}

async function newPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  // 가짜 OIDC 서버의 세션 쿠키가 섞이지 않게 사용자마다 새 context 를 쓴다.
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

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
  await searchResult(page, label).click()
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
    await shot(pageAdmin, '00-users-admin')
  })

  test('0b) 목록에 없는 이메일과 확인되지 않은 이메일은 로그인을 거절한다', async ({ browser }) => {
    const strangerPage = await open(browser)
    await loginAs(strangerPage, stranger, 'denied')

    const unverifiedPage = await open(browser)
    await loginAs(unverifiedPage, { ...editorA, sub: `unverified-${suffix}`, emailVerified: false }, 'denied')
    await shot(unverifiedPage, '00b-denied')
  })

  test('1) A 가 기업 두 개와 종목을 만들고 ISSUES 관계를 잇는다', async ({ browser }) => {
    pageA = await open(browser)
    await loginAs(pageA, editorA)
    await expect(pageA.getByTestId('current-user-role')).toHaveAttribute('data-role', 'EDITOR')
    await expect(pageA.getByTestId('tab-users')).toHaveCount(0)

    await createNode(pageA, 'Company', data.supplier, { name: data.supplier, country: 'KR' })
    await createNode(pageA, 'Company', data.customer, { name: data.customer, country: 'KR' })
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
    await pick(pageA, 'relationship-target-picker', data.customer)
    await expect(pageA.getByTestId('relationship-target-selected')).toContainText(data.customer)
    await pageA.getByTestId('relationship-add-submit').click()

    const row = pageA.getByTestId('relationship-row').filter({ hasText: data.customer })
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-rel-type', 'ISSUES')
    await expect(pageA.locator('[data-testid="graph-node"]').filter({ hasText: data.customer })).toHaveCount(1)
    await shot(pageA, '01-issues')
  })

  test('2) A 가 문서를 등록하고 SUPPLIES_TO Claim 을 만든다', async () => {
    await createNode(pageA, 'Document', data.docTitle, {
      title: data.docTitle,
      url: data.docUrl,
      publisher: '가상부품',
      documentType: 'FILING',
      publishedAt: '2026-03-15',
      collectedAt: '2026-10-20T12:00',
    })

    await searchAndOpen(pageA, data.supplier)
    await pageA.getByTestId('claim-add-toggle').click()
    await pageA.getByTestId('claim-predicate-select').selectOption('SUPPLIES_TO')
    await pick(pageA, 'claim-object-picker', data.customer)
    await expect(pageA.getByTestId('claim-object-selected')).toContainText(data.customer)
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
    await shot(pageA, '02-claim-created')
  })

  test('3) B 가 검토 대기 탭에서 Claim 을 검토 완료한다', async ({ browser }) => {
    pageB = await open(browser)
    await loginAs(pageB, editorB)

    await pageB.getByTestId('tab-review').click()
    await expect(pageB.getByTestId('review-table')).toBeVisible()
    const row = pageB.getByTestId('review-row').filter({ hasText: data.supplier })
    // 검토 대기 목록은 오래된 것부터라 새 Claim 이 뒤쪽 페이지에 있을 수 있다.
    for (let i = 0; i < 50 && (await row.count()) === 0; i += 1) {
      const next = pageB.getByTestId('review-pager-next')
      if (await next.isDisabled()) break
      await next.click()
      await pageB.waitForTimeout(300)
    }
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(data.customer)
    await row.getByTestId('review-row-note').fill(data.reviewNote)
    await row.getByTestId('review-row-approve').click()

    await expect(pageB.getByTestId('review-message')).toBeVisible()
    await expect(row).toHaveCount(0)
    await shot(pageB, '03-reviewed-by-b')
  })

  test('4) A 가 공급사 주변 그래프와 근거, 검토자를 확인한다', async () => {
    await searchAndOpen(pageA, data.supplier)

    const claimNode = pageA.locator('[data-testid="graph-node"][data-node-type="Claim"][data-review-status="REVIEWED"]')
    await expect(claimNode.first()).toBeAttached()

    const card = pageA.getByTestId('node-claims-section').getByTestId('claim-card').filter({ hasText: data.evidence })
    await expect(card).toHaveAttribute('data-review-status', 'REVIEWED')
    await expect(card.getByTestId('claim-evidence-text')).toHaveText(data.evidence)
    await expect(card.getByTestId('claim-document-title')).toHaveText(data.docTitle)
    await expect(card.getByTestId('claim-reviewer')).toHaveText(editorB.name)
    await expect(card.getByTestId('claim-review-note')).toContainText(data.reviewNote)
    await shot(pageA, '04-graph-and-evidence')

    // 고객사와 문서는 Claim 너머(2홉)에 있다. Claim 을 골라 이웃 확장하면 그래프에 합쳐진다.
    const claimId = await card.getAttribute('data-claim-id')
    await pageA.locator(`[data-testid="graph-node"][data-node-id="${claimId}"] button`).click()
    await expect(pageA.getByTestId('detail-panel')).toHaveAttribute('data-node-id', claimId!)
    await pageA.getByTestId('graph-expand').click()
    await expect(pageA.locator('[data-testid="graph-node"]').filter({ hasText: data.customer })).toHaveCount(1)
    await expect(pageA.locator('[data-testid="graph-node"]').filter({ hasText: data.docTitle })).toHaveCount(1)
    await expect(pageA.locator('[data-testid="graph-node"]').filter({ hasText: data.supplier })).toHaveCount(1)
    await shot(pageA, '04-expanded')
  })

  test('5) 같은 노드를 동시에 고치면 나중 저장은 409 안내 뒤 최신 값으로 바뀐다', async () => {
    await searchAndOpen(pageA, data.customer)
    await searchAndOpen(pageB, data.customer)
    const revisionBefore = Number(await pageB.getByTestId('node-revision').textContent())

    await pageA.getByTestId('edit-prop-description').fill(data.editByA)
    await pageA.getByTestId('node-save').click()
    await expect(pageA.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
    await expect(pageA.getByTestId('node-revision')).toHaveText(String(revisionBefore + 1))
    await shot(pageA, '05-saved-by-a')

    // B 는 아직 예전 revision 을 들고 있다.
    await expect(pageB.getByTestId('node-revision')).toHaveText(String(revisionBefore))
    await pageB.getByTestId('edit-prop-description').fill(data.editByB)
    await pageB.getByTestId('node-save').click()

    const notice = pageB.getByTestId('detail-notice')
    await expect(notice).toHaveAttribute('data-kind', 'conflict')
    await expect(notice).toContainText('다른 사용자가 먼저 수정했습니다')
    await expect(pageB.getByTestId('edit-prop-description')).toHaveValue(data.editByA)
    await expect(pageB.getByTestId('node-revision')).toHaveText(String(revisionBefore + 1))
    await shot(pageB, '05-conflict-b')
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
    await shot(pageA, '06-archive-restore-history')
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
})
