import { expect, test, type Page } from '@playwright/test'
import { admin, exact, loginAs, openScreen, shot } from './support'

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

/** 머리글 「＋ 추가」 에서 타입을 골라 만들기 창을 연다 */
async function openAddOnMobile(page: Page, type: string): Promise<void> {
  await page.getByTestId('add-open').click()
  await page.getByTestId(`add-type-${type}`).click()
  await expect(page.getByTestId('add-dialog')).toHaveAttribute('data-type', type)
}

/** 「＋ 추가」 창으로 노드를 만든다. 만들면 상세 탭으로 넘어간다 */
async function createNodeOnMobile(page: Page, type: string, label: string, props: Record<string, string>): Promise<void> {
  if ((await page.getByTestId('add-dialog').count()) === 0) await openAddOnMobile(page, type)
  for (const [name, value] of Object.entries(props)) {
    const input = page.getByTestId(`create-prop-${name}`)
    // 선택 속성은 「선택 항목 더 보기」 를 눌러야 보인다.
    if ((await input.count()) === 0) await page.getByTestId('create-optional-toggle').click()
    const tag = await input.evaluate((el) => el.tagName)
    if (tag === 'SELECT') await input.selectOption(value)
    else await input.fill(value)
  }
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('add-dialog')).toHaveCount(0)
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

  // 2. 작업 공간을 처음 열면 검색 탭이 열려 있고 그래프는 숨겨져 있다.
  await openScreen(page, 'workspace')
  await expect(page.getByTestId('workspace-tab-search')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('search-input')).toBeVisible()
  await expect(page.getByTestId('graph-canvas')).toBeHidden()

  // 2b. 「＋ 추가」 는 머리글의 탭 줄에 있고, 창은 화면 폭 안에 들어간다.
  const addBox = await page.getByTestId('add-open').boundingBox()
  const tabBox = await page.getByTestId('tab-workspace').boundingBox()
  expect(addBox, '「＋ 추가」 단추').not.toBeNull()
  expect(tabBox, '머리글 작업 공간 탭').not.toBeNull()
  const addCenter = addBox!.y + addBox!.height / 2
  expect(addCenter, '「＋ 추가」 가 탭과 같은 줄에 있다').toBeGreaterThanOrEqual(tabBox!.y)
  expect(addCenter, '「＋ 추가」 가 탭과 같은 줄에 있다').toBeLessThanOrEqual(tabBox!.y + tabBox!.height)
  await openAddOnMobile(page, 'Company')
  const dialogBox = await page.getByTestId('add-dialog').boundingBox()
  expect(dialogBox, '만들기 창').not.toBeNull()
  expect(dialogBox!.x, '창의 왼쪽 끝').toBeGreaterThanOrEqual(0)
  expect(dialogBox!.x + dialogBox!.width, '창의 오른쪽 끝').toBeLessThanOrEqual(page.viewportSize()!.width)
  await expectNoHorizontalOverflow(page)
  await shot(page, 'add-dialog-mobile')

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
  const companyId = (await page.getByTestId('detail-panel').getAttribute('data-node-id')) ?? ''
  expect(companyId).not.toBe('')
  // 상세의 버튼 줄(편집, 그래프 중심으로, ⋯)은 가로 스크롤 없이 화면 폭 안에 보인다.
  await expect(page.getByTestId('node-more')).toBeVisible()
  const actionsBox = await page.getByTestId('node-actions').boundingBox()
  expect(actionsBox, '상세 버튼 줄').not.toBeNull()
  expect(actionsBox!.x, '버튼 줄의 왼쪽 끝').toBeGreaterThanOrEqual(0)
  expect(actionsBox!.x + actionsBox!.width, '버튼 줄의 오른쪽 끝').toBeLessThanOrEqual(page.viewportSize()!.width)
  await expectNoHorizontalOverflow(page)

  // 6a. 뒤로가기는 앞 화면으로 돌아간다. 기록은 「그래프 탭(앞 노드) → 노드 고르기 → 상세 보기」 다.
  const graphCanvas = page.getByTestId('graph-canvas')
  await page.goBack()
  await expect(page.getByTestId('workspace-tab-graph')).toHaveAttribute('aria-selected', 'true')
  await expect(bar).toContainText(company)
  await expect(graphCanvas).toHaveAttribute('data-layout-pending', 'false')
  await shot(page, 'mobile-back-1')
  await page.goBack()
  await expect(page.getByTestId('workspace-tab-graph')).toHaveAttribute('aria-selected', 'true')
  await expect(bar).toContainText(security)
  await expect(graphCanvas).toHaveAttribute('data-layout-pending', 'false')
  await shot(page, 'mobile-back-2')
  await page.goForward()
  await page.goForward()
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-label')).toHaveText(exact(company))

  // 6b. 검색 결과에 구분 정보가 보이고 줄바꿈되어 가로로 넘치지 않는다.
  await page.getByTestId('workspace-tab-search').click()
  await page.getByTestId('search-input').fill(company)
  await page.getByTestId('search-submit').click()
  // 검색이 끝나 이 기업 하나만 남은 뒤에 본다. 이전 목록이 남은 채로 확인하지 않게 한다.
  await expect(page.getByTestId('search-result')).toHaveCount(1)
  await expect(page.getByTestId('search-result').first().getByTestId('search-result-hint')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'mobile-search-hint')

  // 7. 표가 있는 목록 탭에서도 페이지가 가로로 넘치지 않는다.
  await page.getByTestId('tab-list').click()
  await expect(page.getByTestId('list-row').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // 8. 좁은 화면의 모습을 남긴다.
  await shot(page, 'mobile-workspace')

  // 9. 옛 링크로 열면 첫 탭이 상세이고, 주소가 새 형식으로 바뀐다.
  await page.goto(`/?node=${encodeURIComponent(companyId)}`)
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-label')).toHaveText(exact(company))
  await expect(page).toHaveURL(new RegExp('/workspace\\?node=' + companyId))
})

test('휴대폰 폭에서 온톨로지 폼 편집기가 가로 스크롤 없이 열린다', async ({ page }) => {
  await loginAs(page, admin)
  await openScreen(page, 'ontology')
  await page.getByTestId('ontology-edit-form').click()
  await expect(page.getByTestId('ontology-form')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'm-ontology-form')
})

test('휴대폰 폭에서 사용법 따라하기가 아래쪽 카드로 열리고 만들기 창을 가리지 않는다', async ({ page }) => {
  await loginAs(page, admin)
  await openScreen(page, 'workspace')
  // 관리자의 따라하기는 주장의 대상으로 고를 산업이 있어야 열린다.
  const sector = `모바일산업-${suffix}`
  await createNodeOnMobile(page, 'Sector', sector, { name: sector })
  // 기업 단계는 「＋ 추가」 가 어느 화면에나 있어 상세 탭에서 시작해도 탭을 옮기지 않는다.
  await page.getByTestId('workspace-tab-detail').click()
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')

  await page.getByTestId('guide-open').click()
  const bubble = page.getByTestId('guide-bubble')
  await expect(bubble).toHaveAttribute('data-step', 'intro')
  await expect(bubble).toHaveAttribute('data-placement', 'card')
  await page.getByTestId('guide-start').click()

  await expect(bubble).toHaveAttribute('data-step', 'company')
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('add-open')).toHaveClass(/(^|\s)guide-target(\s|$)/)
  await openAddOnMobile(page, 'Company')
  await expect(page.getByTestId('create-form')).toBeVisible()
  await expect(page.getByTestId('create-prop-name')).toHaveValue(/^\[연습\] /)
  // 말풍선은 창 위에 보이고 창의 만들기 단추를 가리킨다.
  await expect(bubble).toBeVisible()
  await expect(bubble).toHaveAttribute('data-placement', 'card')
  await expect(page.getByTestId('create-submit')).toHaveClass(/(^|\s)guide-target(\s|$)/)

  // 창이 위쪽에 붙어 만들기 단추가 아래쪽 카드에 가리지 않는다.
  const submit = page.getByTestId('create-submit')
  await submit.scrollIntoViewIfNeeded()
  await expect
    .poll(
      async () => {
        const [a, b] = await Promise.all([submit.boundingBox(), bubble.boundingBox()])
        if (!a || !b) return true
        return a.y < b.y + b.height && b.y < a.y + a.height && a.x < b.x + b.width && b.x < a.x + a.width
      },
      { message: '만들기 단추가 가이드 카드에 가린다' },
    )
    .toBe(false)
  await expectNoHorizontalOverflow(page)
  await shot(page, 'm-guide')

  // 창이 열린 채로 말풍선의 「그만두기」 를 눌러도 창 밖 누르기로 보지 않는다.
  await page.getByTestId('guide-stop').click()
  await expect(bubble).toHaveCount(0)
  await expect(page.getByTestId('add-dialog')).toBeVisible()
})

test('휴대폰 폭에서 개념 지도와 머리글이 한 줄에 들어간다', async ({ page }) => {
  await loginAs(page, admin, 'success', '/map')
  await expect(page.getByTestId('concept-map-canvas')).toHaveAttribute('data-layout-done', 'true')
  // 둘째 줄의 탭 셋과 「더보기」 가 줄바꿈 없이 한 줄에 놓인다.
  const ys = await Promise.all(
    ['tab-map', 'tab-workspace', 'tab-list', 'more-open'].map(async (id) => (await page.getByTestId(id).boundingBox())?.y ?? Number.NaN),
  )
  expect(new Set(ys).size, `머리글 둘째 줄의 y 좌표 ${ys.join(', ')}`).toBe(1)
  await expectNoHorizontalOverflow(page)

  await page.getByTestId('map-type').first().click()
  await expect(page.getByTestId('map-type-panel')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'map-mobile')
})
