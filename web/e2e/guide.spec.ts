import type { Page } from '@playwright/test'
import { expect, shot, test, type MockApi } from './mock/test'

// 첫 접속 가이드를 확인한다. 열람자의 둘러보기, 편집자의 따라하기, 새로고침 뒤 이어서 하기.
// 응답은 가짜 API 의 스냅샷이다. auth-me-* 스냅샷은 가이드를 끝낸 사용자라 처음 접속하는 사용자는 guideDoneAt 을 비워 준다.
// 연습 항목을 만들고 보관하는 요청은 화면이 보낸 것을 확인한다. 끝낸 기록을 한 번만 남기는 것은 서버 테스트(AuthIntegrationTest)가 맡는다.

interface NodeRef {
  id: string
  type: string
  label: string
}

interface NodeView extends NodeRef {
  properties: Record<string, unknown>
  revision: number
  archived: boolean
  [key: string]: unknown
}

const PRACTICE_ARCHIVE_REASON = '첫 접속 가이드 연습 항목'

/** 목록 한 쪽. 스냅샷의 쪽 응답과 같은 모양이다 */
function pageOf<T>(items: T[]): { items: T[]; page: number; size: number; totalItems: number; totalPages: number } {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 }
}

/** 지금까지 받은 GET /api/ontology 요청 수 */
function ontologyRequestCount(api: MockApi): number {
  return api.requests.filter((r) => r.method === 'GET' && r.path === '/api/ontology').length
}

/** 새로고침 뒤 온톨로지 요청이 들어오고, 그 응답을 화면이 그릴 시간(두 프레임)이 지날 때까지 기다린다 */
async function waitOntologyRendered(page: Page, api: MockApi, before: number): Promise<void> {
  await expect.poll(() => ontologyRequestCount(api), { message: '새로고침 뒤 온톨로지 요청' }).toBeGreaterThan(before)
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
}

/** 노드 하나뿐인 주변 그래프. 스냅샷 그래프의 모양에 중심만 바꿔 넣는다 */
function graphOf(api: MockApi, node: NodeRef): Record<string, unknown> {
  return { ...api.fixture('graph-company'), centerId: node.id, nodes: [{ id: node.id, type: node.type, label: node.label, reviewStatus: null, predicate: null }], edges: [] }
}

/**
 * 처음 접속한 사용자. 가이드를 끝냈다는 기록(POST /api/auth/me/guide-done)을 보내기 전까지 guideDoneAt 이 비어 있다.
 * 끝낸 기록을 보낸 뒤에는 스냅샷 그대로다.
 */
function firstVisit(api: MockApi, fixture: string): void {
  const me = api.fixture(fixture)
  const done = () => api.requests.some((r) => r.method === 'POST' && r.path === '/api/auth/me/guide-done')
  api.on('GET', '/api/auth/me', () => ({ body: done() ? me : { ...me, guideDoneAt: null } }))
  api.on('POST', '/api/auth/me/guide-done', { body: me })
}

/**
 * 따라하기가 만드는 연습 항목. 스냅샷 노드의 모양에 id 와 이름만 바꿔 넣는다.
 * 만들면 상세와 그래프, 이해 표시를 주고, 보관하면 보관된 상세를 준다.
 */
class PracticeItems {
  private readonly archived = new Set<string>()
  company: NodeView
  document: NodeView
  readonly claim: Record<string, unknown> & { id: string }

  constructor(private readonly api: MockApi) {
    const company = api.fixture('node-company').node as NodeView
    const document = api.fixture('node-document').node as NodeView
    this.company = { ...company, id: company.id.replace(/.$/, 'a') }
    this.document = { ...document, id: document.id.replace(/.$/, 'b') }
    const claim = api.fixture('claim-reviewed')
    this.claim = { ...claim, id: claim.id.replace(/.$/, 'c'), revision: 1, reviewStatus: 'DRAFT', reviewedBy: null, reviewedAt: null, reviewNote: null }
    api.on('POST', '/api/claims', { status: 201, body: this.claim })
  }

  /** 만들기 창에 채워진 이름으로 만들기 응답과 그 뒤의 상세를 준다. 저장 전 같은 이름 찾기는 비어 있다 */
  name(type: 'Company' | 'Document', label: string): void {
    const key = type === 'Company' ? 'company' : 'document'
    const labelProperty = type === 'Company' ? 'name' : 'title'
    const node: NodeView = { ...this[key], label, properties: { ...this[key].properties, [labelProperty]: label } }
    this[key] = node
    this.api.on('GET', `/api/nodes?q=${encodeURIComponent(label)}&types=${type}&size=100`, { body: pageOf([]) })
    // 보관한 뒤에는 검색에 나오지 않는다.
    this.api.on('GET', `/api/nodes?q=${encodeURIComponent(label)}&page=0&size=20`, () => ({ body: pageOf(this.archived.has(node.id) ? [] : [node]) }))
    this.api.on('POST', '/api/nodes', (req) => {
      const sent = (req.body as { type: string }).type
      return sent === 'Company' ? { status: 201, body: this.company } : { status: 201, body: this.document }
    })
    this.serve(node)
  }

  private serve(node: NodeView): void {
    const detail = () => ({ ...this.api.fixture('node-company'), node: { ...node, archived: this.archived.has(node.id) }, relationships: [], claims: [], concepts: [] })
    this.api.on('GET', `/api/nodes/${node.id}`, () => ({ body: detail() }))
    this.api.on('GET', `/api/graph/neighborhood?id=${node.id}&hops=1`, { body: graphOf(this.api, node) })
    this.api.on('GET', `/api/me/knowledge/${node.id}`, { body: { ...this.api.fixture<Record<string, unknown>>('knowledge-mark-none'), nodeId: node.id } })
    this.api.on('POST', `/api/nodes/${node.id}/archive`, () => {
      this.archived.add(node.id)
      return { body: { ...node, archived: true } }
    })
  }

  /** 주장의 상세. 따라하기를 끝내면 주장부터 보관한다 */
  serveClaim(): void {
    const claimNode = { ...(this.api.fixture('node-claim').node as NodeView), id: this.claim.id }
    this.serve(claimNode)
  }

  /** 보관 요청을 보낸 연습 항목 id */
  archiveRequests(): { id: string; body: unknown }[] {
    return this.api.requests
      .filter((r) => r.method === 'POST' && /^\/api\/nodes\/[^/]+\/archive$/.test(r.path))
      .map((r) => ({ id: r.path.split('/')[3], body: r.body }))
  }
}

/** 머리글 「＋ 추가」 에서 타입을 골라 만들기 창을 연다 */
async function openAdd(page: Page, type: string) {
  await page.getByTestId('add-open').click()
  await page.getByTestId(`add-type-${type}`).click()
  const dialog = page.getByTestId('add-dialog')
  await expect(dialog).toHaveAttribute('data-type', type)
  return dialog
}

/** 노드 고르기 입력에서 검색해 정확히 그 이름의 결과를 고른다 */
async function pick(page: Page, prefix: string, label: string): Promise<void> {
  await page.getByTestId(`${prefix}-input`).fill(label)
  await page.getByTestId(`${prefix}-search`).click()
  await page.getByTestId(`${prefix}-result`).filter({ hasText: label }).first().click()
}

/** 따라하기 진행 상태(localStorage)에 남은 연습 항목 id */
async function practiceCreated(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('workbench.guide') ?? '{}') as { created?: Record<string, string> }).created ?? {})
}

/** 따라하기의 기업 단계: 「＋ 추가」 에서 기업을 고르면 연습 이름을 채운 창이 열리고, 만들면 다음 단계로 간다 */
async function createPracticeCompany(page: Page, items: PracticeItems): Promise<string> {
  const bubble = page.getByTestId('guide-bubble')
  await expect(bubble).toHaveAttribute('data-step', 'company')
  await expect(page.getByTestId('guide-next')).toHaveCount(0)
  await expect(page.getByTestId('add-open')).toHaveClass(/(^|\s)guide-target(\s|$)/)
  await openAdd(page, 'Company')
  const input = page.getByTestId('create-prop-name')
  await expect(input).toHaveValue(/^\[연습\] /)
  await expect(page.getByTestId('create-submit')).toHaveClass(/(^|\s)guide-target(\s|$)/)
  const name = await input.inputValue()
  items.name('Company', name)
  await page.getByTestId('create-submit').click()
  await expect(bubble).toHaveAttribute('data-step', 'document')
  return name
}

test.beforeEach(({ api }) => {
  // 작업 공간의 검색 칸은 검색어 없이 첫 쪽을 부른다. 서버의 이 응답은 초기 데이터가 섞여 스냅샷으로 남기지 않고 검색 결과로 대신한다.
  api.on('GET', '/api/nodes?page=0&size=20', { body: api.fixture('nodes-search') })
})

test.describe('열람자', () => {
  test.use({ role: 'VIEWER' })

  test('10) 열람자는 처음 로그인하면 둘러보기 가이드가 열리고, 끝내면 다시 열리지 않으며 「사용법」 으로 다시 본다', async ({ page, api }) => {
    firstVisit(api, 'auth-me-viewer')

    await page.goto('/')
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
    api.lastRequest('POST', '/api/auth/me/guide-done')

    // 끝낸 기록이 남은 뒤에는 새로고침해도 열리지 않는다.
    const ontologyBefore = ontologyRequestCount(api)
    await page.reload()
    await expect(page.getByTestId('search-input')).toBeVisible()
    // 가이드는 온톨로지를 받은 직후에 열린다. 새로고침 뒤 응답을 받고 화면이 그린 시점까지 기다린 다음 없음을 확인한다.
    await waitOntologyRendered(page, api, ontologyBefore)
    await expect(bubble).toHaveCount(0)

    // 「사용법」 은 끝낸 기록과 상관없이 처음부터 다시 연다.
    await page.getByTestId('guide-open').click()
    await expect(bubble).toHaveAttribute('data-step', 'intro')
    await page.getByTestId('guide-skip').click()
    await expect(bubble).toHaveCount(0)
  })
})

test('11) 편집자는 처음 로그인하면 연습 기업, 근거 문서, 주장을 따라 만들고, 끝내면 연습 항목이 보관된다', async ({ page, api }) => {
  firstVisit(api, 'auth-me-editor')
  const items = new PracticeItems(api)
  items.serveClaim()
  // 주장의 대상으로 고를 산업. 따라하기는 산업이 있어야 열린다(스냅샷 nodes-first-sector).
  const sector = api.fixture('nodes-first-sector').items[0] as NodeRef
  for (const size of [1, 2]) api.on('GET', `/api/nodes?types=Sector&size=${size}`, { body: pageOf([sector]) })
  api.on('GET', `/api/nodes?q=${encodeURIComponent(sector.label)}&types=Sector&size=10`, { body: pageOf([sector]) })

  await page.goto('/')
  const bubble = page.getByTestId('guide-bubble')
  await expect(bubble).toHaveAttribute('data-step', 'intro')
  await page.getByTestId('guide-start').click()

  // 1. 기업: 「다음」 없이 말풍선이 「＋ 추가」 를 가리키고, 메뉴에서 기업을 고르면 연습 이름을 채운 창이 열린다.
  const practiceCompany = await createPracticeCompany(page, items)
  expect(api.lastRequest('POST', '/api/nodes').body).toMatchObject({ type: 'Company', properties: { name: practiceCompany } })

  // 2. 근거 문서: 같은 방법으로 제목이 채워진 창이 열린다.
  await expect(page.getByTestId('add-open')).toHaveClass(/(^|\s)guide-target(\s|$)/)
  await openAdd(page, 'Document')
  const titleInput = page.getByTestId('create-prop-title')
  await expect(titleInput).toHaveValue(/^\[연습\] /)
  await expect(page.getByTestId('create-submit')).toHaveClass(/(^|\s)guide-target(\s|$)/)
  const practiceDocument = await titleInput.inputValue()
  items.name('Document', practiceDocument)
  await page.getByTestId('create-submit').click()

  // 3. 주장: 연습 기업의 상세에서 관계, 근거 문서, 설명이 채워진 주장 폼이 열린다.
  await expect(bubble).toHaveAttribute('data-step', 'claim')
  expect(api.lastRequest('POST', '/api/nodes').body).toMatchObject({ type: 'Document', properties: { title: practiceDocument } })
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', items.company.id)
  await expect(page.getByTestId('claim-predicate-select')).toHaveValue('BELONGS_TO_SECTOR')
  await expect(page.getByTestId('claim-doc-selected')).toContainText(practiceDocument)
  await expect(page.getByTestId('claim-description')).not.toHaveValue('')
  await pick(page, 'claim-object-picker', sector.label)
  await page.getByTestId('claim-add-submit').click()

  // 4. 마침: 그래프처럼 큰 대상이면 말풍선이 그 안쪽에 있어 상세 칸을 덮지 않는다.
  await expect(bubble).toHaveAttribute('data-step', 'done')
  expect(api.lastRequest('POST', '/api/claims').body).toMatchObject({
    predicate: 'BELONGS_TO_SECTOR',
    subjectId: items.company.id,
    objectId: sector.id,
    documentIds: [items.document.id],
  })
  await expect(bubble).toHaveAttribute('data-placement', 'anchored')
  await expect
    .poll(
      async () => {
        const b = await bubble.boundingBox()
        const d = await page.getByTestId('detail-panel').boundingBox()
        if (!b || !d) return null
        return b.x < d.x + d.width && d.x < b.x + b.width && b.y < d.y + d.height && d.y < b.y + b.height
      },
      { message: '마침 말풍선과 상세 칸이 겹치지 않는다' },
    )
    .toBe(false)
  await shot(page, '11-guide-practice-done')

  expect(await practiceCreated(page)).toEqual({ company: items.company.id, document: items.document.id, claim: items.claim.id })
  await page.getByTestId('guide-finish').click()
  await expect(bubble).toHaveCount(0)

  // 끝내면 주장, 근거 문서, 기업 순서로 보관하고 끝낸 기록을 남긴다.
  await expect.poll(() => items.archiveRequests().map((r) => r.id), { message: '보관한 연습 항목' }).toEqual([items.claim.id, items.document.id, items.company.id])
  for (const r of items.archiveRequests()) expect(r.body).toMatchObject({ reason: PRACTICE_ARCHIVE_REASON })
  api.lastRequest('POST', '/api/auth/me/guide-done')
  await page.getByTestId('search-input').fill(practiceCompany)
  await page.getByTestId('search-submit').click()
  await expect(page.getByTestId('search-empty')).toBeVisible()

  const ontologyBefore = ontologyRequestCount(api)
  await page.reload()
  await expect(page.getByTestId('search-input')).toBeVisible()
  // 가이드는 온톨로지를 받은 직후에 열린다. 새로고침 뒤 응답을 받고 화면이 그린 시점까지 기다린 다음 없음을 확인한다.
  await waitOntologyRendered(page, api, ontologyBefore)
  await expect(bubble).toHaveCount(0)
})

test('11b) 다시 연습하다 새로고침하면 이어서 하기를 묻고, 그만두면 만든 연습 항목을 보관한다', async ({ page, api }) => {
  const items = new PracticeItems(api)
  api.on('POST', '/api/auth/me/guide-done', { body: api.fixture('auth-me-editor') })

  // 작업 공간에서 연다. 만들기가 작업 공간으로 옮기지 않아야 저절로 열기가 끼어들지 않는다.
  await page.goto('/workspace')
  await expect(page.getByTestId('current-user-name')).toBeVisible()
  await page.getByTestId('guide-open').click()
  const bubble = page.getByTestId('guide-bubble')
  await expect(bubble).toHaveAttribute('data-step', 'intro')
  await page.getByTestId('guide-start').click()
  await createPracticeCompany(page, items)
  expect(await practiceCreated(page)).toEqual({ company: items.company.id })

  // 가이드를 끝낸 사용자라도 진행 중인 따라하기가 있으면 새로고침 뒤 이어서 할지 묻는다.
  await page.reload()
  await expect(bubble).toHaveAttribute('data-step', 'resume')
  await expect(page.getByTestId('guide-resume')).toBeVisible()
  await expect(page.getByTestId('guide-stop')).toBeVisible()
  await page.getByTestId('guide-stop').click()
  await expect(bubble).toHaveCount(0)
  await expect.poll(() => items.archiveRequests().map((r) => r.id), { message: '보관한 연습 항목' }).toEqual([items.company.id])
  expect(items.archiveRequests()[0].body).toMatchObject({ reason: PRACTICE_ARCHIVE_REASON })
})
