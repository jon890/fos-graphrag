import type { Page } from '@playwright/test'
import { exact, openScreen } from './support'
import { expect, shot, test, type MockApi } from './mock/test'

// 공부를 돕는 화면을 확인한다. 근거 따라가기의 단계와 빈 관계 잇기, 이해 표시와 공부 탭, 개념 칩과 개념 상세, 개념 지도의 글자 크기.
// 응답은 가짜 API 의 스냅샷이다. 쓰기는 화면이 보낸 요청을 확인하고, 쓴 뒤의 응답은 테스트가 스냅샷을 고쳐 준다.
// 표시가 본인에게만 보이는 것과 빈 관계의 후보는 서버 테스트(learning/KnowledgeMarkIntegrationTest, learning/TraceIntegrationTest)가 맡는다.

interface NodeRef {
  id: string
  type: string
  label: string
}

interface TraceStep {
  node: NodeRef & Record<string, unknown>
  depth: number
  status: string
  concepts: unknown[]
  missing: { relationshipType: string; candidates: NodeRef[] }[]
  knowledge: unknown
  [key: string]: unknown
}

interface Trace {
  rootId: string
  steps: TraceStep[]
  [key: string]: unknown
}

/** 검색 결과 한 쪽. 스냅샷의 노드 목록 응답과 같은 모양이다 */
function pageOf<T>(items: T[]): { items: T[]; page: number; size: number; totalItems: number; totalPages: number } {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 }
}

/** 상세가 부르는 내 이해 표시를 「표시 없음」 으로 준다 */
function noMark(api: MockApi, ...nodeIds: string[]): void {
  for (const nodeId of nodeIds) api.on('GET', `/api/me/knowledge/${nodeId}`, { body: { ...api.fixture<Record<string, unknown>>('knowledge-mark-none'), nodeId } })
}

/** 노드 하나뿐인 주변 그래프. 스냅샷 그래프의 모양에 중심만 바꿔 넣는다 */
function graphOf(api: MockApi, node: NodeRef): Record<string, unknown> {
  return { ...api.fixture('graph-company'), centerId: node.id, nodes: [{ id: node.id, type: node.type, label: node.label, reviewStatus: null, predicate: null }], edges: [] }
}

/** 개념 상세 스냅샷에서 상세 응답의 concepts 한 줄을 만든다 */
function conceptRef(api: MockApi): { id: string; label: string; summary: string; relationshipType: string } {
  const node = api.fixture('node-concept').node
  return { id: node.id, label: node.label, summary: node.properties.summary, relationshipType: 'USES_CONCEPT' }
}

/** 근거 따라가기 화면에서 이름이 같은 단계 카드 */
function traceStep(page: Page, name: string) {
  return page.getByTestId('trace-step').filter({ has: page.getByTestId('trace-step-name').filter({ hasText: exact(name) }) })
}

/** 로그인된 첫 화면(개념 지도)을 연다 */
async function openApp(page: Page, startPath = '/'): Promise<void> {
  await page.goto(startPath)
  await expect(page.getByTestId('current-user-name')).toBeVisible()
}

test.beforeEach(({ api }) => {
  // 작업 공간의 검색 칸은 검색어 없이 첫 쪽을 부른다. 서버의 이 응답은 초기 데이터가 섞여 스냅샷으로 남기지 않고 검색 결과로 대신한다.
  api.on('GET', '/api/nodes?page=0&size=20', { body: api.fixture('nodes-search') })
})

test('7c) 결정의 근거 따라가기가 변화까지 단계를 보이고, 후보 밸류에이션을 이으면 그 단계가 생긴다', async ({ page, api }) => {
  const trace = api.fixture<Trace>('node-decision-trace')
  const decision = trace.steps.find((s) => s.depth === 0)!.node
  const valuationStep = trace.steps.find((s) => s.node.type === 'Valuation')!
  const valuation = valuationStep.node
  const bottleneck = trace.steps.find((s) => s.node.type === 'Bottleneck')!.node
  const change = trace.steps.find((s) => s.node.type === 'Change')!.node
  const concept = conceptRef(api)
  const basedOn = api.fixture('node-decision').relationships.find((r: { type: string }) => r.type === 'BASED_ON')

  // 잇기 전에는 밸류에이션 단계가 없고 결정에 BASED_ON 이 빈 관계로 남아 후보를 보인다.
  // 이은 뒤에는 스냅샷 그대로이고, 밸류에이션은 개념 상세 스냅샷의 개념을 쓴다.
  let linked = false
  const before: Trace = {
    ...trace,
    steps: trace.steps
      .filter((s) => s !== valuationStep)
      .map((s) =>
        s.depth === 0 ? { ...s, missing: [{ relationshipType: 'BASED_ON', candidates: [{ id: valuation.id, type: valuation.type, label: valuation.label }] }] } : s,
      ),
  }
  const after: Trace = { ...trace, steps: trace.steps.map((s) => (s === valuationStep ? { ...s, concepts: [concept] } : s)) }
  api.on('GET', `/api/nodes/${decision.id}/trace`, () => ({ body: linked ? after : before }))
  api.on('POST', '/api/relationships', () => {
    linked = true
    return { status: 201, body: basedOn }
  })
  api.on('GET', `/api/nodes?q=${encodeURIComponent(decision.label)}&page=0&size=20`, {
    body: pageOf(api.fixture('nodes-search').items.filter((n: NodeRef) => n.id === decision.id)),
  })
  noMark(api, decision.id)

  await openApp(page)
  await openScreen(page, 'workspace')
  await page.getByTestId('search-input').fill(decision.label)
  await page.getByTestId('search-submit').click()
  await page.getByTestId('search-result').filter({ has: page.locator('.result-label', { hasText: exact(decision.label) }) }).click()
  await expect(page.getByTestId('detail-label')).toHaveText(exact(decision.label))
  await page.getByTestId('node-trace').click()
  await expect(page).toHaveURL(/\/trace\?node=/)

  // 결정에서 종목, 기업, 병목, 변화까지 이어진다. 가장 깊은 단계(변화)가 출발점이다.
  const root = page.locator('[data-testid="trace-step"][data-role="root"]')
  await expect(root).toHaveCount(1)
  await expect(root.getByTestId('trace-step-name')).toHaveText(exact(decision.label))
  await expect(traceStep(page, change.label)).toHaveAttribute('data-role', 'origin')
  await expect(traceStep(page, bottleneck.label)).toHaveAttribute('data-status', 'SUPPORTED')
  await expect(traceStep(page, valuation.label)).toHaveCount(0)

  const summary = page.getByTestId('trace-summary')
  await expect(summary).toHaveAttribute('data-steps', String(before.steps.length))
  const missing = root.locator('[data-testid="trace-missing"][data-relationship="BASED_ON"]')
  await expect(missing).toBeVisible()
  await missing.getByTestId('trace-candidate-link').filter({ hasText: valuation.label }).click()

  // 후보를 고르면 그 후보에서 결정으로 관계를 잇고 따라가기를 다시 읽는다.
  await expect(summary).toHaveAttribute('data-steps', String(before.steps.length + 1))
  expect(api.lastRequest('POST', '/api/relationships').body).toEqual({ type: 'BASED_ON', fromId: valuation.id, toId: decision.id })
  const valuationCard = traceStep(page, valuation.label)
  await expect(valuationCard).toBeVisible()
  await expect(valuationCard.getByTestId('concept-chip').filter({ hasText: exact(`개념 · ${concept.label}`) })).toBeVisible()
  await shot(page, 'trace-wide')
})

test('7d) 근거 따라가기에서 남긴 이해 표시와 메모가 공부 탭에 단계 맥락과 함께 모인다', async ({ page, api }) => {
  const trace = api.fixture<Trace>('node-decision-trace')
  const decision = trace.steps.find((s) => s.depth === 0)!.node
  // 공부 탭 스냅샷의 항목(병목)을 표시한다. 메모는 스냅샷의 메모와 같게 적는다.
  const study = api.fixture('knowledge-study')
  const studied = study.items[0]
  const stepId: string = studied.node.id
  const mark = api.fixture('knowledge-mark')
  const note: string = mark.note
  const summaryFixture = api.fixture('knowledge-summary')

  // 그 단계는 아직 표시하지 않은 상태로 시작한다.
  api.on('GET', `/api/nodes/${decision.id}/trace`, {
    body: { ...trace, steps: trace.steps.map((s) => (s.node.id === stepId ? { ...s, knowledge: null } : s)) },
  })
  api.on('PUT', `/api/me/knowledge/${stepId}`, (req) => ({ body: { ...mark, ...(req.body as object), nodeId: stepId } }))

  await openApp(page, `/trace?node=${decision.id}`)
  const step = page.locator(`[data-testid="trace-step"][data-node-id="${stepId}"]`)
  await expect(step).toBeVisible()
  await expect(page.getByTestId('trace-summary')).toHaveAttribute('data-unsure', '0')

  await step.getByTestId('knowledge-unsure').click()
  await expect(step.getByTestId('knowledge-unsure')).toHaveAttribute('aria-pressed', 'true')
  expect(api.lastRequest('PUT', `/api/me/knowledge/${stepId}`).body).toEqual({ level: 'UNSURE', note: null })
  await step.getByTestId('knowledge-note-open').click()
  await step.getByTestId('knowledge-note-input').fill(note)
  await step.getByTestId('knowledge-note-save').click()
  await expect(step.getByTestId('knowledge-note')).toContainText(note)
  expect(api.lastRequest('PUT', `/api/me/knowledge/${stepId}`).body).toEqual({ level: 'UNSURE', note })
  await expect(page.getByTestId('trace-summary')).toHaveAttribute('data-unsure', '1')

  // 공부 탭에 단계 맥락(그 단계를 근거로 둔 결정)과 메모가 함께 모인다.
  await openScreen(page, 'study')
  const item = page.locator(`[data-testid="study-item"][data-node-id="${stepId}"]`)
  await expect(item).toBeVisible()
  await expect(item.getByTestId('study-item-name')).toHaveText(studied.node.label)
  await expect(item.getByTestId('study-item-context')).toContainText(decision.label)
  await expect(item.getByTestId('study-item-note')).toContainText(note)
  const counts = page.getByTestId('study-counts')
  await expect(counts).toHaveAttribute('data-known', String(summaryFixture.counts.KNOWN))
  await shot(page, 'study-wide')

  // 「이해했어요」 를 누르면 KNOWN 으로 쓰고, 다시 읽은 목록에서 빠지며 이해함 개수가 하나 는다.
  api.on('GET', '/api/me/knowledge?level=UNSURE%2CLEARNING&page=0&size=20', { body: pageOf([]) })
  api.on('GET', '/api/me/knowledge/summary', {
    body: { ...summaryFixture, counts: { ...summaryFixture.counts, KNOWN: summaryFixture.counts.KNOWN + 1, UNSURE: summaryFixture.counts.UNSURE - 1 } },
  })
  await item.getByTestId('study-known').click()
  await expect(item).toHaveCount(0)
  await expect(counts).toHaveAttribute('data-known', String(summaryFixture.counts.KNOWN + 1))
  expect(api.lastRequest('PUT', `/api/me/knowledge/${stepId}`).body).toEqual({ level: 'KNOWN', note: studied.note })
})

test('7e) 개념 칩은 한 줄 정의를 보이고 개념 상세는 쓴 곳을 보인다', async ({ page, api }) => {
  const valuation = api.fixture<Trace>('node-decision-trace').steps.find((s) => s.node.type === 'Valuation')!.node
  const conceptDetail = api.fixture('node-concept')
  const concept = conceptRef(api)
  // 밸류에이션 상세는 개념 상세 스냅샷의 개념을 쓴다.
  api.on('GET', `/api/nodes/${valuation.id}`, { body: { ...api.fixture<Record<string, unknown>>('node-company'), node: valuation, relationships: [], claims: [], concepts: [concept] } })
  api.on('GET', `/api/graph/neighborhood?id=${valuation.id}&hops=1`, { body: graphOf(api, valuation) })
  api.on('GET', `/api/graph/neighborhood?id=${concept.id}&hops=1`, { body: graphOf(api, conceptDetail.node) })
  noMark(api, valuation.id, concept.id)

  await openApp(page, `/workspace?node=${valuation.id}&pane=detail`)
  await expect(page.getByTestId('detail-label')).toHaveText(exact(valuation.label))
  const chip = page.getByTestId('detail-panel').getByTestId('concept-chip').filter({ hasText: exact(`개념 · ${concept.label}`) })
  await chip.hover()
  await expect(page.getByTestId('concept-summary')).toHaveText(concept.summary)
  await chip.click()
  await expect(page.getByTestId('detail-label')).toHaveText(exact(concept.label))
  const usedBy = page.locator('[data-testid="concept-section"][data-section="used-by"]')
  await expect(usedBy.getByTestId('concept-section-item').filter({ hasText: valuation.label })).toBeVisible()
  await shot(page, 'concept-wide')
})

test('7f) 넓은 화면 개념 지도의 노드 글자는 13px 이상이다', async ({ page }) => {
  await openApp(page, '/map')
  const canvas = page.getByTestId('concept-map-canvas')
  await expect(canvas).toHaveAttribute('data-layout-done', 'true')
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-node-font-px')), { message: '개념 지도 노드 글자 크기(px)' })
    .toBeGreaterThanOrEqual(13)
  await shot(page, 'map-wide')
})
