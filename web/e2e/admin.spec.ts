import type { Page } from '@playwright/test'
import { exact, openScreen, shotElement } from './support'
import { expect, shot, test, type MockApi, type Role } from './mock/test'

// 역할과 관리자 화면을 확인한다. 사용자 추가와 비활성화, 열람자 화면, 역할별 더보기 메뉴, 세션이 끊긴 화면, 온톨로지 YAML 과 폼 편집, 영향 미리보기.
// 응답은 가짜 API 의 스냅샷이다. 쓰기는 화면이 보낸 요청을 확인하고, 쓴 뒤의 응답은 스냅샷으로 만든다.
// 열람자의 쓰기 403, 비활성화한 사용자의 세션 끊김, 온톨로지 버전 저장과 되돌리기는 서버 테스트
// (RoleAndUserAdminIntegrationTest, ontology/OntologyEditIntegrationTest)가 맡는다.

interface NodeRef {
  id: string
  type: string
  label: string
}

interface UserRow {
  id: string
  email: string
  [key: string]: unknown
}

/** YAML 로 더하는 펀드 타입. ApiSnapshotTest 의 FUND_TYPE_LINES 와 같은 줄이라 미리보기 스냅샷이 이 변경의 응답이다 */
const FUND_TYPE_LINES = [
  '  Fund:',
  '    label: 펀드',
  '    description: 투자 펀드',
  '    labelProperty: name',
  '    properties:',
  '      name:',
  '        type: string',
  '        label: 펀드 이름',
  '        required: true',
]

/** 개념에 더하는 필수 속성. ApiSnapshotTest 의 REQUIRED_CONCEPT_LINES 와 같은 줄이다 */
const REQUIRED_CONCEPT_LINES = ['      source:', '        type: string', '        label: 출처', '        required: true', '        maxLength: 50']

/** 폼으로 인물에 더하는 속성 키. ApiSnapshotTest 의 NICKNAME 과 같다 */
const NICKNAME = 'nickname'

/** 목록 한 쪽. 스냅샷의 쪽 응답과 같은 모양이다 */
function pageOf<T>(items: T[]): { items: T[]; page: number; size: number; totalItems: number; totalPages: number } {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: items.length === 0 ? 0 : 1 }
}

/** 상세가 부르는 내 이해 표시를 「표시 없음」 으로 준다 */
function noMark(api: MockApi, ...nodeIds: string[]): void {
  for (const nodeId of nodeIds) api.on('GET', `/api/me/knowledge/${nodeId}`, { body: { ...api.fixture<Record<string, unknown>>('knowledge-mark-none'), nodeId } })
}

/** 미리보기의 정의에 저장 응답의 버전 정보를 붙인 온톨로지. 저장 뒤 서버가 주는 GET /api/ontology 와 같은 모양이다 */
function ontologyAfter(api: MockApi, preview: string, saved: string): Record<string, unknown> {
  const summary = api.fixture(saved)
  return { ...api.fixture(preview).definition, version: summary.version, versionCreatedAt: summary.createdAt, versionCreatedBy: summary.createdBy }
}

/** marker 줄(from 줄 뒤에서 처음 나오는 것) 바로 아래에 lines 를 넣는다 */
function insertAfter(yaml: string, marker: string, lines: string[], from = 0): string {
  const all = yaml.split('\n')
  const at = all.findIndex((line, i) => i >= from && line === marker)
  expect(at, `YAML 의 「${marker}」 줄`).toBeGreaterThanOrEqual(0)
  all.splice(at + 1, 0, ...lines)
  return all.join('\n')
}

function usersRow(page: Page, email: string) {
  return page.locator(`[data-testid="users-row"][data-email="${email}"]`)
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

/** 온톨로지 화면 머리의 「버전 n」 */
async function ontologyVersion(page: Page): Promise<number> {
  return Number(/\d+/.exec(await page.getByTestId('ontology-version').innerText())?.[0])
}

test.beforeEach(({ api }) => {
  // 작업 공간의 검색 칸은 검색어 없이 첫 쪽을 부른다. 서버의 이 응답은 초기 데이터가 섞여 스냅샷으로 남기지 않고 검색 결과로 대신한다.
  api.on('GET', '/api/nodes?page=0&size=20', { body: api.fixture('nodes-search') })
})

test.describe('관리자', () => {
  test.use({ role: 'ADMIN' })

  test('0) 관리자가 허용 사용자를 추가하면 첫 로그인 전으로 목록에 보인다', async ({ page, api }) => {
    const users = api.fixture('users') as UserRow[]
    const created = api.fixture('user-created') as UserRow & { displayName: string; role: Role }
    let list = users
    api.on('GET', '/api/users', () => ({ body: list }))
    api.on('POST', '/api/users', () => {
      list = [...users, created]
      return { status: 201, body: created }
    })

    await openApp(page)
    await expect(page.getByTestId('current-user-role')).toHaveAttribute('data-role', 'ADMIN')
    await openScreen(page, 'users')
    await expect(page.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('users-table')).toBeVisible()

    await page.getByTestId('users-add-email').fill(created.email)
    await page.getByTestId('users-add-name').fill(created.displayName)
    await page.getByTestId('users-add-role').selectOption(created.role)
    await page.getByTestId('users-add-submit').click()
    await expect(page.getByTestId('users-message')).toHaveAttribute('data-kind', 'success')
    expect(api.lastRequest('POST', '/api/users').body).toEqual({ email: created.email, displayName: created.displayName, role: created.role })
    const row = usersRow(page, created.email)
    await expect(row).toBeVisible()
    await expect(row.getByTestId('users-row-role')).toHaveValue(created.role)
    await expect(row.getByTestId('users-row-linked')).toHaveText('첫 로그인 전')
    await shot(page, '00-users-admin')
  })

  test('8) 관리자가 열람자를 비활성화하면 그 행이 비활성으로 바뀌고 다시 활성화 단추가 보인다', async ({ page, api }) => {
    const users = api.fixture('users') as UserRow[]
    const disabled = api.fixture('user-disabled') as UserRow & { revision: number }
    const viewer = users.find((u) => u.id === disabled.id)!
    let list = users
    api.on('GET', '/api/users', () => ({ body: list }))
    api.on('PATCH', `/api/users/${viewer.id}`, () => {
      list = users.map((u) => (u.id === viewer.id ? disabled : u))
      return { body: disabled }
    })

    await openApp(page)
    await openScreen(page, 'users')
    const row = usersRow(page, viewer.email)
    await expect(row.getByTestId('users-row-linked')).toHaveText('로그인함')
    await row.getByTestId('users-row-disable').click()
    await expect(page.getByTestId('users-message')).toHaveAttribute('data-kind', 'success')
    await expect(row).toHaveAttribute('data-enabled', 'false')
    await expect(row.getByTestId('users-row-enable')).toBeVisible()
    expect(api.lastRequest('PATCH', `/api/users/${viewer.id}`).body).toEqual({ expectedRevision: viewer.revision, enabled: false })
  })

  test('9) 관리자가 YAML 로 새 타입을 더해 저장하고, 버전 기록에서 저장 전 버전으로 되돌린다', async ({ page, api }) => {
    const base = api.fixture('ontology').version as number
    const baseYaml = api.fixture('ontology-version').yaml as string
    const fundYaml = insertAfter(baseYaml, 'nodeTypes:', FUND_TYPE_LINES)
    const saved = api.fixture('ontology-save')
    const restored = api.fixture('ontology-restore')
    // 저장하면 새 타입이 있는 버전, 되돌리면 저장 전 내용의 버전이다.
    let current: Record<string, unknown> = api.fixture('ontology')
    api.on('GET', '/api/ontology', () => ({ body: current }))
    api.on('POST', '/api/ontology/versions', () => {
      current = ontologyAfter(api, 'ontology-preview-add-type', 'ontology-save')
      return { status: 201, body: saved }
    })
    api.on('POST', `/api/ontology/versions/${base}/restore`, () => {
      current = { ...api.fixture('ontology'), version: restored.version, versionCreatedAt: restored.createdAt, versionCreatedBy: restored.createdBy }
      return { status: 201, body: restored }
    })
    // 되돌리기 미리보기는 저장 전 버전의 YAML 을 보낸다.
    api.on('POST', '/api/ontology/preview', (req) => ({
      body: api.fixture((req.body as { yaml?: string }).yaml === baseYaml ? 'ontology-preview-restore' : 'ontology-preview-add-type'),
    }))
    const versions = api.fixture('ontology-versions')
    api.on('GET', '/api/ontology/versions?page=0&size=20', () => ({
      body: current.version === base ? versions : pageOf([saved, ...versions.items]),
    }))

    await openApp(page)
    await openScreen(page, 'ontology')
    expect(await ontologyVersion(page)).toBe(base)

    // 1. YAML 편집기는 지금 버전의 YAML 로 열린다. 새 타입을 더해 미리보면 더한 경로가 보인다.
    await page.getByTestId('ontology-edit-yaml').click()
    const input = page.getByTestId('ontology-yaml-input')
    await expect(input).toHaveValue(baseYaml)
    await input.fill(fundYaml)
    await page.getByTestId('ontology-preview').click()
    await expect(page.getByTestId('ontology-diff-added')).toContainText('nodeTypes.Fund')
    expect(api.lastRequest('POST', '/api/ontology/preview').body).toEqual({ baseVersion: base, yaml: fundYaml })
    await shotElement(page.getByTestId('ontology-preview-panel'), '09-ontology-preview')

    // 2. 저장하면 그 YAML 을 보내고, 다시 읽은 온톨로지의 버전이 보인다.
    await page.getByTestId('ontology-save').click()
    await expect(page.getByTestId('ontology-message')).toHaveAttribute('data-kind', 'success')
    expect(api.lastRequest('POST', '/api/ontology/versions').body).toMatchObject({ baseVersion: base, yaml: fundYaml })
    await expect(page.getByTestId('ontology-version')).toHaveText(`버전 ${saved.version}`)
    await shot(page, '09-ontology-saved')

    // 3. 버전 기록에서 저장 전 버전을 골라 되돌리면 뺄 타입이 보이고, 저장하면 새 버전이 된다.
    await page.getByTestId('ontology-history-open').click()
    await page.locator(`[data-testid="ontology-history-row"][data-version="${base}"]`).click()
    await page.getByTestId('ontology-restore').click()
    await expect(page.getByTestId('ontology-diff-removed')).toContainText('nodeTypes.Fund')
    expect(api.lastRequest('POST', '/api/ontology/preview').body).toEqual({ baseVersion: saved.version, yaml: baseYaml })
    await page.getByTestId('ontology-save').click()
    await expect(page.getByTestId('ontology-message')).toHaveAttribute('data-kind', 'success')
    expect(api.lastRequest('POST', `/api/ontology/versions/${base}/restore`).body).toMatchObject({ baseVersion: saved.version })
    await expect(page.getByTestId('ontology-version')).toHaveText(`버전 ${restored.version}`)
    await shot(page, '09-ontology-restored')
  })

  test('9b) 관리자가 폼으로 인물에 속성을 더해 저장하고, 문장 틀이 틀린 초안은 저장하지 않고 버린다', async ({ page, api }) => {
    const base = api.fixture('ontology').version as number
    let current: Record<string, unknown> = api.fixture('ontology')
    api.on('GET', '/api/ontology', () => ({ body: current }))
    api.on('POST', '/api/ontology/versions', () => {
      current = ontologyAfter(api, 'ontology-preview-add-property', 'ontology-save')
      return { status: 201, body: api.fixture('ontology-save') }
    })
    // 문장 틀을 고친 정의는 미리보기가 거짓이다.
    api.on('POST', '/api/ontology/preview', (req) => {
      const definition = (req.body as { definition: { relationshipTypes: Record<string, { sentence?: string }> } }).definition
      return { body: api.fixture(definition.relationshipTypes.ISSUES.sentence === '{from} 테스트' ? 'ontology-preview-invalid' : 'ontology-preview-add-property') }
    })

    await openApp(page)
    await openScreen(page, 'ontology')

    // 1. 폼에서 인물에 문자열 속성을 더하고 미리본 뒤 저장한다.
    await page.getByTestId('ontology-edit-form').click()
    const person = page.locator('[data-testid="ontology-form-type"][data-type="Person"]')
    await expect(person).toBeVisible()
    await person.getByTestId('ontology-form-prop-add').click()
    await person.getByTestId('ontology-form-new-key').fill(NICKNAME)
    await person.getByTestId('ontology-form-new-label').fill('별명')
    await person.getByTestId('ontology-form-new-submit').click()
    await expect(person.locator(`[data-testid="ontology-form-prop"][data-prop="${NICKNAME}"]`)).toBeVisible()
    await page.getByTestId('ontology-preview').click()
    await expect(page.getByTestId('ontology-diff-added')).toContainText(`nodeTypes.Person.properties.${NICKNAME}`)
    expect(api.lastRequest('POST', '/api/ontology/preview').body).toMatchObject({
      baseVersion: base,
      definition: { nodeTypes: { Person: { properties: { [NICKNAME]: { type: 'string', label: '별명' } } } } },
    })
    await shotElement(page.getByTestId('ontology-preview-panel'), '09b-ontology-form-preview')
    await page.getByTestId('ontology-save').click()
    await expect(page.getByTestId('ontology-message')).toHaveAttribute('data-kind', 'success')
    expect(api.lastRequest('POST', '/api/ontology/versions').body).toMatchObject({
      baseVersion: base,
      definition: { nodeTypes: { Person: { properties: { [NICKNAME]: { type: 'string', label: '별명' } } } } },
    })
    await shot(page, '09b-ontology-form')

    // 2. 관계 종류의 문장 틀에서 {to} 를 빼면 입력 아래와 미리보기에 오류가 보이고 저장 단추가 없다. 초안을 버린다.
    await page.getByTestId('ontology-edit-form').click()
    const issues = page.locator('[data-testid="ontology-form-rel"][data-rel="ISSUES"]')
    await expect(issues).toBeVisible()
    await issues.getByTestId('ontology-form-rel-sentence').fill('{from} 테스트')
    await expect(issues.getByTestId('ontology-form-error')).toHaveText('문장 틀에 {from} 과 {to} 를 한 번씩 넣습니다')
    await page.getByTestId('ontology-preview').click()
    await expect(page.getByTestId('ontology-preview-error')).toContainText(api.fixture('ontology-preview-invalid').errors)
    await expect(page.getByTestId('ontology-save')).toHaveCount(0)
    await page.getByTestId('ontology-draft-discard').click()
    await expect(page.getByTestId('ontology-form')).toHaveCount(0)
  })

  test('9c) 관리자가 기존 데이터와 어긋나는 변경을 미리보면 영향과 확인란이 보이고, 저장하지 않고 초안을 버린다', async ({ page, api }) => {
    const base = api.fixture('ontology').version as number
    const baseYaml = api.fixture('ontology-version').yaml as string
    api.on('POST', '/api/ontology/preview', { body: api.fixture('ontology-preview-impact') })

    await openApp(page)
    await openScreen(page, 'ontology')
    await page.getByTestId('ontology-edit-yaml').click()
    const input = page.getByTestId('ontology-yaml-input')
    await expect(input).toHaveValue(baseYaml)
    const concept = baseYaml.split('\n').indexOf('  Concept:')
    expect(concept, '정규화된 YAML 의 Concept 줄').toBeGreaterThanOrEqual(0)
    await input.fill(insertAfter(baseYaml, '    properties:', REQUIRED_CONCEPT_LINES, concept))

    // 영향 행과 개수, 꺼진 저장 단추, 확인란을 확인한다. 저장은 누르지 않는다.
    await page.getByTestId('ontology-preview').click()
    const impact = page.locator('[data-testid="ontology-impact"][data-kind="NOW_REQUIRED"]')
    await expect(impact).toBeVisible()
    await expect(impact).toContainText(/\d+개/)
    await expect(page.getByTestId('ontology-diff-added').locator('li')).toHaveCount(1)
    const save = page.getByTestId('ontology-save')
    await expect(save).toBeDisabled()
    await page.getByTestId('ontology-save-confirm').check()
    await expect(save).toBeEnabled()
    await shotElement(page.getByTestId('ontology-preview-panel'), '09c-ontology-impact')

    // 초안을 버리면 버전이 그대로이고 저장 요청은 없다.
    await page.getByTestId('ontology-draft-discard').click()
    await expect(page.getByTestId('ontology-version')).toHaveText(`버전 ${base}`)
    expect(api.requests.filter((r) => r.method === 'POST' && r.path === '/api/ontology/versions')).toEqual([])
  })

  test('7b) 더보기 메뉴에서 연 화면은 더보기를 선택된 것으로 보이고, 상단 탭을 열면 풀린다', async ({ page }) => {
    await openApp(page)
    await openScreen(page, 'map')
    await expect(page.getByTestId('more-open')).toHaveAttribute('data-active', 'false')
    await openScreen(page, 'changes')
    await expect(page).toHaveURL(/\/changes(\?|$)/)
    await expect(page.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('tab-map')).toHaveAttribute('aria-selected', 'false')
  })
})

const MENU_ITEMS: [Role, string[]][] = [
  ['ADMIN', ['changes', 'ontology', 'review', 'users', 'tokens', 'proposals', 'trades']],
  ['EDITOR', ['changes', 'ontology', 'review', 'tokens', 'proposals', 'trades']],
  ['VIEWER', ['changes', 'ontology', 'tokens', 'proposals', 'trades']],
]

for (const [role, items] of MENU_ITEMS) {
  test.describe(`${role} 의 더보기 메뉴`, () => {
    test.use({ role })

    test(`7b) ${role} 의 더보기 메뉴는 역할에 맞는 항목을 보인다`, async ({ page }) => {
      await openApp(page)
      await page.getByTestId('more-open').click()
      // 제안 항목 안의 대기 수 배지(more-item-proposals-badge)는 항목이 아니다.
      const menu = page.locator('[data-testid^="more-item-"]:not([data-testid$="-badge"])')
      await expect(menu.first()).toBeVisible()
      expect(await menu.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))).toEqual(items.map((i) => `more-item-${i}`))
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
    })
  })
}

test.describe('편집자', () => {
  test.use({ role: 'EDITOR' })

  test('9) 관리자가 새 타입을 저장하면 편집자 화면에 안내가 나오고, 다시 읽으면 새 타입이 만들기 메뉴에 있다', async ({ page, api }) => {
    const search = api.fixtureRequest('nodes-search')
    const saved = api.fixture('ontology-save')
    let reloaded = false
    api.on('GET', '/api/ontology', () => ({ body: reloaded ? ontologyAfter(api, 'ontology-preview-add-type', 'ontology-save') : api.fixture('ontology') }))
    // 서버는 모든 응답에 최신 온톨로지 버전 번호를 붙인다. 저장 뒤의 검색 응답이다.
    api.on('GET', `${search.path}?${search.query}`, { body: api.fixture('nodes-search'), headers: { 'X-Ontology-Version': String(saved.version) } })

    await openApp(page)
    await openScreen(page, 'workspace')
    await expect(page.getByTestId('search-input')).toBeVisible()
    await page.getByTestId('search-input').fill(new URLSearchParams(search.query).get('q')!)
    await page.getByTestId('search-submit').click()
    await expect(page.getByTestId('ontology-stale')).toBeVisible()
    reloaded = true
    await page.getByTestId('ontology-reload').click()
    await expect(page.getByTestId('ontology-stale')).toHaveCount(0)
    await page.getByTestId('add-open').click()
    await expect(page.getByTestId('add-type-Fund')).toContainText('펀드')
    await page.keyboard.press('Escape')
  })

  test('9b) 관리자가 인물에 속성을 더하면 편집자가 다시 읽은 뒤 인물의 고치기 폼에 그 칸이 있다', async ({ page, api }) => {
    const personDetail = api.fixture('node-person')
    const person = personDetail.node as NodeRef
    const saved = api.fixture('ontology-save')
    let reloaded = false
    api.on('GET', '/api/ontology', () => ({ body: reloaded ? ontologyAfter(api, 'ontology-preview-add-property', 'ontology-save') : api.fixture('ontology') }))
    api.on('GET', `/api/nodes/${person.id}`, { body: personDetail, headers: { 'X-Ontology-Version': String(saved.version) } })
    noMark(api, person.id)

    await openApp(page, `/workspace?node=${person.id}&pane=detail`)
    await expect(page.getByTestId('detail-label')).toHaveText(exact(person.label))
    await expect(page.getByTestId('ontology-stale')).toBeVisible()
    reloaded = true
    await page.getByTestId('ontology-reload').click()
    await expect(page.getByTestId('ontology-stale')).toHaveCount(0)
    await page.getByTestId('node-edit').click()
    await expect(page.getByTestId(`edit-prop-${NICKNAME}`)).toBeVisible()
    await expect(page.getByTestId('node-edit-form')).toContainText('별명')
  })
})

test.describe('열람자', () => {
  test.use({ role: 'VIEWER' })

  test('7) 열람자에게는 만들기와 편집 단추가 없고, 검토 대기는 주소로 열려도 승인할 수 없다', async ({ page, api }) => {
    const search = api.fixtureRequest('nodes-search')
    const query = new URLSearchParams(search.query).get('q')!
    const company = api.fixture('node-company').node as NodeRef
    // 열람자의 검토 대기는 범위 없이 DRAFT 주장 전체를 읽는다.
    api.on('GET', '/api/claims?reviewStatus=DRAFT&page=0&size=20', { body: api.fixture('claims-pending-review') })

    await openApp(page)
    await expect(page.getByTestId('current-user-role')).toHaveAttribute('data-role', 'VIEWER')
    await openScreen(page, 'workspace')
    await expect(page.getByTestId('search-input')).toBeVisible()
    // 열람자에게는 「＋ 추가」 와 그래프의 ＋ 단추가 없다.
    await expect(page.getByTestId('graph-canvas')).toBeVisible()
    await expect(page.getByTestId('add-open')).toHaveCount(0)
    await expect(page.getByTestId('graph-add')).toHaveCount(0)

    await searchAndOpen(page, query, company.label)
    await expect(page.getByTestId('viewer-hint')).toBeVisible()
    for (const id of ['node-edit', 'node-save', 'edit-prop-name', 'relationship-add-toggle', 'claim-add-toggle']) {
      await expect(page.getByTestId(id)).toHaveCount(0)
    }
    // 「⋯」 메뉴에는 링크 복사와 변경 이력만 있다.
    await page.getByTestId('node-more').click()
    await expect(page.getByTestId('node-history-link')).toBeVisible()
    for (const id of ['node-archive-button', 'node-restore-button']) {
      await expect(page.getByTestId(id)).toHaveCount(0)
    }
    await page.keyboard.press('Escape')
    await shot(page, '07-viewer')

    // 열람자의 더보기 메뉴에는 검토 대기가 없지만 주소로는 열린다. 승인 단추는 모두 꺼져 있다.
    await page.goto('/review')
    await expect(page.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('review-table')).toBeVisible()
    const approve = page.getByTestId('review-row-approve')
    await expect(approve.first()).toBeVisible()
    for (let i = 0; i < (await approve.count()); i += 1) await expect(approve.nth(i)).toBeDisabled()
  })

  test('8) 세션이 끊겨 요청이 401 이면 로그인 화면으로 돌아가 세션 만료 안내를 보인다', async ({ page, api }) => {
    await openApp(page)
    // 관리자가 비활성화한 뒤의 요청이다. 서버는 로그인하지 않은 요청과 같은 401 을 준다.
    api.on('GET', '/api/nodes', { status: 401, body: api.fixture('auth-me-anonymous') })
    await openScreen(page, 'workspace')
    await expect(page.getByTestId('login-notice')).toContainText('세션이 만료되었습니다')
    await expect(page.getByTestId('login-google')).toBeVisible()
    await expect(page.getByTestId('current-user-name')).toHaveCount(0)
    await shot(page, '08-disabled')
  })
})
