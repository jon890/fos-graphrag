import type { Page } from '@playwright/test'
import { exact, openScreen } from './support'
import { expect, shot, test, type MockApi } from './mock/test'

// 지식 편집을 확인한다. 항목 만들기와 같은 이름 경고, 주장 만들기, 검토, 주변 그래프와 근거, 읽기 카드와 편집, 동시 수정, 보관과 복원.
// 응답은 가짜 API 의 스냅샷이다. 쓰기는 화면이 보낸 경로와 본문을 확인하고, 쓴 뒤의 화면은 스냅샷 응답으로 확인한다.
// 쓰기 전과 뒤가 다른 응답은 테스트가 상태를 들고 스냅샷을 고쳐 준다. 서버 규칙(권한, revision, 근거 검사)은 서버 테스트가 맡는다.

interface NodeRef {
  id: string
  type: string
  label: string
}

interface NodeView extends NodeRef {
  properties: Record<string, unknown>
  revision: number
  archived: boolean
}

interface Detail {
  node: NodeView
  relationships: { id: string; type: string; from: NodeRef; to: NodeRef }[]
  claims: { id: string }[]
  [key: string]: unknown
}

/** 검색 결과 한 쪽. 스냅샷의 노드 목록 응답과 같은 모양이다 */
function pageOf<T>(items: T[]): { items: T[]; page: number; size: number; totalItems: number; totalPages: number } {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 }
}

/** 검색 결과 스냅샷의 노드 하나 */
function searchItem(api: MockApi, type: string): NodeView {
  return api.fixture('nodes-search').items.find((n: NodeRef) => n.type === type)
}

/** 관계와 주장이 없는 노드의 상세. 스냅샷 상세의 모양에 노드만 바꿔 넣는다 */
function detailOf(api: MockApi, node: NodeView): Detail {
  return { ...api.fixture('node-company'), node, relationships: [], claims: [], concepts: [] }
}

/** 노드 하나뿐인 주변 그래프. 스냅샷 그래프의 모양에 중심만 바꿔 넣는다 */
function graphOf(api: MockApi, node: NodeRef): Record<string, unknown> {
  return { ...api.fixture('graph-company'), centerId: node.id, nodes: [{ id: node.id, type: node.type, label: node.label, reviewStatus: null, predicate: null }], edges: [] }
}

/** 상세가 부르는 내 이해 표시를 「표시 없음」 으로 준다 */
function noMark(api: MockApi, ...nodeIds: string[]): void {
  for (const nodeId of nodeIds) api.on('GET', `/api/me/knowledge/${nodeId}`, { body: { ...api.fixture<Record<string, unknown>>('knowledge-mark-none'), nodeId } })
}

/** 노드 고르기(NodePicker)의 검색 결과를 준다 */
function pickable(api: MockApi, types: string, items: NodeRef[]): void {
  for (const item of items) api.on('GET', `/api/nodes?q=${encodeURIComponent(item.label)}&types=${types}&size=10`, { body: pageOf(items) })
}

/** 주장 폼의 고르기 칸은 이미 고른 항목 말고 고를 것이 있는지 먼저 찾는다. 있다고 답한다 */
function hasCandidates(api: MockApi, types: string, items: NodeRef[]): void {
  for (const size of [1, 2]) api.on('GET', `/api/nodes?types=${types}&size=${size}`, { body: pageOf(items) })
}

/** 관계 줄 가운데 상대 항목 이름이 그 이름인 줄 */
function relationshipRow(page: Page, label: string) {
  return page.getByTestId('relationship-row').filter({ has: page.getByTestId('relationship-open').filter({ hasText: exact(label) }) })
}

/** 만들기 폼이 저장 전에 찾는 같은 이름을 준다 */
function sameName(api: MockApi, type: string, label: string, items: NodeRef[] = []): void {
  api.on('GET', `/api/nodes?q=${encodeURIComponent(label)}&types=${type}&size=100`, { body: pageOf(items) })
}

/** method 와 path 가 같은 요청의 본문을 받은 순서대로 */
function bodiesOf(api: MockApi, method: string, path: string): unknown[] {
  return api.requests.filter((r) => r.method === method && r.path === path).map((r) => r.body)
}

function searchResult(page: Page, label: string) {
  return page.getByTestId('search-result').filter({ has: page.locator('.result-label', { hasText: exact(label) }) })
}

/** 로그인된 첫 화면(개념 지도)을 연다 */
async function openApp(page: Page, startPath = '/'): Promise<void> {
  await page.goto(startPath)
  await expect(page.getByTestId('current-user-name')).toBeVisible()
}

/** 작업 공간 왼쪽 검색으로 노드를 찾아 상세를 연다 */
async function searchAndOpen(page: Page, query: string, label: string): Promise<void> {
  await page.getByTestId('tab-workspace').click()
  await page.getByTestId('search-input').fill(query)
  await page.getByTestId('search-submit').click()
  await searchResult(page, label).click()
  await expect(page.getByTestId('detail-label')).toHaveText(label)
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

/** 「＋ 추가」 창으로 노드를 만든다. 창이 닫히고 만든 노드의 상세가 성공 안내와 함께 열린다 */
async function createNode(page: Page, type: string, label: string, props: Record<string, string>): Promise<void> {
  const dialog = await openAdd(page, type)
  for (const [name, value] of Object.entries(props)) {
    const input = dialog.getByTestId(`create-prop-${name}`)
    if ((await input.count()) === 0) await showOptional(page)
    const tag = await input.evaluate((el) => el.tagName)
    if (tag === 'SELECT') await input.selectOption(value)
    else await input.fill(value)
  }
  await dialog.getByTestId('create-submit').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('detail-label')).toHaveText(label)
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  await expect(page.getByTestId('detail-notice')).toContainText('만들었습니다')
}

/** 노드 고르기 입력에서 검색해 정확히 그 이름의 결과를 고른다 */
async function pick(page: Page, prefix: string, label: string): Promise<void> {
  await page.getByTestId(`${prefix}-input`).fill(label)
  await page.getByTestId(`${prefix}-search`).click()
  await page.getByTestId(`${prefix}-result`).filter({ hasText: label }).first().click()
}

/** 상세의 「⋯」 메뉴를 열고 항목을 누른다 */
async function detailMenu(page: Page, item: 'node-history-link' | 'node-archive-button' | 'node-restore-button'): Promise<void> {
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

/** 검색 칸이 쓰는 스냅샷 검색어(기업 이름) */
function searchQuery(api: MockApi): string {
  return new URLSearchParams(api.fixtureRequest('nodes-search').query).get('q')!
}

test.beforeEach(({ api }) => {
  // 작업 공간의 검색 칸은 검색어 없이 첫 쪽을 부른다. 서버의 이 응답은 초기 데이터가 섞여 스냅샷으로 남기지 않고 검색 결과로 대신한다.
  api.on('GET', '/api/nodes?page=0&size=20', { body: api.fixture('nodes-search') })
})

test('1) 기업과 산업, 종목을 만들고 종목에서 발행 기업 관계를 잇는다', async ({ page, api }) => {
  const company = api.fixture<Detail>('node-company').node
  const sector = api.fixture('nodes-first-sector').items[0] as NodeView
  const securityDetail = api.fixture<Detail>('node-security')
  const security = securityDetail.node
  const companyGraph = api.fixture('graph-company')
  const issues = securityDetail.relationships.find((r) => r.type === 'ISSUES')!

  for (const n of [company, sector, security]) sameName(api, n.type, n.label)
  pickable(api, 'Company', [company])
  api.on('POST', '/api/nodes', (req) => {
    const type = (req.body as { type: string }).type
    const created = [company, sector, security].find((n) => n.type === type)
    return created ? { status: 201, body: created } : { status: 400, body: { code: 'VALIDATION_FAILED', message: `테스트가 준비하지 않은 타입 ${type}` } }
  })
  api.on('GET', `/api/nodes/${sector.id}`, { body: detailOf(api, sector) })
  api.on('GET', `/api/graph/neighborhood?id=${sector.id}&hops=1`, { body: graphOf(api, sector) })
  noMark(api, sector.id, security.id)
  // 종목은 관계를 잇기 전까지 관계도 주장도 없고, 그래프에도 자기 하나뿐이다.
  let linked = false
  api.on('GET', `/api/nodes/${security.id}`, () => ({ body: linked ? securityDetail : { ...securityDetail, relationships: [], claims: [] } }))
  api.on('GET', `/api/graph/neighborhood?id=${security.id}&hops=1`, () => ({
    body: linked
      ? {
          ...companyGraph,
          centerId: security.id,
          nodes: [security.id, company.id].map((id) => companyGraph.nodes.find((n: NodeRef) => n.id === id)),
          edges: companyGraph.edges.filter((e: { id: string }) => e.id === issues.id),
        }
      : graphOf(api, security),
  }))
  api.on('POST', '/api/relationships', () => {
    linked = true
    return { status: 201, body: issues }
  })

  await openApp(page)
  await expect(page.getByTestId('current-user-role')).toHaveAttribute('data-role', 'EDITOR')
  await page.getByTestId('more-open').click()
  await expect(page.getByTestId('more-item-changes')).toBeVisible()
  await expect(page.getByTestId('more-item-users')).toHaveCount(0)
  await page.keyboard.press('Escape')
  // ADMIN 이 아니면 /users 는 개념 지도로 바뀐다.
  await page.goto('/users')
  await expect(page).toHaveURL(/\/map$/)
  await expect(page.getByTestId('concept-map')).toBeVisible()

  await createNode(page, 'Company', company.label, { name: company.label, country: 'KR' })
  expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Company', properties: { name: company.label, country: 'KR' } })
  await createNode(page, 'Sector', sector.label, { name: sector.label, scheme: 'GICS' })
  expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Sector', properties: { name: sector.label, scheme: 'GICS' } })
  const securityProps = {
    market: String(security.properties.market),
    ticker: String(security.properties.ticker),
    name: String(security.properties.name),
    securityType: String(security.properties.securityType),
    currency: String(security.properties.currency),
  }
  await createNode(page, 'Security', security.label, securityProps)
  expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Security', properties: securityProps })

  // 종목 쪽에서 「기업이 이 종목을 발행한다」 관계를 추가한다.
  await page.getByTestId('relationship-add-toggle').click()
  await page.getByTestId('relationship-type-select').selectOption('ISSUES:in')
  await pick(page, 'relationship-target-picker', company.label)
  await expect(page.getByTestId('relationship-target-selected')).toContainText(company.label)
  await page.getByTestId('relationship-add-submit').click()
  expect(api.lastRequest('POST', '/api/relationships').body).toEqual({ type: 'ISSUES', fromId: company.id, toId: security.id })

  const row = relationshipRow(page, company.label)
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('data-rel-type', 'ISSUES')
  // 종목은 관계의 끝이다. 문장에서 종목 이름은 굵게, 기업 이름은 여는 단추로 보인다.
  await expect(row).toHaveAttribute('data-direction', 'in')
  await expect(row.getByTestId('relationship-self')).toHaveText(security.label)
  await expect(row.getByTestId('relationship-open')).toHaveText(company.label)
  await expect(page.locator(`[data-testid="graph-node"][data-node-id="${company.id}"]`)).toContainText(company.label)
  await shot(page, '01-issues')
})

test('1b) 같은 이름은 저장 전에 경고하고, 종목을 만들며 고른 발행 기업이 이어진다', async ({ page, api }) => {
  const company = api.fixture<Detail>('node-company').node
  const securityDetail = api.fixture<Detail>('node-security')
  const security = securityDetail.node
  const issues = securityDetail.relationships.find((r) => r.type === 'ISSUES')!

  // 같은 이름의 기업이 이미 있다. 경고에는 구분 정보(국가)가 보인다.
  sameName(api, 'Company', company.label, [company])
  sameName(api, 'Security', security.label)
  pickable(api, 'Company', [company])
  api.on('POST', '/api/nodes', (req) => {
    const type = (req.body as { type: string }).type
    return { status: 201, body: type === 'Security' ? security : company }
  })
  let linked = false
  let relationshipFails = false
  api.on('GET', `/api/nodes/${security.id}`, () => ({ body: linked ? securityDetail : { ...securityDetail, relationships: [], claims: [] } }))
  api.on('GET', `/api/graph/neighborhood?id=${security.id}&hops=1`, { body: graphOf(api, security) })
  noMark(api, security.id)
  api.on('POST', '/api/relationships', () => {
    if (relationshipFails) return { status: 500, body: { code: 'INTERNAL_ERROR', message: '테스트로 만든 실패', details: null } }
    linked = true
    return { status: 201, body: issues }
  })

  await openApp(page)
  await openScreen(page, 'workspace')
  await openAdd(page, 'Company')
  await page.getByTestId('create-prop-name').fill(company.label)
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('create-duplicate')).toBeVisible()
  await expect(page.getByTestId('create-duplicate-item')).toHaveCount(1)
  await expect(page.getByTestId('create-duplicate-item')).toContainText('대한민국 (KR)')
  expect(bodiesOf(api, 'POST', '/api/nodes'), '경고 중에는 만들지 않는다').toEqual([])
  await shot(page, '01b-duplicate')
  // 경고의 항목을 열면 창이 닫히고 그 기업의 상세가 열린다.
  await page.getByTestId('create-duplicate-open').click()
  await expect(page.getByTestId('add-dialog')).toHaveCount(0)
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', company.id)

  // 그래도 만들기를 고르면 그 이름 그대로 만든다.
  await openAdd(page, 'Company')
  await page.getByTestId('create-prop-name').fill(company.label)
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('create-duplicate')).toBeVisible()
  await page.getByTestId('create-duplicate-confirm').click()
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  expect(bodiesOf(api, 'POST', '/api/nodes')).toEqual([{ type: 'Company', properties: { name: company.label } }])

  // 종목을 만들면서 발행 기업을 고르면 ISSUES 관계가 함께 이어진다.
  const fillSecurity = async () => {
    await openAdd(page, 'Security')
    await page.getByTestId('create-prop-market').selectOption(String(security.properties.market))
    await page.getByTestId('create-prop-ticker').fill(String(security.properties.ticker))
    await page.getByTestId('create-prop-name').fill(String(security.properties.name))
    await showOptional(page)
    await page.getByTestId('create-prop-securityType').selectOption(String(security.properties.securityType))
    await page.getByTestId('create-prop-currency').selectOption(String(security.properties.currency))
    await pick(page, 'create-link-ISSUES-picker', company.label)
    await expect(page.getByTestId('create-link-ISSUES-selected')).toContainText(company.label)
    await page.getByTestId('create-submit').click()
  }
  await fillSecurity()
  await expect(page.getByTestId('detail-label')).toHaveText(security.label)
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  expect(api.lastRequest('POST', '/api/nodes').body).toMatchObject({ type: 'Security' })
  expect(api.lastRequest('POST', '/api/relationships').body).toEqual({ type: 'ISSUES', fromId: company.id, toId: security.id })
  const row = relationshipRow(page, company.label)
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('data-rel-type', 'ISSUES')
  await shot(page, '01b-issuer-linked')

  // 관계만 실패하면 종목은 남고 안내가 오류로 나온다.
  linked = false
  relationshipFails = true
  await fillSecurity()
  await expect(page.getByTestId('detail-label')).toHaveText(security.label)
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'error')
  await expect(page.getByTestId('detail-notice')).toContainText('발행 기업을 잇지 못했습니다')
})

test('1c) 투자 항목을 이어 만들고 결정에서 변화까지 따라간다', async ({ page, api }) => {
  const decisionDetail = api.fixture<Detail>('node-decision')
  const decision = decisionDetail.node
  const security = api.fixture<Detail>('node-security').node
  const valuation = searchItem(api, 'Valuation')
  const company = searchItem(api, 'Company')
  const bottleneckGraph = api.fixture('graph-bottleneck')
  const bottleneck = bottleneckGraph.nodes[0] as NodeRef
  const change = bottleneckGraph.nodes.find((n: NodeRef) => n.type === 'Change') as NodeRef

  pickable(api, 'Valuation', [valuation])
  pickable(api, 'Security', [security])
  sameName(api, 'Decision', decision.label)
  api.on('POST', '/api/nodes', { status: 201, body: decision })
  api.on('POST', '/api/relationships', (req) => {
    const type = (req.body as { type: string }).type
    return { status: 201, body: decisionDetail.relationships.find((r) => r.type === type) }
  })
  noMark(api, decision.id, bottleneck.id)
  // 그래프에서 고른 병목의 상세. 스냅샷의 이해 표시 목록에 있는 병목 노드로 만든다.
  const bottleneckNode = { ...company, ...api.fixture('knowledge-study').items[0].node, properties: { title: bottleneck.label } }
  api.on('GET', `/api/nodes/${bottleneck.id}`, { body: detailOf(api, bottleneckNode) })

  await openApp(page)
  await openScreen(page, 'workspace')

  // 시나리오는 주당 가치가 필수다. 비워 두면 칸에 오류가 나오고 보내지 않는다.
  await openAdd(page, 'Scenario')
  await page.getByTestId('create-prop-title').fill('가상전자 기준')
  await page.getByTestId('create-prop-kind').selectOption('BASE')
  await pick(page, 'create-link-HAS_SCENARIO-picker', valuation.label)
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('create-prop-valuePerShare-error')).toBeVisible()
  expect(bodiesOf(api, 'POST', '/api/nodes')).toEqual([])
  await page.getByTestId('create-cancel').click()

  // 결정은 종목과 밸류에이션을 함께 골라 두 관계를 잇는다.
  await openAdd(page, 'Decision')
  await page.getByTestId('create-prop-title').fill(decision.label)
  await page.getByTestId('create-prop-action').selectOption(String(decision.properties.action))
  await pick(page, 'create-link-HAS_DECISION-picker', security.label)
  await pick(page, 'create-link-BASED_ON-picker', valuation.label)
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('detail-label')).toHaveText(decision.label)
  expect(api.lastRequest('POST', '/api/nodes').body).toMatchObject({ type: 'Decision', properties: { title: decision.label, action: decision.properties.action } })
  expect(bodiesOf(api, 'POST', '/api/relationships')).toEqual(
    expect.arrayContaining([
      { type: 'HAS_DECISION', fromId: security.id, toId: decision.id },
      { type: 'BASED_ON', fromId: valuation.id, toId: decision.id },
    ]),
  )
  await expect(relationshipRow(page, security.label)).toHaveAttribute('data-rel-type', 'HAS_DECISION')
  await expect(relationshipRow(page, valuation.label)).toHaveAttribute('data-rel-type', 'BASED_ON')

  // 기업 주변 그래프에서 병목을 골라 이웃을 펼치면 그 병목을 만든 변화가 나온다.
  await searchAndOpen(page, searchQuery(api), company.label)
  await page.locator(`[data-testid="graph-node"][data-node-id="${bottleneck.id}"]`).getByRole('button').click()
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', bottleneck.id)
  await page.getByTestId('graph-expand').click()
  await expect(page.locator(`[data-testid="graph-node"][data-node-type="Change"][data-node-id="${change.id}"]`)).toHaveCount(1)
  await shot(page, '13a-investment-chain')
})

test('2) 문서를 등록하고 그 문서를 근거로 산업 소속 주장을 만든다', async ({ page, api }) => {
  const documentDetail = api.fixture<Detail>('node-document')
  const document = documentDetail.node
  const securityDetail = api.fixture<Detail>('node-security')
  const security = securityDetail.node
  const sector = api.fixture('nodes-first-sector').items[0] as NodeView
  // 만들 주장은 스냅샷의 검토 대기 주장(종목이 산업에 속한다)이다.
  const claim = api.fixture('claims-pending-review').items[0]

  sameName(api, 'Document', document.label)
  pickable(api, 'Sector', [sector])
  pickable(api, 'Document', [document])
  hasCandidates(api, 'Sector', [sector])
  api.on('POST', '/api/nodes', { status: 201, body: document })
  api.on('GET', `/api/graph/neighborhood?id=${security.id}&hops=1`, { body: graphOf(api, security) })
  api.on('GET', `/api/graph/neighborhood?id=${document.id}&hops=1`, { body: graphOf(api, document) })
  noMark(api, document.id, security.id)
  let created = false
  api.on('GET', `/api/nodes/${security.id}`, () => ({
    body: created ? securityDetail : { ...securityDetail, claims: securityDetail.claims.filter((c) => c.id !== claim.id) },
  }))
  api.on('POST', '/api/claims', () => {
    created = true
    return { status: 201, body: claim }
  })

  await openApp(page)
  await openScreen(page, 'workspace')
  // 수집 시각은 이 브라우저의 시간대(Asia/Seoul)로 넣고, 서버에는 UTC 로 보낸다.
  await createNode(page, 'Document', document.label, {
    title: String(document.properties.title),
    url: String(document.properties.url),
    publisher: String(document.properties.publisher),
    documentType: String(document.properties.documentType),
    publishedAt: String(document.properties.publishedAt),
    collectedAt: '2026-10-20T12:00',
  })
  expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Document', properties: document.properties })

  await searchAndOpen(page, searchQuery(api), security.label)
  await page.getByTestId('claim-add-toggle').click()
  await expect(page.getByTestId('claim-predicate-select')).toHaveValue('BELONGS_TO_SECTOR')
  await pick(page, 'claim-object-picker', sector.label)
  await expect(page.getByTestId('claim-object-selected')).toContainText(sector.label)
  await pick(page, 'claim-doc-picker', document.label)
  await expect(page.getByTestId('claim-doc-selected')).toContainText(document.label)
  await page.getByTestId('claim-description').fill(claim.properties.description)
  await page.getByTestId('claim-evidence').fill(claim.properties.evidenceText)
  await page.getByTestId('claim-add-submit').click()

  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  expect(api.lastRequest('POST', '/api/claims').body).toMatchObject({
    predicate: 'BELONGS_TO_SECTOR',
    subjectId: security.id,
    objectId: sector.id,
    documentIds: [document.id],
    description: claim.properties.description,
    evidenceText: claim.properties.evidenceText,
  })
  const card = page.getByTestId('node-claims-section').locator(`[data-testid="claim-card"][data-claim-id="${claim.id}"]`)
  await expect(card).toBeVisible()
  await expect(card).toHaveAttribute('data-review-status', 'DRAFT')
  await expect(card.getByTestId('claim-valid-from')).toHaveText('미상')
  await shot(page, '02-claim-created')
})

test('2d) 책을 근거로 인물이 개념을 강조한다는 주장을 만든다', async ({ page, api }) => {
  const personDetail = api.fixture<Detail>('node-person')
  const person = personDetail.node
  const bookDetail = api.fixture<Detail>('node-book')
  const book = bookDetail.node
  const concept = api.fixture('nodes-pick-concept').items[0] as NodeView
  const claim = api.fixture('claim-advocates')
  const personGraph = api.fixture('graph-person')

  sameName(api, 'Document', book.label)
  pickable(api, 'Person', [person])
  pickable(api, 'Document', [book])
  pickable(api, 'Concept', [concept])
  hasCandidates(api, 'Concept', [concept])
  api.on('POST', '/api/nodes', { status: 201, body: book })
  api.on('POST', '/api/relationships', { status: 201, body: bookDetail.relationships.find((r) => r.type === 'AUTHORED') })
  api.on('GET', `/api/graph/neighborhood?id=${book.id}&hops=1`, { body: graphOf(api, book) })
  api.on('GET', `/api/nodes?q=${encodeURIComponent(person.label)}&page=0&size=20`, { body: pageOf([person]) })
  noMark(api, book.id, person.id)
  // 인물은 주장을 만들기 전까지 주장이 없고, 그래프에도 주장과 개념이 없다.
  let created = false
  api.on('GET', `/api/nodes/${person.id}`, () => ({ body: created ? personDetail : { ...personDetail, claims: [] } }))
  api.on('GET', `/api/graph/neighborhood?id=${person.id}&hops=1`, () => ({
    body: created ? personGraph : { ...personGraph, nodes: personGraph.nodes.filter((n: NodeRef) => n.type !== 'Claim' && n.type !== 'Concept'), edges: [] },
  }))
  api.on('POST', '/api/claims', () => {
    created = true
    return { status: 201, body: claim }
  })

  await openApp(page)
  await openScreen(page, 'workspace')
  // 책을 만들며 저자를 고르면 「썼다」 관계가 함께 이어진다.
  await openAdd(page, 'Document')
  await page.getByTestId('create-prop-title').fill(book.label)
  await page.getByTestId('create-prop-url').fill(String(book.properties.url))
  await showOptional(page)
  await page.getByTestId('create-prop-documentType').selectOption('BOOK')
  await page.getByTestId('create-prop-collectedAt').fill('2026-10-20T12:00')
  await pick(page, 'create-link-AUTHORED-picker', person.label)
  await page.getByTestId('create-submit').click()
  await expect(page.getByTestId('detail-label')).toHaveText(book.label)
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Document', properties: book.properties })
  expect(api.lastRequest('POST', '/api/relationships').body).toEqual({ type: 'AUTHORED', fromId: person.id, toId: book.id })
  await expect(relationshipRow(page, person.label)).toHaveAttribute('data-rel-type', 'AUTHORED')

  await searchAndOpen(page, person.label, person.label)
  await page.getByTestId('claim-add-toggle').click()
  await page.getByTestId('claim-predicate-select').selectOption('ADVOCATES')
  await expect(page.getByTestId('claim-sentence')).toContainText('강조한다')
  await pick(page, 'claim-object-picker', concept.label)
  await expect(page.getByTestId('claim-object-selected')).toContainText(concept.label)
  await pick(page, 'claim-doc-picker', book.label)
  await page.getByTestId('claim-description').fill(claim.properties.description)
  await page.getByTestId('claim-evidence').fill(claim.properties.evidenceText)
  await page.getByTestId('claim-add-submit').click()

  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  expect(api.lastRequest('POST', '/api/claims').body).toMatchObject({
    predicate: 'ADVOCATES',
    subjectId: person.id,
    objectId: concept.id,
    documentIds: [book.id],
  })
  const card = page.getByTestId('node-claims-section').locator(`[data-testid="claim-card"][data-claim-id="${claim.id}"]`)
  await expect(card).toBeVisible()
  const list = page.getByTestId('graph-node-list')
  await expect(list).toContainText(concept.label)
  await expect(list.locator(`[data-node-id="${claim.id}"]`)).toContainText(`${person.label} → ${concept.label} 강조한다`)
  await shot(page, '02d-master-claim')
})

test('2b) 산업 상세에서 「주체와 대상 바꾸기」 로 산업 소속 주장을 만든다', async ({ page, api }) => {
  const companyDetail = api.fixture<Detail>('node-company')
  const company = companyDetail.node
  const sector = api.fixture('nodes-first-sector').items[0] as NodeView
  const document = api.fixture<Detail>('node-document').node
  // 만들 주장은 스냅샷의 검토된 주장(기업이 산업에 속한다)과 같은 내용이다. 막 만든 주장은 검토 전이다.
  const reviewed = api.fixture('claim-reviewed')
  const claim = { ...reviewed, revision: 1, reviewStatus: 'DRAFT', reviewedBy: null, reviewedAt: null, reviewNote: null }

  api.on('GET', `/api/nodes?q=${encodeURIComponent(sector.label)}&page=0&size=20`, { body: pageOf([sector]) })
  pickable(api, 'Company,Security', [company])
  pickable(api, 'Document', [document])
  hasCandidates(api, 'Sector', [sector])
  hasCandidates(api, 'Company,Security', [company])
  api.on('GET', `/api/graph/neighborhood?id=${sector.id}&hops=1`, { body: graphOf(api, sector) })
  noMark(api, sector.id)
  let created = false
  api.on('GET', `/api/nodes/${sector.id}`, () => ({ body: { ...detailOf(api, sector), claims: created ? [claim] : [] } }))
  api.on('POST', '/api/claims', () => {
    created = true
    return { status: 201, body: claim }
  })

  await openApp(page)
  await searchAndOpen(page, sector.label, sector.label)
  await page.getByTestId('claim-add-toggle').click()
  await expect(page.getByTestId('claim-subject-selected')).toContainText(sector.label)
  await expect(page.getByTestId('claim-predicate-select')).toHaveValue('BELONGS_TO_SECTOR')
  await page.getByTestId('claim-swap').click()
  await expect(page.getByTestId('claim-object-selected')).toContainText(sector.label)
  await expect(page.getByTestId('claim-subject-selected')).toHaveCount(0)
  await pick(page, 'claim-subject-picker', company.label)
  await expect(page.getByTestId('claim-subject-selected')).toContainText(company.label)
  await expect(page.getByTestId('claim-sentence')).toContainText('에 속한다')
  await pick(page, 'claim-doc-picker', document.label)
  await page.getByTestId('claim-description').fill(claim.properties.description)
  await page.getByTestId('claim-evidence').fill(claim.properties.evidenceText)
  await page.getByTestId('claim-add-submit').click()

  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  expect(api.lastRequest('POST', '/api/claims').body).toMatchObject({
    predicate: 'BELONGS_TO_SECTOR',
    subjectId: company.id,
    objectId: sector.id,
    documentIds: [document.id],
  })
  const card = page.getByTestId('node-claims-section').locator(`[data-testid="claim-card"][data-claim-id="${claim.id}"]`)
  await expect(card.getByTestId('claim-subject')).toContainText(company.label)
  await expect(card.getByTestId('claim-object')).toContainText(sector.label)
  await shot(page, '02b-claim-from-object')
})

test('2c) 「＋ 추가」 의 주장 줄에서 주장을 만들면 작업 공간에서 새 주장의 상세가 열린다', async ({ page, api }) => {
  const company = api.fixture<Detail>('node-company').node
  const sector = api.fixture('nodes-first-sector').items[0] as NodeView
  const document = api.fixture<Detail>('node-document').node
  const claimNode = api.fixture<Detail>('node-claim').node
  const claim = api.fixture('claim-reviewed')

  hasCandidates(api, 'Company,Security', [company])
  hasCandidates(api, 'Sector', [sector])
  pickable(api, 'Company,Security', [company])
  pickable(api, 'Sector', [sector])
  pickable(api, 'Document', [document])
  api.on('POST', '/api/claims', { status: 201, body: { ...claim, revision: 1, reviewStatus: 'DRAFT', reviewedBy: null, reviewedAt: null, reviewNote: null } })
  api.on('GET', `/api/graph/neighborhood?id=${claimNode.id}&hops=1`, { body: api.fixture('graph-claim') })
  noMark(api, claimNode.id)

  await openApp(page)
  const dialog = await openAdd(page, 'Claim')
  await expect(dialog.getByTestId('add-steps')).not.toContainText('3. 연결하기')
  await page.getByTestId('claim-predicate-select').selectOption('BELONGS_TO_SECTOR')
  await pick(page, 'claim-subject-picker', company.label)
  await pick(page, 'claim-object-picker', sector.label)
  await pick(page, 'claim-doc-picker', document.label)
  await page.getByTestId('claim-description').fill(claim.properties.description)
  await page.getByTestId('claim-evidence').fill(claim.properties.evidenceText)
  await page.getByTestId('claim-add-submit').click()

  // 개념 지도에서 만들어도 창이 닫히고 작업 공간에서 새 주장의 상세가 열린다.
  await expect(dialog).toHaveCount(0)
  expect(api.lastRequest('POST', '/api/claims').body).toMatchObject({ predicate: 'BELONGS_TO_SECTOR', subjectId: company.id, objectId: sector.id, documentIds: [document.id] })
  await expect(page).toHaveURL(new RegExp(`/workspace\\?.*node=${claimNode.id}.*pane=detail`))
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  await expect(page.getByTestId('detail-notice')).toContainText('다른 편집자의 검토를 기다립니다')
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-type', 'Claim')
  await expect(page.getByTestId('detail-label')).toHaveText(`${company.label} → ${sector.label} 속한다`)
})

test('3) 작성자는 「내가 쓰거나 고친 주장」 에서 링크를 복사하고, 검토할 목록에는 자기 주장이 없다', async ({ page, api }) => {
  const mine = api.fixture('claims-mine').items[0]
  // 작성자에게는 자기 주장이 검토할 목록에 오지 않는다(서버가 나눈다).
  api.on('GET', '/api/claims?reviewStatus=DRAFT&scope=reviewable&page=0&size=20', { body: pageOf([]) })

  await openApp(page)
  await openScreen(page, 'review')
  const mineRow = page.getByTestId('review-section-mine').locator(`[data-testid="review-mine-row"][data-claim-id="${mine.id}"]`)
  await expect(mineRow).toBeVisible()
  await expect(page.getByTestId('review-section-reviewable').locator(`[data-claim-id="${mine.id}"]`)).toHaveCount(0)
  await mineRow.getByTestId('review-mine-copy-link').click()
  await expect(mineRow.getByTestId('review-mine-copy-link-done').or(mineRow.getByTestId('review-mine-copy-link-fallback'))).toBeVisible()
  // 클립보드를 쓸 수 없어 주소를 입력칸에 보인 경우에만 새 형식의 주소인지 본다.
  const fallback = mineRow.getByTestId('review-mine-copy-link-fallback')
  if (await fallback.isVisible()) await expect(fallback).toHaveValue(new RegExp(`/workspace\\?node=${mine.id}`))
  await shot(page, '03-review-mine-a')
})

test.describe('작성자가 아닌 검토자', () => {
  // 스냅샷의 주장은 편집자(Alice)가 썼다. 화면은 작성자의 검토 칸을 막으므로 다른 사용자(관리자)로 검토한다.
  test.use({ role: 'ADMIN' })

  test('3) 검토 대기 탭에서 주장을 검토 완료하면 목록에서 빠진다', async ({ page, api }) => {
    const pending = api.fixture('claims-pending-review').items[0]
    const note = '공시 원문과 대조함'
    // 검토할 목록은 스냅샷 그대로이고, 검토를 보내면 다시 읽은 목록에서 빠진다.
    let reviewed = false
    api.on('GET', '/api/claims?reviewStatus=DRAFT&scope=reviewable&page=0&size=20', () => ({ body: reviewed ? pageOf([]) : api.fixture('claims-pending-review') }))
    api.on('GET', '/api/claims?reviewStatus=DRAFT&scope=mine&page=0&size=20', { body: pageOf([]) })
    api.on('POST', `/api/claims/${pending.id}/review`, (req) => {
      reviewed = true
      return { body: { ...pending, revision: pending.revision + 1, reviewStatus: 'REVIEWED', reviewNote: (req.body as { note: string }).note } }
    })

    await openApp(page)
    await openScreen(page, 'review')
    const row = page.getByTestId('review-section-reviewable').getByTestId('review-row').filter({ hasText: pending.subject.label })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(pending.object.label)
    await row.getByTestId('review-row-note').fill(note)
    await row.getByTestId('review-row-approve').click()

    await expect(page.getByTestId('review-message')).toContainText(pending.label)
    await expect(row).toHaveCount(0)
    expect(api.lastRequest('POST', `/api/claims/${pending.id}/review`).body).toEqual({ expectedRevision: pending.revision, status: 'REVIEWED', note })
    await shot(page, '03-reviewed-by-b')
  })
})

test('4) 기업 주변 그래프와 근거, 검토자를 확인한다', async ({ page, api }) => {
  const companyDetail = api.fixture<Detail>('node-company')
  const company = companyDetail.node
  const claim = api.fixture('claim-reviewed')
  const document = claim.documents[0]
  noMark(api, claim.id)

  await openApp(page)
  await searchAndOpen(page, searchQuery(api), company.label)

  const canvas = page.getByTestId('graph-canvas')
  await expect(canvas).toHaveAttribute('data-collapsed-claims', '1')
  const card = page.getByTestId('node-claims-section').locator(`[data-testid="claim-card"][data-claim-id="${claim.id}"]`)
  const claimItem = page.locator(`[data-testid="graph-node"][data-node-id="${claim.id}"]`)
  const node = (n: NodeRef) => page.locator(`[data-testid="graph-node"][data-node-id="${n.id}"]`)
  const documents = page.locator('[data-testid="graph-node"][data-node-type="Document"]').filter({ hasText: document.title })
  // 주장은 기업에서 산업으로 가는 선 하나로 접혀 있고, 목록에는 접힌 주장으로 남는다
  await expect(claimItem).toHaveAttribute('data-collapsed', 'true')
  await expect(claimItem).toHaveAttribute('data-review-status', 'REVIEWED')
  await expect(claimItem).toContainText(claim.label)
  await expect(node(claim.object)).toHaveCount(1)

  await expect(card).toHaveAttribute('data-review-status', 'REVIEWED')
  await expect(card.getByTestId('claim-evidence-text')).toHaveText(claim.properties.evidenceText)
  await expect(card.getByTestId('claim-document-title')).toHaveText(document.title)
  await expect(card.getByTestId('claim-reviewer')).toHaveText(claim.reviewedBy.displayName)
  await expect(card.getByTestId('claim-review-note')).toContainText(claim.reviewNote)
  await shot(page, '04-graph-and-evidence')

  // 접힌 주장을 골라 이웃 확장해도 새로 오는 것은 숨긴 문서뿐이라 화면이 그대로다
  await claimItem.locator('button').click()
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', claim.id)
  await page.getByTestId('graph-expand').click()
  await expect(page.getByTestId('graph-loading')).toHaveCount(0)
  expect(api.lastRequest('GET', '/api/graph/neighborhood').query).toBe(`id=${claim.id}&hops=1`)
  await expect(node(company)).toHaveCount(1)
  await expect(node(claim.object)).toHaveCount(1)
  await expect(documents).toHaveCount(0)
  await expect(canvas).toHaveAttribute('data-collapsed-claims', '1')

  // 주장을 따로 보면 마름모 노드와 근거 문서가 나온다
  await openAdvancedFilters(page)
  await page.getByTestId('graph-claims-as-nodes').setChecked(true)
  await expect(canvas).toHaveAttribute('data-collapsed-claims', '0')
  await expect(documents).toHaveCount(1)
  await expect(claimItem).toHaveAttribute('data-collapsed', 'false')
  await shot(page, '04-expanded')

  await page.getByTestId('graph-claims-as-nodes').setChecked(false)
  await expect(canvas).toHaveAttribute('data-collapsed-claims', '1')
})

test('4d) 상세는 읽기 카드로 열리고 편집을 눌러야 폼이 열린다', async ({ page, api }) => {
  const company = api.fixture<Detail>('node-company').node as NodeView & { createdBy: { displayName: string } }

  await openApp(page)
  await searchAndOpen(page, searchQuery(api), company.label)
  await expect(page.getByTestId('node-props')).toBeVisible()
  await expect(page.locator('[data-testid="node-prop"][data-prop="name"]')).toContainText(company.label)
  // enum 은 저장 값(KR)이 아니라 선택지 이름으로 보인다.
  await expect(page.locator('[data-testid="node-prop"][data-prop="country"]')).toContainText('대한민국 (KR)')
  await expect(page.locator('[data-testid^="edit-prop-"]')).toHaveCount(0)
  await expect(page.getByTestId('node-save')).toHaveCount(0)
  // 만든 사람 이름(Alice)은 받침 없이 끝나 「가」 가 붙는다.
  await expect(page.getByTestId('node-created-line')).toContainText(`${company.createdBy.displayName}가 `)
  await expect(page.getByTestId('node-created-line')).toContainText('에 등록')
  await expect(page.getByTestId('node-meta-details')).not.toHaveAttribute('open', '')
  await shot(page, 'detail-read-card')

  await page.getByTestId('node-edit').click()
  await expect(page.getByTestId('node-edit-form')).toBeVisible()
  await expect(page.getByTestId('edit-prop-name')).toHaveValue(company.label)
  await expect(page.getByTestId('node-props')).toHaveCount(0)
  await page.getByTestId('node-edit-cancel').click()
  await expect(page.getByTestId('node-edit-form')).toHaveCount(0)
  await expect(page.getByTestId('node-props')).toBeVisible()
})

test('5) 다른 사람이 먼저 저장했으면 409 안내 뒤 최신 값을 보이고, 내 입력을 골라 다시 적용해 저장한다', async ({ page, api }) => {
  const detail = api.fixture<Detail>('node-company')
  const company = detail.node
  const conflict = api.fixture('node-patch-conflict')
  // 다른 편집자가 먼저 고친 값. 스냅샷 서버에서 409 를 만들 때 먼저 저장한 값과 같다.
  const theirs = 'B 가 먼저 고친 메모'
  const mineDescription = '내가 고친 메모'
  const mineRegistration = '110111-1234567'

  let current: NodeView = company
  api.on('GET', `/api/nodes/${company.id}`, () => ({ body: { ...detail, node: current } }))
  let firstSave = true
  api.on('PATCH', `/api/nodes/${company.id}`, (req) => {
    if (firstSave) {
      firstSave = false
      // 화면이 상세를 읽은 뒤 다른 편집자가 저장해 revision 이 올라갔다.
      current = { ...company, revision: company.revision + 1, properties: { ...company.properties, description: theirs } }
      return { status: 409, body: conflict }
    }
    const { properties } = req.body as { properties: Record<string, unknown> }
    current = { ...current, revision: current.revision + 1, properties: { ...current.properties, ...properties } }
    return { body: current }
  })

  await openApp(page)
  await searchAndOpen(page, searchQuery(api), company.label)
  await expect(page.getByTestId('node-revision')).toHaveText(String(company.revision))
  await page.getByTestId('node-edit').click()
  await page.getByTestId('edit-prop-description').fill(mineDescription)
  await page.getByTestId('edit-prop-registrationNumber').fill(mineRegistration)
  await page.getByTestId('node-save').click()
  // 화면은 바꾼 속성만 보낸다.
  const notice = page.getByTestId('detail-notice')
  await expect(notice).toHaveAttribute('data-kind', 'conflict')
  expect(api.lastRequest('PATCH', `/api/nodes/${company.id}`).body).toEqual({
    expectedRevision: company.revision,
    properties: { description: mineDescription, registrationNumber: mineRegistration },
  })
  await expect(notice).toContainText('다른 탭이나 다른 사용자가 먼저 저장했습니다')
  await expect(notice).not.toContainText('서버 응답')
  // 409 뒤에도 편집 폼은 열린 채로 비교를 보인다.
  await expect(page.getByTestId('node-edit-form')).toBeVisible()
  await expect(page.getByTestId('edit-prop-description')).toHaveValue(theirs)
  await expect(page.locator('[data-testid="edit-conflict-field"][data-field="description"]')).toHaveAttribute('data-kind', 'both')
  await expect(page.locator('[data-testid="edit-conflict-field"][data-field="registrationNumber"]')).toHaveAttribute('data-kind', 'mine')
  await expect(page.getByTestId('node-revision')).toHaveText(String(company.revision + 1))
  await shot(page, '05-conflict-b')

  await page.getByTestId('edit-conflict-choice-description-mine').check()
  await page.getByTestId('edit-conflict-apply').click()
  await expect(page.getByTestId('edit-prop-description')).toHaveValue(mineDescription)
  await expect(page.getByTestId('edit-prop-registrationNumber')).toHaveValue(mineRegistration)
  await expect(page.getByTestId('edit-conflict')).toHaveCount(0)
  // 단추가 폼을 제출하지 않았다는 근거다.
  await expect(page.getByTestId('node-edit-local-message')).toContainText('내 입력을 다시 넣었습니다')
  await expect(page.getByTestId('node-edit-local-message')).not.toContainText('바뀐 내용이 없습니다')
  expect(bodiesOf(api, 'PATCH', `/api/nodes/${company.id}`)).toHaveLength(1)
  await shot(page, '05-reapplied-b')

  await page.getByTestId('node-save').click()
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  expect(api.lastRequest('PATCH', `/api/nodes/${company.id}`).body).toEqual({
    expectedRevision: company.revision + 1,
    properties: { description: mineDescription, registrationNumber: mineRegistration },
  })
  await expect(page.getByTestId('node-revision')).toHaveText(String(company.revision + 2))
  // 저장에 성공하면 읽기 카드로 돌아온다.
  await expect(page.getByTestId('node-edit-form')).toHaveCount(0)
  await expect(page.getByTestId('node-props')).toBeVisible()
})

test('6) 보관하면 기본 검색에서 빠지고, 복원하면 이력에 ARCHIVE 와 RESTORE 가 남는다', async ({ page, api }) => {
  const detail = api.fixture<Detail>('node-archive-target')
  const target = detail.node
  const archivedNode = api.fixture<NodeView>('node-archive')
  const restoredNode = api.fixture<NodeView>('node-restore')
  const reason = String(api.fixture('changes-archive-target').items.find((e: { action: string }) => e.action === 'ARCHIVE').note)

  let current: NodeView = target
  api.on('GET', `/api/nodes/${target.id}`, () => ({ body: { ...detail, node: current } }))
  api.on('POST', `/api/nodes/${target.id}/archive`, () => {
    current = archivedNode
    return { body: archivedNode }
  })
  api.on('POST', `/api/nodes/${target.id}/restore`, () => {
    current = restoredNode
    return { body: restoredNode }
  })
  // 기본 검색은 보관한 노드를 빼고, 「보관 포함」 검색은 넣는다.
  const q = encodeURIComponent(target.label)
  api.on('GET', `/api/nodes?q=${q}&page=0&size=20`, () => ({ body: pageOf(current.archived ? [] : [current]) }))
  api.on('GET', `/api/nodes?q=${q}&includeArchived=true&page=0&size=20`, () => ({ body: pageOf([current]) }))
  api.on('GET', `/api/graph/neighborhood?id=${target.id}&hops=1`, { body: graphOf(api, target) })
  noMark(api, target.id)

  await openApp(page)
  await searchAndOpen(page, target.label, target.label)
  await archiveFromDetail(page, reason)
  expect(api.lastRequest('POST', `/api/nodes/${target.id}/archive`).body).toEqual({ expectedRevision: target.revision, reason })
  await expect(page.getByTestId('detail-archived')).toBeVisible()
  // 보관된 항목에는 「편집」 이 없다.
  await expect(page.getByTestId('node-edit')).toHaveCount(0)

  // 기본 검색에서는 보이지 않는다.
  await page.getByTestId('search-input').fill(target.label)
  await page.getByTestId('search-submit').click()
  await expect(page.getByTestId('search-empty')).toBeVisible()
  await expect(searchResult(page, target.label)).toHaveCount(0)

  // 「보관 포함」 으로 찾아 복원한다.
  await openAdvancedFilters(page)
  await page.getByTestId('filter-include-archived').setChecked(true)
  await page.getByTestId('search-submit').click()
  await searchResult(page, target.label).click()
  await expect(page.getByTestId('detail-archived')).toBeVisible()
  await detailMenu(page, 'node-restore-button')
  await expect(page.getByTestId('detail-notice')).toHaveAttribute('data-kind', 'success')
  expect(api.lastRequest('POST', `/api/nodes/${target.id}/restore`).body).toEqual({ expectedRevision: archivedNode.revision })
  await expect(page.getByTestId('detail-archived')).toHaveCount(0)

  await detailMenu(page, 'node-history-link')
  await expect(page.getByTestId('changes-tab')).toBeVisible()
  await expect(page.locator('[data-testid="change-row"][data-action="ARCHIVE"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="change-row"][data-action="RESTORE"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="change-row"][data-action="ARCHIVE"] li').filter({ hasText: '보관: 아니오 → 예' })).toHaveCount(1)
  await shot(page, '06-archive-restore-history')
})

test('6b) 유일한 근거 문서를 보관하려 하면 해당 주장을 여는 버튼이 나온다', async ({ page, api }) => {
  const document = api.fixture<Detail>('node-document').node
  const claim = api.fixture<Detail>('node-claim').node
  const claimIds: string[] = api.fixture('node-archive-last-evidence').details.claimIds
  api.on('GET', `/api/graph/neighborhood?id=${document.id}&hops=1`, { body: graphOf(api, document) })
  api.on('GET', `/api/graph/neighborhood?id=${claim.id}&hops=1`, { body: api.fixture('graph-claim') })
  noMark(api, document.id, claim.id)

  await openApp(page)
  await searchAndOpen(page, searchQuery(api), document.label)
  // 실패해도 보관 창은 닫히고 오류는 상세 위에 보인다.
  await archiveFromDetail(page)
  expect(api.lastRequest('POST', `/api/nodes/${document.id}/archive`).body).toEqual({ expectedRevision: document.revision, reason: null })
  const notice = page.getByTestId('detail-notice')
  await expect(notice).toHaveAttribute('data-kind', 'error')
  await expect(notice).toContainText('그 주장을 먼저 보관하세요')
  await expect(notice).not.toContainText('근거를 더하거나')
  // 그 문서만 근거로 쓰는 주장마다 여는 단추가 있다.
  await expect(notice.getByTestId('notice-action')).toHaveCount(claimIds.length)
  await shot(page, '06b-last-evidence')
  await notice.getByTestId('notice-action').nth(claimIds.indexOf(claim.id)).click()
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', claim.id)
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-type', 'Claim')
  // 주장 상세에는 「이 항목에 걸린 주장」 절이 없고, 수정 폼은 「다시 검토」 안내를 쓴다. revision 은 「자세히」 안에 있다.
  await expect(page.getByTestId('node-claims-section')).toHaveCount(0)
  await expect(page.getByTestId('claim-edit-form')).toHaveCount(0)
  await page.getByTestId('node-edit').click()
  await expect(page.getByTestId('claim-edit-form')).toContainText('다시 검토를 받아야 합니다')
  await expect(page.getByTestId('claim-edit-confidence')).toHaveCount(0)
  await expect(page.getByTestId('node-meta-details')).not.toHaveAttribute('open', '')
})

test('6c) 변경 이력에서 사용자를 표시 이름으로 고르고 주장 이력의 주체와 대상이 이름으로 보인다', async ({ page, api }) => {
  const actors = api.fixture('changes-actors') as { email: string; displayName: string }[]
  const reviewer = actors.find((a) => a.email !== api.fixture('auth-me-editor').email)!
  const company = api.fixture<Detail>('node-company').node
  const claim = api.fixture('claim-reviewed')
  api.on('GET', `/api/nodes?q=${encodeURIComponent(company.label)}&size=10`, { body: pageOf([company]) })
  api.on('GET', `/api/graph/neighborhood?id=${claim.id}&hops=1`, { body: api.fixture('graph-claim') })
  noMark(api, claim.id)

  await openApp(page)
  await openScreen(page, 'changes')
  await expect(page.getByTestId('changes-tab')).toBeVisible()
  const actorSelect = page.getByTestId('changes-actor-filter')
  for (const a of actors) await expect(actorSelect).toContainText(a.displayName)
  await actorSelect.selectOption({ value: reviewer.email })
  await expect
    .poll(async () => [...new Set(await page.getByTestId('change-actor').allTextContents())].join('|'))
    .toBe(reviewer.displayName)

  await actorSelect.selectOption({ value: '' })
  await page.getByTestId('changes-target-picker-input').fill(company.label)
  await page.getByTestId('changes-target-picker-search').click()
  await page.getByTestId('changes-target-picker-result').filter({ hasText: company.label }).first().click()
  await expect(page.getByTestId('changes-target-selected')).toContainText(company.label)
  const rows = page.getByTestId('change-row')
  await expect(rows.first()).toBeVisible()
  await expect.poll(async () => [...new Set(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-target-id'))))]).toEqual([company.id])

  // 주장은 기업 이름으로 검색되지 않으므로(docs/prd.md 「남은 한계」) 링크로 연다.
  await page.goto('/?node=' + claim.id)
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', claim.id)
  await detailMenu(page, 'node-history-link')
  const created = page.locator('[data-testid="change-row"][data-action="CREATE"]')
  await expect(created).toHaveCount(1)
  await expect(created).toContainText('주체')
  await expect(created).toContainText(claim.subject.label)
  await expect(created).toContainText('대상')
  await expect(created).toContainText(claim.object.label)
  await expect(created).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  await shot(page, '06c-changes-names')
})
