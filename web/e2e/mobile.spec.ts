import { exact, openScreen, openTokensAdvanced, OAUTH_CALLBACK } from './support'
import { expect, shot, test, type MockApi } from './mock/test'
import type { Page } from '@playwright/test'

// 휴대폰 폭(390px)에서 작업 공간이 검색, 그래프, 상세 탭으로 나뉘어 동작하는지 확인한다.
// 노드는 그래프 탭이 숨겨진 동안 만들어지므로, 그래프 탭을 열 때 미뤄 둔 배치가 도는지도 함께 본다.
// 응답은 가짜 API 의 스냅샷이다. 쓰기는 화면이 보낸 요청을 확인하고, 쓴 뒤의 응답은 테스트가 덮어쓴다.

test.use({ role: 'ADMIN' })

test.beforeEach(({ api }) => {
  // 작업 공간의 검색 칸은 검색어 없이 첫 쪽을 부른다. 서버의 이 응답은 초기 데이터가 섞여 스냅샷으로 남기지 않고 검색 결과로 대신한다.
  api.on('GET', '/api/nodes?page=0&size=20', { body: api.fixture('nodes-search') })
})

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
          // 머리글과 본문 영역이 없는 화면(앱 연결 동의)은 문서 폭만 본다.
          return main ? main.scrollWidth - main.clientWidth : 0
        }),
      { message: '.app-main 의 scrollWidth 가 clientWidth 를 넘는다' },
    )
    .toBeLessThanOrEqual(0)
}

/** 로그인된 첫 화면(개념 지도)을 연다 */
async function openApp(page: Page, startPath = '/'): Promise<void> {
  await page.goto(startPath)
  await expect(page.getByTestId('current-user-name')).toBeVisible()
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

/** 검색 결과 한 쪽. 스냅샷의 노드 목록 응답과 같은 모양이다 */
function pageOf<T>(items: T[]): { items: T[]; page: number; size: number; totalItems: number; totalPages: number } {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 }
}

/** 상세가 부르는 내 이해 표시를 「표시 없음」 으로 준다. 스냅샷은 기업 하나의 것이라 id 만 바꾼다 */
function noMark(api: MockApi, nodeId: string): void {
  api.on('GET', `/api/me/knowledge/${nodeId}`, { body: { ...api.fixture<Record<string, unknown>>('knowledge-mark-none'), nodeId } })
}

/** 상세 응답에서 노드 하나(NodeView)를 꺼낸다. 만들기 응답으로 쓴다 */
function nodeView(api: MockApi, fixture: string): Record<string, unknown> {
  return api.fixture(fixture).node
}

test('휴대폰 폭에서 노드를 만들고 그래프에서 골라 상세를 연다', async ({ page, api }) => {
  const company = nodeView(api, 'node-company') as { id: string; label: string; properties: Record<string, string> }
  const security = nodeView(api, 'node-security') as { id: string; label: string; properties: Record<string, string> }
  const companyGraph = api.fixture('graph-company')
  const issues = companyGraph.edges.find((e: { type: string }) => e.type === 'ISSUES')
  const securityDetail = api.fixture('node-security')
  const companyItem = api.fixture('nodes-search').items.find((n: { id: string }) => n.id === company.id)

  // 만들기 폼은 저장 전에 같은 이름을 찾는다. 아직 만들기 전이라 비어 있다.
  api.on('GET', `/api/nodes?q=${encodeURIComponent(company.label)}&types=Company&size=100`, { body: pageOf([]) })
  api.on('GET', `/api/nodes?q=${encodeURIComponent(security.label)}&types=Security&size=100`, { body: pageOf([]) })
  // 관계의 대상 고르기는 만든 기업을 찾는다.
  api.on('GET', `/api/nodes?q=${encodeURIComponent(company.label)}&types=Company&size=10`, { body: pageOf([companyItem]) })
  noMark(api, security.id)

  // 만들기는 타입에 맞는 스냅샷 노드를 돌려준다.
  api.on('POST', '/api/nodes', (req) => {
    const type = (req.body as { type: string }).type
    if (type === 'Company') return { status: 201, body: company }
    if (type === 'Security') return { status: 201, body: security }
    return { status: 400, body: { code: 'VALIDATION_FAILED', message: `테스트가 준비하지 않은 타입 ${type}` } }
  })
  // 종목은 관계를 잇기 전까지 관계가 없고, 그래프에도 자기 하나뿐이다.
  let linked = false
  api.on('GET', `/api/nodes/${security.id}`, () => ({
    body: linked ? securityDetail : { ...securityDetail, relationships: [], claims: [] },
  }))
  api.on('GET', `/api/graph/neighborhood?id=${security.id}&hops=1`, () => {
    const ids = linked ? [security.id, company.id] : [security.id]
    return {
      body: {
        ...companyGraph,
        centerId: security.id,
        nodes: ids.map((id) => companyGraph.nodes.find((n: { id: string }) => n.id === id)),
        edges: linked ? [issues] : [],
      },
    }
  })
  api.on('POST', '/api/relationships', () => {
    linked = true
    return { status: 201, body: securityDetail.relationships.find((r: { type: string }) => r.type === 'ISSUES') }
  })

  // 1. 첫 화면에 가로 스크롤이 없고, 머리글의 탭이 누를 만한 폭으로 보인다.
  await openApp(page)
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
  // 창은 나타나고 「＋ 추가」 메뉴는 사라지는 애니메이션이 끝난 뒤에 찍는다
  await expect(page.getByTestId('add-type-Company')).toHaveCount(0)
  await expect(page.getByTestId('add-dialog')).toHaveCSS('opacity', '1')
  await shot(page, 'add-dialog-mobile')

  // 3. 노드를 만들면 상세 탭으로 넘어간다. 그래프에 두 노드가 함께 오르도록 종목을 만들고 기업과 ISSUES 로 잇는다.
  await createNodeOnMobile(page, 'Company', company.label, { name: company.properties.name })
  expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Company', properties: { name: company.properties.name } })
  const securityProps = {
    market: security.properties.market,
    ticker: security.properties.ticker,
    name: security.properties.name,
    securityType: security.properties.securityType,
    currency: security.properties.currency,
  }
  await createNodeOnMobile(page, 'Security', security.label, securityProps)
  expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Security', properties: securityProps })
  await page.getByTestId('relationship-add-toggle').click()
  await page.getByTestId('relationship-type-select').selectOption('ISSUES:in')
  await page.getByTestId('relationship-target-picker-input').fill(company.label)
  await page.getByTestId('relationship-target-picker-search').click()
  await page.getByTestId('relationship-target-picker-result').filter({ hasText: company.label }).first().click()
  await page.getByTestId('relationship-add-submit').click()
  await expect(page.locator('[data-testid="relationship-row"][data-rel-type="ISSUES"]').filter({ hasText: company.label })).toBeVisible()
  expect(api.lastRequest('POST', '/api/relationships').body).toEqual({ type: 'ISSUES', fromId: company.id, toId: security.id })

  // 4. 그래프 탭이 숨겨진 동안 요소가 생겼으므로 배치가 미뤄져 있다. 탭을 열면 배치가 돈다.
  await expect(page.getByTestId('graph-status')).toHaveText(/항목 2 · 관계 1/)
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('data-layout-pending', 'true')
  await page.getByTestId('workspace-tab-graph').click()
  await expect(page.getByTestId('graph-canvas')).toBeVisible()
  await expect(page.getByTestId('graph-canvas')).toHaveAttribute('data-layout-pending', 'false')
  await shot(page, 'mobile-graph')

  // 5. 선택되지 않은 기업을 그래프 목록에서 고르면 그래프 탭에 머물고 막대가 그 이름으로 바뀐다.
  const bar = page.getByTestId('graph-selection-bar')
  await expect(bar).toContainText(security.label)
  await page.locator(`[data-testid="graph-node"][data-node-id="${company.id}"]`).getByRole('button').click()
  await expect(page.getByTestId('workspace-tab-graph')).toHaveAttribute('aria-selected', 'true')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText(company.label)

  // 6. 막대의 단추를 누르면 상세 탭에서 그 기업을 보여 준다.
  await page.getByTestId('graph-selection-open').click()
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-label')).toBeVisible()
  await expect(page.getByTestId('detail-label')).toHaveText(exact(company.label))
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', company.id)
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
  await expect(bar).toContainText(company.label)
  await expect(graphCanvas).toHaveAttribute('data-layout-pending', 'false')
  await shot(page, 'mobile-back-1')
  await page.goBack()
  await expect(page.getByTestId('workspace-tab-graph')).toHaveAttribute('aria-selected', 'true')
  await expect(bar).toContainText(security.label)
  await expect(graphCanvas).toHaveAttribute('data-layout-pending', 'false')
  await shot(page, 'mobile-back-2')
  await page.goForward()
  await page.goForward()
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-label')).toHaveText(exact(company.label))

  // 6b. 검색 결과에 구분 정보가 보이고 줄바꿈되어 가로로 넘치지 않는다.
  await page.getByTestId('workspace-tab-search').click()
  await page.getByTestId('search-input').fill(company.label)
  await page.getByTestId('search-submit').click()
  // 검색이 끝나 스냅샷의 결과가 모두 보인 뒤에 본다. 이전 목록이 남은 채로 확인하지 않게 한다.
  await expect(page.getByTestId('search-result')).toHaveCount(api.fixture('nodes-search').items.length)
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
  await page.goto(`/?node=${encodeURIComponent(company.id)}`)
  await expect(page.getByTestId('workspace-tab-detail')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-label')).toHaveText(exact(company.label))
  await expect(page).toHaveURL(new RegExp('/workspace\\?node=' + company.id))
})

test('휴대폰 폭에서 온톨로지 YAML 편집기가 가로 스크롤 없이 열리고 결과 칸이 편집칸 아래에 놓인다', async ({ page, api }) => {
  api.on('POST', '/api/ontology/preview', { body: api.fixture('ontology-preview-add-property') })
  await openApp(page)
  await openScreen(page, 'ontology')
  await page.getByTestId('ontology-edit-yaml').click()
  await expect(page.getByTestId('ontology-yaml-editor')).toBeVisible()
  await expect(page.getByTestId('ontology-yaml-input')).toHaveValue(api.fixture('ontology-version').yaml)
  await expectNoHorizontalOverflow(page)
  await page.getByTestId('ontology-preview').click()
  await expect(page.getByTestId('ontology-preview-side')).toHaveAttribute('data-layout', 'below')
  await expectNoHorizontalOverflow(page)
  await shot(page, 'm-ontology-yaml')
})

test('휴대폰 폭에서 연동 화면의 설치 안내가 가로 스크롤 없이 보인다', async ({ page }) => {
  await openApp(page)
  await openScreen(page, 'tokens')
  await expect(page.getByTestId('integrations-install')).toBeVisible()
  await expect(page.getByTestId('install-command').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'm-integrations')
})

test('휴대폰 폭에서 사용법 따라하기가 아래쪽 카드로 열리고 만들기 창을 가리지 않는다', async ({ page, api }) => {
  // 그만두면 끝낸 기록을 보낸다. 서버는 이미 기록된 사용자를 그대로 돌려준다.
  api.on('POST', '/api/auth/me/guide-done', { body: api.fixture('auth-me-admin') })
  await openApp(page)
  await openScreen(page, 'workspace')
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
  api.lastRequest('POST', '/api/auth/me/guide-done')
})

test('휴대폰 폭에서 개념 지도와 머리글이 한 줄에 들어간다', async ({ page }) => {
  await openApp(page, '/map')
  await expect(page.getByTestId('concept-map-canvas')).toHaveAttribute('data-layout-done', 'true')
  // 둘째 줄의 상단 탭과 「더보기」 가 줄바꿈 없이 한 줄에 놓인다.
  const ys = await Promise.all(
    ['tab-map', 'tab-workspace', 'tab-list', 'tab-study', 'more-open'].map(async (id) => (await page.getByTestId(id).boundingBox())?.y ?? Number.NaN),
  )
  expect(new Set(ys).size, `머리글 둘째 줄의 y 좌표 ${ys.join(', ')}`).toBe(1)
  await expectNoHorizontalOverflow(page)

  // 타입 칸이 부르는 최근 항목은 기업의 것만 스냅샷에 있다.
  await page.locator('[data-testid="map-type"][data-type="Company"]').click()
  await expect(page.getByTestId('map-type-panel')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'map-mobile')
})

test('휴대폰 폭에서 근거 따라가기와 공부 탭이 가로 스크롤 없이 열린다', async ({ page, api }) => {
  const decision = nodeView(api, 'node-decision') as { id: string; label: string }
  const search = api.fixture('nodes-search')
  // 공부 탭 스냅샷에 있는 항목을 근거 따라가기에서 「잘 모르겠어요」 로 표시한다.
  const study = api.fixture('knowledge-study')
  const stepId: string = study.items[0].node.id
  const mark = api.fixture('knowledge-mark')
  const trace = api.fixture('node-decision-trace')
  // 그 단계는 아직 표시하지 않은 상태로 시작한다. 표시를 쓴 뒤에는 스냅샷 그대로다.
  let marked = false
  api.on('GET', `/api/nodes/${decision.id}/trace`, () => ({
    body: marked ? trace : { ...trace, steps: trace.steps.map((s: { node: { id: string } }) => (s.node.id === stepId ? { ...s, knowledge: null } : s)) },
  }))
  noMark(api, decision.id)
  api.on('GET', `/api/nodes?q=${encodeURIComponent(decision.label)}&page=0&size=20`, {
    body: pageOf(search.items.filter((n: { id: string }) => n.id === decision.id)),
  })
  api.on('PUT', `/api/me/knowledge/${stepId}`, (req) => {
    marked = true
    return { body: { ...mark, ...(req.body as object), nodeId: stepId } }
  })

  await openApp(page)
  await openScreen(page, 'workspace')
  await page.getByTestId('search-input').fill(decision.label)
  await page.getByTestId('search-submit').click()
  await page.getByTestId('search-result').filter({ has: page.locator('.result-label', { hasText: exact(decision.label) }) }).click()
  await expect(page.getByTestId('detail-label')).toHaveText(exact(decision.label))

  await page.getByTestId('node-trace').click()
  await expect(page.getByTestId('trace-step').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'trace-mobile')

  // 단계 하나를 「잘 모르겠어요」 로 표시하면 화면이 그 단계의 표시를 보낸다.
  const step = page.locator(`[data-testid="trace-step"][data-node-id="${stepId}"]`)
  await step.getByTestId('knowledge-unsure').click()
  await expect(step.getByTestId('knowledge-unsure')).toHaveAttribute('aria-pressed', 'true')
  expect(api.lastRequest('PUT', `/api/me/knowledge/${stepId}`).body).toMatchObject({ level: 'UNSURE' })

  await openScreen(page, 'study')
  const item = page.locator(`[data-testid="study-item"][data-node-id="${stepId}"]`)
  await expect(item).toBeVisible()
  await expect(page.getByTestId('study-counts')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'study-mobile')

  // 이해했다고 표시하면 다시 읽은 목록에서 빠진다.
  api.on('GET', '/api/me/knowledge?level=UNSURE%2CLEARNING&page=0&size=20', { body: pageOf([]) })
  await item.getByTestId('study-known').click()
  await expect(item).toHaveCount(0)
  expect(api.lastRequest('PUT', `/api/me/knowledge/${stepId}`).body).toMatchObject({ level: 'KNOWN' })
})

test('휴대폰 폭에서 연동 토큰을 발급하고 폐기해도 가로 스크롤이 없다', async ({ page, api }) => {
  const tokens = api.fixture('tokens') as { id: string }[]
  await openApp(page)
  await page.getByTestId('more-open').click()
  await page.getByTestId('more-item-tokens').click()
  await expect(page.getByTestId('tokens-tab')).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // 기본 이름 그대로 발급한다. 발급 단추는 접힌 고급 칸 안에 있다.
  await openTokensAdvanced(page)
  await page.getByTestId('tokens-issue-open').click()
  await page.getByTestId('tokens-issue-submit').click()
  await expect(page.getByTestId('tokens-issued-value')).toHaveValue(api.fixture('token-issued').token)
  expect(api.lastRequest('POST', '/api/me/tokens').body).toEqual({ name: 'Hermes', scope: 'READ' })
  await expectNoHorizontalOverflow(page)
  await shot(page, 'tokens-issued-mobile')

  await page.getByTestId('tokens-issued-close').click()
  await expect(page.getByTestId('tokens-issue-dialog')).toHaveCount(0)
  const rows = page.getByTestId('tokens-row')
  await expect(rows).toHaveCount(tokens.length)
  await expectNoHorizontalOverflow(page)
  await shot(page, 'tokens-list-mobile')

  // 목록 맨 아래 행을 폐기하면 그 토큰의 폐기를 보내고, 다시 읽은 목록에서 빠진다.
  const target = tokens[tokens.length - 1]
  api.on('DELETE', `/api/me/tokens/${target.id}`, { status: 204 })
  api.on('GET', '/api/me/tokens', { body: tokens.slice(0, -1) })
  await rows.last().getByTestId('tokens-row-revoke').click()
  await page.getByTestId('tokens-revoke-confirm').click()
  await expect(rows).toHaveCount(tokens.length - 1)
  api.lastRequest('DELETE', `/api/me/tokens/${target.id}`)
})

test('휴대폰 폭에서 앱 연결 동의 화면과 연결된 앱 표가 가로 스크롤 없이 보인다', async ({ page, api }) => {
  const preview = api.fixture('oauth-authorize-preview')
  const connections = api.fixture('connections') as { clientName: string }[]
  // 동의 화면은 서버가 /oauth/authorize 의 query 를 그대로 붙여 보내는 주소다. 스냅샷의 인가 요청과 같은 query 로 연다.
  const authorizeQuery = api.fixtureRequest('oauth-authorize-preview').query
  await page.route(`${new URL(OAUTH_CALLBACK).origin}/**`, (r) => r.fulfill({ body: 'ok' }))

  await openApp(page)
  await page.goto(`/connect?${authorizeQuery}`)
  await expect(page.getByTestId('connect-page')).toBeVisible()
  await expect(page.getByTestId('connect-page')).toContainText(preview.clientName)
  await expect(page.getByTestId('connect-allow')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'connect-mobile')

  await page.getByTestId('connect-allow').click()
  await page.waitForURL(/127\.0\.0\.1:43210\/callback\?/)
  expect(api.lastRequest('POST', '/api/oauth/authorize').body).toMatchObject({ decision: 'ALLOW' })

  await page.goto('/tokens')
  await expect(page.getByTestId('connections-table')).toBeVisible()
  const row = page.locator(`[data-testid="connections-row"][data-name="${connections[0].clientName}"]`)
  await expect(row).toHaveCount(1)
  // 설치 안내 아래로 내려 표를 본다. 표 안 가로 스크롤 뒤로 숨지 않고 「연결 끊기」 가 창 안에 다 보인다
  await row.scrollIntoViewIfNeeded()
  await expect(row.getByTestId('connections-row-disconnect')).toBeInViewport({ ratio: 1 })
  await expectNoHorizontalOverflow(page)
  await shot(page, 'connections-mobile')
})

test('휴대폰 폭에서 제안과 내 체결이 가로 스크롤 없이 열린다', async ({ page, api }) => {
  const proposal = api.fixture('proposals-pending').items[0]
  const trade = api.fixture('trades').items[0]

  // 새로 연 화면은 배지가 붙어도 머리글이 한 줄에 들어간다.
  await openApp(page)
  await expect(page.getByTestId('more-pending-badge')).toBeVisible()
  const boxes = await Promise.all(
    ['tab-map', 'tab-workspace', 'tab-list', 'tab-study', 'more-open', 'add-open'].map((id) => page.getByTestId(id).boundingBox()),
  )
  const [tops, addBox] = [boxes.slice(0, 5).map((b) => b?.y ?? Number.NaN), boxes[5]]
  expect(new Set(tops).size, `탭 넷과 더보기의 y 좌표 ${tops.join(', ')}`).toBe(1)
  expect(addBox, '「＋ 추가」 단추').not.toBeNull()
  const addCenter = addBox!.y + addBox!.height / 2
  expect(addCenter, '「＋ 추가」 가 탭과 같은 줄에 있다').toBeGreaterThanOrEqual(tops[0])
  expect(addCenter, '「＋ 추가」 가 탭과 같은 줄에 있다').toBeLessThanOrEqual(tops[0] + (boxes[0]?.height ?? 0))

  await openScreen(page, 'proposals')
  const card = page.locator(`[data-testid="proposal-card"][data-id="${proposal.id}"]`)
  await expect(card).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'proposals-mobile')

  await openScreen(page, 'trades')
  const row = page.locator(`[data-testid="trade-row"][data-id="${trade.id}"]`)
  await expect(row).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await shot(page, 'trades-mobile')

  // 체결을 지우고 제안을 거절하면 그 요청을 보내고, 다시 읽은 목록에서 빠진다.
  api.on('DELETE', `/api/me/trades/${trade.id}`, { status: 204 })
  api.on('GET', '/api/me/trades', { body: pageOf([]) })
  await row.getByTestId('trade-delete').click()
  await page.getByTestId('trades-delete-confirm').click()
  await expect(row).toHaveCount(0)
  api.lastRequest('DELETE', `/api/me/trades/${trade.id}`)

  await openScreen(page, 'proposals')
  await card.getByTestId('proposal-reject-open').click()
  api.on('POST', `/api/me/proposals/${proposal.id}/reject`, { body: { ...proposal, status: 'REJECTED' } })
  api.on('GET', '/api/me/proposals', { body: pageOf([]) })
  api.on('GET', '/api/me/proposals/summary', { body: { pending: 0 } })
  await page.getByTestId('proposal-reject-confirm').click()
  await expect(card).toHaveCount(0)
  api.lastRequest('POST', `/api/me/proposals/${proposal.id}/reject`)
})
