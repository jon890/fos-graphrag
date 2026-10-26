import type { Page } from '@playwright/test'
import { exact, openScreen } from './support'
import { expect, shot, test, type MockApi } from './mock/test'

// 로그인과 화면 이동을 확인한다. 상단 탭과 뒤로가기, 개념 지도, 링크로 들어오기, 검색과 목록과 이력의 조건이 주소에 남는지를 본다.
// 응답은 가짜 API 의 스냅샷이다. 스냅샷에 없는 목록은 스냅샷의 노드로 만든 한 쪽으로 덮어쓴다.

interface NodeRef {
  id: string
  type: string
  label: string
}

/** 검색 결과 한 쪽. 스냅샷의 노드 목록 응답과 같은 모양이다 */
function pageOf<T>(items: T[]): { items: T[]; page: number; size: number; totalItems: number; totalPages: number } {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 }
}

/** 검색 결과 스냅샷의 노드 하나 */
function searchItem(api: MockApi, type: string): NodeRef {
  return api.fixture('nodes-search').items.find((n: NodeRef) => n.type === type)
}

/** 관계와 주장이 없는 노드의 상세. 스냅샷 상세의 모양에 노드만 바꿔 넣는다 */
function detailOf(api: MockApi, node: NodeRef): Record<string, unknown> {
  return { ...api.fixture('node-company'), node, relationships: [], claims: [], concepts: [] }
}

/** 노드 하나뿐인 주변 그래프. 스냅샷 그래프의 모양에 중심만 바꿔 넣는다 */
function graphOf(api: MockApi, node: NodeRef): Record<string, unknown> {
  return { ...api.fixture('graph-company'), centerId: node.id, nodes: [{ id: node.id, type: node.type, label: node.label, reviewStatus: null, predicate: null }], edges: [] }
}

/** 상세가 부르는 내 이해 표시를 「표시 없음」 으로 준다 */
function noMark(api: MockApi, nodeId: string): void {
  api.on('GET', `/api/me/knowledge/${nodeId}`, { body: { ...api.fixture<Record<string, unknown>>('knowledge-mark-none'), nodeId } })
}

function searchResult(page: Page, label: string) {
  return page.getByTestId('search-result').filter({ has: page.locator('.result-label', { hasText: exact(label) }) })
}

/** 고급 필터를 연다. 이미 열려 있으면 누르지 않는다 */
async function openAdvancedFilters(page: Page): Promise<void> {
  const details = page.getByTestId('advanced-filters')
  if ((await details.getAttribute('open')) === null) await page.getByTestId('advanced-filters-toggle').click()
  await expect(details).toHaveAttribute('open', '')
}

/** 머리글 「＋ 추가」 에서 타입을 골라 만들기 창을 연다 */
async function openAdd(page: Page, type: string) {
  await page.getByTestId('add-open').click()
  await page.getByTestId(`add-type-${type}`).click()
  const dialog = page.getByTestId('add-dialog')
  await expect(dialog).toHaveAttribute('data-type', type)
  return dialog
}

/** 만들기 창의 선택 항목을 펼친다. 이미 펼쳤으면 그대로 둔다 */
async function showOptional(page: Page): Promise<void> {
  const toggle = page.getByTestId('create-optional-toggle')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

/** 로그인된 첫 화면(개념 지도)을 연다 */
async function openApp(page: Page, startPath = '/'): Promise<void> {
  await page.goto(startPath)
  await expect(page.getByTestId('current-user-name')).toBeVisible()
}

test.beforeEach(({ api }) => {
  // 작업 공간의 검색 칸과 목록 탭은 검색어 없이 첫 쪽을 부른다. 서버의 이 응답은 초기 데이터가 섞여 스냅샷으로 남기지 않고 검색 결과로 대신한다.
  api.on('GET', '/api/nodes?page=0&size=20', { body: api.fixture('nodes-search') })
})

test.describe('허용하지 않은 로그인', () => {
  test.use({ role: null, loginResult: 'denied' })

  test('0b) 목록에 없거나 확인되지 않은 이메일로 로그인하면 「접근 권한이 없습니다」 안내가 보인다', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('login-google').click()
    await expect(page.getByTestId('login-denied')).toBeVisible()
    await expect(page.getByTestId('login-google')).toBeVisible()
    await expect(page.getByTestId('current-user-name')).toHaveCount(0)
    await shot(page, '00b-denied')
  })
})

test.describe('관리자', () => {
  test.use({ role: 'ADMIN' })

  test('0c) 변경 이력에서 작성자가 없는 이력(첫 관리자 생성)이 「시스템」 으로 보이고 화면이 유지된다', async ({ page, api }) => {
    const changes = api.fixture('changes')
    const admin = api.fixture('auth-me-admin')
    // 서버는 시작 설정으로 만든 첫 관리자의 이력을 작성자 없이(actor null) 준다. 스냅샷 서버는 시작 설정을 쓰지 않아 그 줄을 더한다.
    const systemEvent = {
      ...changes.items[0],
      id: admin.id.replace(/.$/, 'f'),
      actor: null,
      action: 'CREATE',
      targetId: admin.id,
      targetKind: 'USER',
      targetType: 'User',
      targetLabel: admin.email,
      revision: 1,
      changes: { email: { before: null, after: admin.email }, role: { before: null, after: 'ADMIN' } },
      refs: {},
      note: '시작 설정으로 만든 첫 관리자',
    }
    api.on('GET', '/api/changes?page=0&size=20', { body: { ...changes, items: [...changes.items, systemEvent] } })

    await openApp(page)
    await openScreen(page, 'changes')
    await expect(page.getByTestId('changes-table')).toBeVisible()
    const systemRow = page.getByTestId('change-row').filter({ hasText: '시작 설정으로 만든 첫 관리자' })
    await expect(systemRow).toHaveCount(1)
    await expect(systemRow).toContainText('시스템')
    // 머리글과 탭이 남아 있다.
    await expect(page.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('current-user-name')).toHaveText(admin.displayName)
    await expect(page.getByTestId('error-boundary')).toHaveCount(0)
    await shot(page, '00c-changes-all-system-actor')
  })

  test('0d) 한 탭이 렌더링 오류를 내도 머리글과 탭이 남고 「다시 시도」 로 돌아온다', async ({ page, api }) => {
    const admin = api.fixture('auth-me-admin')
    // 서버가 모양이 어긋난 응답(items 가 null)을 주는 상황을 만든다.
    let broken = true
    api.on('GET', '/api/changes', () =>
      broken ? { body: { items: null, page: 0, size: 20, totalItems: 0, totalPages: 0 } } : { body: api.fixture('changes') },
    )

    await openApp(page)
    await page.getByTestId('tab-list').click()
    await openScreen(page, 'changes')
    await expect(page.getByTestId('error-boundary')).toContainText('이 화면을 불러오지 못했습니다.')
    await expect(page.getByTestId('tab-workspace')).toBeVisible()
    await expect(page.getByTestId('current-user-name')).toHaveText(admin.displayName)
    await shot(page, '00d-error-boundary')

    // 다른 탭으로 옮기면 새 탭이 바로 그려진다.
    await page.getByTestId('tab-list').click()
    await expect(page.getByTestId('list-tab')).toBeVisible()
    await expect(page.getByTestId('error-boundary')).toHaveCount(0)

    // 서버가 정상으로 돌아오면 「다시 시도」 로 화면이 돌아온다.
    await openScreen(page, 'changes')
    await expect(page.getByTestId('error-boundary')).toBeVisible()
    broken = false
    await page.getByTestId('error-boundary-retry').click()
    await expect(page.getByTestId('changes-table')).toBeVisible()
    await expect(page.getByTestId('error-boundary')).toHaveCount(0)
  })

  test('0e) 첫 화면 안내와 만들기 폼이 한국어 표시 이름으로 보인다', async ({ page, api }) => {
    // 주장 폼의 주체 고르기는 고를 수 있는 항목이 있는지 먼저 하나만 찾는다.
    api.on('GET', '/api/nodes?types=Company,Security&size=1', { body: pageOf([searchItem(api, 'Company')]) })
    await openApp(page)
    await expect(page.getByTestId('map-intro')).toBeVisible()
    await expect(page.getByTestId('map-intro')).toContainText('투자 온톨로지')
    await expect(page.getByTestId('map-intro')).toContainText('상자를 누르면 그 종류의 항목을 보고 바로 추가할 수 있습니다.')
    await shot(page, '00e-first-screen')

    await openScreen(page, 'workspace')

    // 메뉴의 줄은 타입 순서이고 주장은 맨 아래다. 타입 목록은 온톨로지가 정하므로 여기에 다시 적지 않는다.
    await page.getByTestId('add-open').click()
    const addTypes = page.locator('[data-testid^="add-type-"]')
    await expect(addTypes.first()).toHaveAttribute('data-testid', /^add-type-/)
    await expect(addTypes.last()).toHaveAttribute('data-testid', 'add-type-Claim')
    await expect(addTypes.last()).toContainText('주장')
    await page.keyboard.press('Escape')
    await openAdd(page, 'Claim')
    await expect(page.getByTestId('claim-add-form')).toBeVisible()
    await expect(page.getByTestId('claim-subject-picker-input')).toBeVisible()
    await expect(page.getByTestId('claim-object-picker-input')).toBeVisible()
    await page.getByTestId('claim-add-cancel').click()
    await expect(page.getByTestId('add-dialog')).toHaveCount(0)
    await openAdd(page, 'Company')
    const company = page.getByTestId('create-form')
    await expect(company).toContainText('기업 이름')
    await showOptional(page)
    await expect(company).toContainText('국가')
    await expect(company).toContainText('기업이 등록된 나라')
    await expect(page.getByTestId('create-prop-country').locator('option[value="KR"]')).toHaveText('대한민국 (KR)')
    await expect(company).not.toContainText('문자열')
    await expect(company).not.toContainText('registrationNumber')
    await shot(page, '00e-company-form')
    await page.getByTestId('create-cancel').click()

    await openAdd(page, 'Security')
    const market = page.getByTestId('create-prop-market')
    await expect(market.locator('option')).toHaveText(['선택하세요', '코스피', '코스닥', '나스닥', '뉴욕증권거래소', '기타'])
    await expect(market.locator('option[value="KRX_KOSPI"]')).toHaveText('코스피')
    await showOptional(page)
    await expect(page.getByTestId('create-prop-securityType').locator('option')).toHaveText(['(없음)', '보통주', '우선주', 'ETF', '예탁증서(ADR)', '기타'])
    await shot(page, '00e-security-form')
    await page.getByTestId('create-cancel').click()

    // 검색 결과의 타입 배지는 온톨로지의 표시 이름이다.
    const security = searchItem(api, 'Security')
    const query = new URLSearchParams(api.fixtureRequest('nodes-search').query).get('q')!
    await page.getByTestId('search-input').fill(query)
    await page.getByTestId('search-submit').click()
    await expect(searchResult(page, security.label).locator('.type-badge')).toHaveText('종목')
  })

  test('0f) 상단 탭은 경로를 바꾸고 뒤로가기로 앞 탭에 돌아온다', async ({ page }) => {
    await openApp(page)
    await page.getByTestId('tab-list').click()
    await expect(page).toHaveURL(/\/list(\?|$)/)
    await openScreen(page, 'changes')
    await expect(page).toHaveURL(/\/changes(\?|$)/)
    await page.goBack()
    await expect(page).toHaveURL(/\/list(\?|$)/)
    await expect(page.getByTestId('tab-list')).toHaveAttribute('aria-selected', 'true')
    await page.reload()
    await expect(page.getByTestId('tab-list')).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/\/list(\?|$)/)
    await page.goto('/')
    await expect(page).toHaveURL(/\/map$/)
    await expect(page.getByTestId('tab-map')).toHaveAttribute('aria-selected', 'true')
  })

  test('0g) 개념 지도가 첫 화면이고 타입을 고르면 칸이 열린다', async ({ page, api }) => {
    const recent = api.fixture('nodes-recent').items as NodeRef[]
    // 칸의 「목록에서 보기」 는 그 타입으로 거른 목록 탭을 연다.
    api.on('GET', '/api/nodes?types=Company&page=0&size=20', { body: pageOf(recent) })

    await openApp(page)
    await expect(page).toHaveURL(/\/map$/)
    const canvas = page.getByTestId('concept-map-canvas')
    await expect(canvas).toHaveAttribute('data-layout-done', 'true')
    expect(await page.getByTestId('map-type').count()).toBeGreaterThan(0)

    // 타입 칸이 부르는 최근 항목은 기업의 것만 스냅샷에 있다.
    await page.locator('[data-testid="map-type"][data-type="Company"]').click()
    const panel = page.getByTestId('map-type-panel')
    await expect(panel).toHaveAttribute('data-type', 'Company')
    await expect(page).toHaveURL(/[?&]type=Company(&|$)/)
    await expect(page.locator('[data-testid="map-type"][data-type="Company"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.getByTestId('map-relation').first()).toBeVisible()
    await expect(panel.getByTestId('map-recent-item')).toHaveText(recent.map((n) => exact(n.label)))
    await shot(page, 'map-wide')

    await panel.getByTestId('map-open-list').click()
    await expect(page).toHaveURL(/\/list\?type=Company$/)
    await expect(page.getByTestId('tab-list')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('list-row')).toHaveCount(recent.length)
  })

  test('0h) 개념 지도의 ＋ 타입 추가로 만든 항목이 작업 공간 상세로 열린다', async ({ page, api }) => {
    const sector = api.fixture('nodes-first-sector').items[0]
    const name: string = sector.properties.name
    api.on('GET', '/api/nodes?types=Sector&sort=recent&size=5', { body: pageOf([]) })
    // 만들기 폼은 저장 전에 같은 이름을 찾는다. 아직 없다.
    api.on('GET', `/api/nodes?q=${encodeURIComponent(name)}&types=Sector&size=100`, { body: pageOf([]) })
    api.on('POST', '/api/nodes', { status: 201, body: sector })
    api.on('GET', `/api/nodes/${sector.id}`, { body: detailOf(api, sector) })
    api.on('GET', `/api/graph/neighborhood?id=${sector.id}&hops=1`, { body: graphOf(api, sector) })
    noMark(api, sector.id)

    await openApp(page)
    await page.locator('[data-testid="map-type"][data-type="Sector"]').click()
    await expect(page.getByTestId('map-type-panel')).toHaveAttribute('data-type', 'Sector')
    await page.getByTestId('map-add-type').click()
    const dialog = page.getByTestId('add-dialog')
    await expect(dialog).toHaveAttribute('data-type', 'Sector')
    await expect(dialog.getByTestId('add-steps')).toBeVisible()
    // 창은 투명에서 나타나는 애니메이션으로 열린다. 다 열린 뒤에 찍는다
    await expect(dialog).toHaveCSS('opacity', '1')
    await shot(page, 'add-dialog')

    // 필수 칸만 채워 저장한다.
    await dialog.getByTestId('create-prop-name').fill(name)
    await dialog.getByTestId('create-submit').click()
    await expect(dialog).toHaveCount(0)
    expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Sector', properties: { name } })
    await expect(page).toHaveURL(new RegExp(`/workspace\\?node=${sector.id}&pane=detail`))
    await expect(page.getByTestId('detail-label')).toHaveText(name)
    await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  })
})

test.describe('로그아웃 상태에서 링크로 들어오기', () => {
  test.use({ role: null })

  test('3b) 링크로 들어오면 로그인한 뒤 그 주장의 상세가 열린다', async ({ page, api }) => {
    const claim = api.fixture('node-claim').node
    noMark(api, claim.id)
    // 이미 보낸 /?node= 링크도 열리고, 새 주소로 바뀐다.
    await page.goto(`/?node=${encodeURIComponent(claim.id)}`)
    await page.getByTestId('login-google').click()
    await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', claim.id)
    await expect(page.getByTestId('detail-label')).toHaveText(claim.label)
    await page.getByTestId('node-more').click()
    await expect(page.getByTestId('node-copy-link')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(new RegExp(`/workspace\\?node=${claim.id}&pane=detail$`))
  })

  test('3b) 새 형식의 링크도 로그인한 뒤 같은 상세를 연다', async ({ page, api }) => {
    const claim = api.fixture('node-claim').node
    noMark(api, claim.id)
    await page.goto(`/workspace?node=${encodeURIComponent(claim.id)}`)
    await page.getByTestId('login-google').click()
    await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', claim.id)
    await expect(page.getByTestId('detail-label')).toHaveText(claim.label)
  })
})

test.describe('편집자', () => {
  test('4b) 작업 공간에서 뒤로가기는 앞 항목으로 돌아가고 검색 조건은 남는다', async ({ page, api }) => {
    const company = searchItem(api, 'Company')
    const sector = api.fixture('nodes-first-sector').items[0] as NodeRef
    const query = new URLSearchParams(api.fixtureRequest('nodes-search').query).get('q')!
    api.on('GET', `/api/nodes/${sector.id}`, { body: detailOf(api, sector) })
    noMark(api, sector.id)

    await openApp(page)
    await page.getByTestId('tab-workspace').click()
    await page.getByTestId('search-input').fill(query)
    await page.getByTestId('search-submit').click()
    await searchResult(page, company.label).click()
    await expect(page.getByTestId('detail-label')).toHaveText(company.label)
    await expect(page).toHaveURL(/node=/)
    await expect(page).toHaveURL(/q=/)

    // 「그래프에 나온 항목」 에서 산업을 열면 상세만 바뀐다.
    const sectorItem = page.locator(`[data-testid="graph-node"][data-node-id="${sector.id}"]`)
    await sectorItem.getByRole('button').click()
    await expect(page.getByTestId('detail-label')).toHaveText(sector.label)
    await page.goBack()
    await expect(page.getByTestId('detail-label')).toHaveText(company.label)
    await expect(page.getByTestId('search-input')).toHaveValue(query)

    // 다른 탭에 갔다 뒤로가기로 돌아와도 검색 조건과 열어 둔 항목이 그대로다.
    await page.getByTestId('tab-list').click()
    await expect(page).toHaveURL(/\/list(\?|$)/)
    await page.goBack()
    await expect(page.getByTestId('tab-workspace')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('search-input')).toHaveValue(query)
    await expect(page.getByTestId('detail-label')).toHaveText(company.label)

    // 홉 수는 주소만 바꾸고 기록을 쌓지 않는다. 산업을 연 뒤 홉을 바꿔도 뒤로가기 한 번이면 기업이다.
    await sectorItem.getByRole('button').click()
    await expect(page.getByTestId('detail-label')).toHaveText(sector.label)
    await openAdvancedFilters(page)
    await page.getByTestId('graph-hops').selectOption('2')
    await expect(page).toHaveURL(/hops=2/)
    await expect(page.getByTestId('graph-loading')).toHaveCount(0)
    expect(api.lastRequest('GET', '/api/graph/neighborhood').query).toBe(`id=${company.id}&hops=2`)
    await page.goBack()
    await expect(page.getByTestId('detail-label')).toHaveText(company.label)
    await expect(page).not.toHaveURL(/hops=/)
    await shot(page, '04b-back-to-supplier')
  })

  test('4c) 고급 필터는 접혀 있고 바꾼 개수를 보인다', async ({ page }) => {
    await openApp(page, '/workspace')
    await expect(page.getByTestId('advanced-filters')).not.toHaveAttribute('open', /.*/)
    await expect(page.getByTestId('advanced-filters-toggle')).toHaveText('고급 필터')

    await openAdvancedFilters(page)
    await page.getByTestId('graph-hops').selectOption('2')
    await expect(page).toHaveURL(/hops=2/)
    await expect(page.getByTestId('advanced-filters-toggle')).toHaveText('고급 필터 (1)')

    // 열림은 주소에 두지 않아 새로고침하면 접히고, 조건이 걸린 개수는 남는다.
    await page.reload()
    await expect(page.getByTestId('advanced-filters')).not.toHaveAttribute('open', /.*/)
    await expect(page.getByTestId('advanced-filters-toggle')).toHaveText('고급 필터 (1)')

    await openAdvancedFilters(page)
    await page.getByTestId('graph-hops').selectOption('1')
    await expect(page.getByTestId('advanced-filters-toggle')).toHaveText('고급 필터')
  })

  test('6d) 목록과 이력에서 항목을 열었다가 뒤로가기로 돌아오면 조건이 그대로다', async ({ page, api }) => {
    const list = api.fixtureRequest('nodes-list-company')
    const query = new URLSearchParams(list.query).get('q')!
    const company = api.fixture('nodes-list-company').items[0] as NodeRef
    // 이력의 작성자 고르기는 스냅샷에 남긴 다른 편집자(검토만 한 사람)로 한다
    const actor = api.fixture('changes-actors').find((a: { email: string }) => a.email !== api.fixture('auth-me-editor').email)
    // 이력의 첫 줄은 그 편집자가 검토한 주장이다.
    noMark(api, api.fixture('node-claim').node.id)
    // 타입만 고른 목록. 검색어를 넣기 전에 한 번 부른다.
    api.on('GET', '/api/nodes?types=Company&page=0&size=20', { body: api.fixture('nodes-list-company') })

    await openApp(page)
    await page.getByTestId('tab-list').click()
    await page.getByTestId('list-type-filter').selectOption('Company')
    await page.getByTestId('list-search-input').fill(query)
    await page.getByTestId('list-search-submit').click()
    await expect(page).toHaveURL(/type=Company/)
    await expect(page).toHaveURL(/q=/)
    expect(api.lastRequest('GET', '/api/nodes').query).toBe(list.query)
    const listUrl = page.url()
    const listRow = page.getByTestId('list-row').filter({ hasText: company.label })
    await expect(listRow).toHaveCount(1)
    await listRow.click()
    await expect(page).toHaveURL(/\/workspace\?node=/)
    await expect(page.getByTestId('detail-label')).toHaveText(company.label)
    await page.goBack()
    await expect(page).toHaveURL(listUrl)
    await expect(page.getByTestId('list-type-filter')).toHaveValue('Company')
    await expect(page.getByTestId('list-search-input')).toHaveValue(query)
    await expect(page.getByTestId('list-row').filter({ hasText: company.label })).toHaveCount(1)
    await shot(page, '06d-list-back')

    await openScreen(page, 'changes')
    await expect(page.getByTestId('changes-tab')).toBeVisible()
    await page.getByTestId('changes-actor-filter').selectOption({ value: actor.email })
    await expect(page).toHaveURL(/actor=/)
    const targetButton = page.locator('[data-testid="change-row"] td:nth-child(5) button').first()
    await expect(targetButton).toBeVisible()
    await targetButton.click()
    await expect(page).toHaveURL(/\/workspace\?node=/)
    await page.goBack()
    await expect(page).toHaveURL(/\/changes/)
    await expect(page.getByTestId('changes-actor-filter')).toHaveValue(actor.email)
    await expect(page.getByTestId('change-row').first()).toBeVisible()
    await shot(page, '06d-changes-back')
  })
})
