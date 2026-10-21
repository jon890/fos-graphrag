import { expect, test, type Page } from '@playwright/test'
import { admin, exact, loginAs, shot } from './support'

// 휴대폰 폭(390px)에서 작업 공간이 검색, 그래프, 상세 탭으로 나뉘어 동작하는지 확인한다.
// 노드는 그래프 탭이 숨겨진 동안 만들어지므로, 그래프 탭을 열 때 미뤄 둔 배치가 도는지도 함께 본다.

const suffix = String(Date.now())
const company = `모바일기업-${suffix}`
const security = `모바일종목-${suffix}`

/** 페이지와 본문 영역 모두 가로로 넘치지 않는다 */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
      message: '문서 폭(scrollWidth)이 창 폭(innerWidth)을 넘는다',
    })
    .toBeLessThanOrEqual(0)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const main = document.querySelector('.app-main')
          return main ? main.scrollWidth - main.clientWidth : Number.NaN
        }),
      { message: '.app-main 의 scrollWidth 가 clientWidth 를 넘는다' },
    )
    .toBeLessThanOrEqual(0)
}

/** 검색 탭의 「새 노드 만들기」 폼으로 노드를 만든다. 만들면 상세 탭으로 넘어간다 */
async function createNodeOnMobile(page: Page, type: string, label: string, props: Record<string, string>): Promise<void> {
  await page.getByTestId('workspace-tab-search').click()
  await page.getByTestId('new-node-type').selectOption(type)
  await page.getByTestId('new-node-button').click()
  for (const [name, value] of Object.entries(props)) {
    const input = page.getByTestId(`create-prop-${name}`)
    const tag = await input.evaluate((el) => el.tagName)
    if (tag === 'SELECT') await input.selectOption(value)
    else await input.fill(value)
  }
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-label')).toBeVisible()
  await expect(page.getByTestId('detail-label')).toHaveText(label)
}

test('휴대폰 폭에서 노드를 만들고 그래프에서 골라 상세를 연다', async ({ page }) => {
  // 1. 로그인 뒤 가로 스크롤이 없고, 머리글의 탭이 누를 만한 폭으로 보인다.
  await loginAs(page, admin)
  await expectNoHorizontalOverflow(page)
  const workspaceTabBox = await page.getByTestId('tab-workspace').boundingBox()
  expect(workspaceTabBox?.width ?? 0, '머리글 작업 공간 탭의 폭').toBeGreaterThanOrEqual(60)

  // 2. 처음에는 검색 탭이 열려 있고 그래프는 숨겨져 있다.
  await expect(page.getByTestId('workspace-tab-search')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('search-input')).toBeVisible()
  await expect(page.getByTestId('graph-canvas')).toBeHidden()

  // 3. 노드를 만들면 상세 탭으로 넘어간다. 그래프에 두 노드가 함께 오르도록 종목을 만들고 기업과 ISSUES 로 잇는다.
  await createNodeOnMobile(page, 'Company', company, { name: company })
  await createNodeOnMobile(page, 'Security', security, {
    market: 'KRX_KOSPI',
    ticker: `M${suffix.slice(-10)}`,
    name: security,
    securityType: 'COMMON',
    currency: 'KRW',
  })
  await page.getByTestId('relationship-add-toggle').click()
  await page.getByTestId('relationship-type-select').selectOption('ISSUES:in')
  await page.getByTestId('relationship-target-picker-input').fill(company)
  await page.getByTestId('relationship-target-picker-search').click()
  await page.getByTestId('relationship-target-picker-result').filter({ hasText: company }).first().click()
  await page.getByTestId('relationship-add-submit').click()
  await expect(page.getByTestId('relationship-row').filter({ hasText: company })).toBeVisible()

  // 4. 그래프 탭이 숨겨진 동안 요소가 생겼으므로 배치가 미뤄져 있다. 탭을 열면 배치가 돈다.
  await expect(page.getByTestId('graph-status')).toHaveText(/항목 2 · 관계 1/)
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('data-layout-pending', 'true')
  await page.getByTestId('workspace-tab-graph').click()
  await expect(page.getByTestId('graph-canvas')).toBeVisible()
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('data-layout-pending', 'false')
  await shot(page, 'mobile-graph')

  // 5. 선택되지 않은 기업을 그래프 목록에서 고르면 그래프 탭에 머물고 막대가 그 이름으로 바뀐다.
  const bar = page.getByTestId('graph-selection-bar')
  await expect(bar).toContainText(security)
  await page.getByTestId('graph-node').filter({ hasText: company }).getByRole('button').click()
  await expect(page.getByTestId('workspace-tab-graph')).toHaveAttribute('aria-selected', 'true')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText(company)

  // 6. 막대의 단추를 누르면 상세 탭에서 그 기업을 보여 준다.
  await page.getByTestId('graph-selection-open').click()
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-label')).toBeVisible()
  await expect(page.getByTestId('detail-label')).toHaveText(exact(company))

  // 7. 표가 있는 목록 탭에서도 페이지가 가로로 넘치지 않는다.
  await page.getByTestId('tab-list').click()
  await expect(page.getByTestId('list-row').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // 8. 좁은 화면의 모습을 남긴다.
  await shot(page, 'mobile-workspace')
})
