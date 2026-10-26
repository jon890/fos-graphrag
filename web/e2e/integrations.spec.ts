import type { Page } from '@playwright/test'
import { exact, OAUTH_CALLBACK, openScreen, openTokensAdvanced } from './support'
import { expect, shot, test, type MockApi } from './mock/test'

// 에이전트와 앱 연동 화면을 확인한다. 설치 안내, 연동 토큰 발급과 복사, 폐기, 앱 연결 동의와 끊기, 에이전트가 올린 제안과 내 체결.
// 응답은 가짜 API 의 스냅샷이다. 쓰기는 화면이 보낸 요청을 확인하고, 쓴 뒤의 목록은 테스트가 스냅샷을 고쳐 준다.
// 토큰으로 /api/v1 부르기와 폐기 뒤 401, 코드 교환과 갱신 토큰 폐기, 체결과 제안이 주인에게만 보이는 것은 서버 테스트
// (agent/AgentAuthIntegrationTest, oauth/OAuthAuthorizationIntegrationTest, proposal/ProposalIntegrationTest, trade/TradeIntegrationTest)가 맡는다.

interface NodeRef {
  id: string
  type: string
  label: string
}

interface Proposal {
  id: string
  kind: string
  status: string
  payload: Record<string, unknown>
  [key: string]: unknown
}

/** 목록 한 쪽. 스냅샷의 쪽 응답과 같은 모양이다 */
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

/** 스냅샷 id 와 겹치지 않는 id. 마지막 글자만 바꾼다 */
function otherId(id: string): string {
  return id.replace(/.$/, 'f')
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

test('7g) 연동 토큰을 발급해 복사하고, 목록에는 끝 네 자리만 남으며, 폐기하면 목록에서 빠진다', async ({ page, api, context }) => {
  const tokens = api.fixture('tokens') as { id: string; name: string }[]
  // 발급 응답은 스냅샷의 발급 응답에 이 테스트의 이름과 범위, 새 id 를 넣은 것이다.
  const issued = { ...api.fixture('token-issued'), id: otherId(api.fixture('token-issued').id), name: 'e2e 토큰', scope: 'READ' }
  const { token, ...row } = issued as { token: string } & Record<string, unknown>
  let list: unknown[] = tokens
  api.on('GET', '/api/me/tokens', () => ({ body: list }))
  api.on('POST', '/api/me/tokens', () => {
    list = [...tokens, row]
    return { status: 201, body: issued }
  })
  api.on('DELETE', `/api/me/tokens/${issued.id}`, () => {
    list = tokens
    return { status: 204 }
  })

  await openApp(page)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin })
  await openScreen(page, 'tokens')
  await expect(page).toHaveURL(/\/tokens(\?|$)/)
  await expect(page.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
  // 맨 위에 Claude Code 와 Codex 설치 안내가 있고, 연동 토큰은 접힌 고급 칸 안에 있다.
  await expect(page.getByTestId('integrations-install')).toBeVisible()
  await expect(page.getByTestId('tokens-issue-open')).toBeHidden()
  await openTokensAdvanced(page)
  await expect(page.getByTestId('tokens-guide')).toContainText('Hermes')

  // 발급하면 원문이 한 번만 보이고, 복사 단추가 클립보드에 그 값을 넣는다.
  await page.getByTestId('tokens-issue-open').click()
  await page.getByTestId('tokens-issue-name').fill('e2e 토큰')
  await page.getByTestId('tokens-issue-submit').click()
  await expect(page.getByTestId('tokens-issued-value')).toHaveValue(token)
  await expect(page.getByTestId('tokens-issued-warning')).toBeVisible()
  expect(api.lastRequest('POST', '/api/me/tokens').body).toEqual({ name: 'e2e 토큰', scope: 'READ' })
  await shot(page, 'tokens-issued-wide')

  await page.getByTestId('tokens-issued-copy').click()
  await expect(page.getByTestId('tokens-issued-copied')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token)

  // 닫으면 다시 읽은 목록에 끝 네 자리만 남고 원문은 화면 어디에도 없다.
  await page.getByTestId('tokens-issued-close').click()
  await expect(page.getByTestId('tokens-issue-dialog')).toHaveCount(0)
  const newRow = page.locator('[data-testid="tokens-row"][data-name="e2e 토큰"]')
  await expect(newRow).toHaveCount(1)
  await expect(newRow.getByTestId('tokens-row-last4')).toHaveText(`…${token.slice(-4)}`)
  await expect(newRow.getByTestId('tokens-row-last-used')).toContainText('아직 쓰지 않음')
  expect(await page.content()).not.toContain(token)
  await shot(page, 'tokens-list-wide')

  // 폐기하면 그 토큰의 폐기를 보내고 행이 사라진다.
  await newRow.getByTestId('tokens-row-revoke').click()
  await expect(page.getByTestId('tokens-revoke-dialog')).toContainText('e2e 토큰')
  await page.getByTestId('tokens-revoke-confirm').click()
  await expect(newRow).toHaveCount(0)
  await expect(page.getByTestId('tokens-message')).toHaveAttribute('data-kind', 'success')
  api.lastRequest('DELETE', `/api/me/tokens/${issued.id}`)
})

test('7i) 앱 연결 동의: 허용하면 코드가 붙은 주소로 돌아가고, 연결된 앱을 끊으면 목록에서 빠진다', async ({ page, api }) => {
  const preview = api.fixture('oauth-authorize-preview')
  const authorizeQuery = api.fixtureRequest('oauth-authorize-preview').query
  const authorize = new URLSearchParams(authorizeQuery)
  const connections = api.fixture('connections') as { id: string; clientName: string }[]
  const connection = connections[0]
  let list: unknown[] = connections
  api.on('GET', '/api/me/connections', () => ({ body: list }))
  api.on('DELETE', `/api/me/connections/${connection.id}`, () => {
    list = []
    return { status: 204 }
  })
  // 앱이 돌아올 loopback 주소는 실제로 열리지 않으므로 브라우저 요청을 가로채 받는다.
  await page.route(`${new URL(OAUTH_CALLBACK).origin}/**`, (r) => r.fulfill({ body: 'ok' }))

  // 서버가 /oauth/authorize 의 query 를 그대로 붙여 보내는 동의 화면은 머리글이 없다.
  await openApp(page)
  await page.goto(`/connect?${authorizeQuery}`)
  await expect(page.getByTestId('connect-page')).toBeVisible()
  await expect(page).toHaveURL(/\/connect\?/)
  await expect(page.getByTestId('current-user-name')).toHaveCount(0)
  await expect(page.getByTestId('connect-user')).toContainText(preview.user.displayName)
  await expect(page.getByTestId('connect-sentence')).toHaveText(`${preview.clientName} 이(가) 가치투자 온톨로지를 내 계정으로 조회하고 기록하려 합니다.`)
  await expect(page.getByTestId('connect-scope-write')).toBeChecked()
  await shot(page, '07i-connect-consent')

  await page.getByTestId('connect-allow').click()
  await page.waitForURL(/127\.0\.0\.1:43210\/callback\?/)
  expect(api.lastRequest('POST', '/api/oauth/authorize').body).toEqual({ ...Object.fromEntries(authorize), decision: 'ALLOW', grantedScope: 'READ_WRITE' })
  const back = new URL(page.url())
  expect(back.searchParams.get('state')).toBe(authorize.get('state'))
  expect(back.searchParams.get('code')).toMatch(/^fwc_/)

  // 「연동」 화면의 「연결된 앱」 에 보이고, 끊으면 사라진다.
  await page.goto('/tokens')
  const row = page.locator(`[data-testid="connections-row"][data-name="${connection.clientName}"]`)
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('connections-row-scope')).toHaveAttribute('data-scope', 'READ_WRITE')
  await shot(page, '07i-connections-wide')
  await row.getByTestId('connections-row-disconnect').click()
  await expect(page.getByTestId('connections-confirm')).toContainText(connection.clientName)
  await page.getByTestId('connections-confirm-submit').click()
  await expect(row).toHaveCount(0)
  await expect(page.getByTestId('connections-message')).toHaveAttribute('data-kind', 'success')
  api.lastRequest('DELETE', `/api/me/connections/${connection.id}`)
})

test.describe('로그아웃 상태', () => {
  test.use({ role: null, signedInRole: 'VIEWER' })

  test('7j) 로그아웃 상태에서 앱 연결을 시작하면 로그인 안내가 나오고, 로그인하면 가이드 없이 동의 화면이 열리며 거절하면 앱으로 access_denied 가 돌아간다', async ({ page, api }) => {
    const authorizeQuery = api.fixtureRequest('oauth-authorize-preview').query
    const viewer = api.fixture('auth-me-viewer')
    // 첫 접속 가이드를 끝내지 않은 열람자다. 로그인하기 전에는 401 이다.
    const signedIn = () => api.requests.some((r) => r.path === '/oauth2/authorization/google')
    api.on('GET', '/api/auth/me', () => (signedIn() ? { body: { ...viewer, guideDoneAt: null } } : { status: 401, body: api.fixture('auth-me-anonymous') }))
    api.on('GET', '/api/oauth/authorize', { body: { ...api.fixture<Record<string, unknown>>('oauth-authorize-preview'), user: { displayName: viewer.displayName } } })
    api.on('POST', '/api/oauth/authorize', { body: api.fixture('oauth-authorize-deny') })
    await page.route(`${new URL(OAUTH_CALLBACK).origin}/**`, (r) => r.fulfill({ body: 'ok' }))

    await page.goto(`/connect?${authorizeQuery}`)
    await expect(page.getByTestId('login-notice')).toContainText('앱을 연결하려면')
    await page.getByTestId('login-google').click()

    await expect(page.getByTestId('connect-page')).toBeVisible()
    await expect(page.getByTestId('connect-user')).toContainText(viewer.displayName)
    await expect(page.getByTestId('guide-bubble')).toHaveCount(0)
    await expect(page).toHaveURL(/\/connect\?/)
    await shot(page, '07j-connect-after-login')

    // 거절은 범위 없이 보내고, 서버가 준 주소로 돌아간다.
    await page.getByTestId('connect-deny').click()
    await page.waitForURL(/127\.0\.0\.1:43210\/callback\?/)
    expect(api.lastRequest('POST', '/api/oauth/authorize').body).toEqual({ ...Object.fromEntries(new URLSearchParams(authorizeQuery)), decision: 'DENY' })
    expect(new URL(page.url()).searchParams.get('error')).toBe('access_denied')
  })
})

test('7h) 기록 토큰의 범위를 고르고, 에이전트의 제안을 고쳐 승인하거나 거절하면 결정과 체결이 이어진다', async ({ page, api }) => {
  const agentProposals = api.fixture('proposals-pending-agent').items as Proposal[]
  const create = agentProposals.find((p) => p.kind === 'CREATE_NODE')!
  const note = agentProposals.find((p) => p.kind === 'STUDY_NOTE')!
  const accepted = api.fixture('proposal-accept') as Proposal & { result: { nodeIds: string[] } }
  const rejected = api.fixture('proposal-reject') as Proposal & { decisionNote: string }
  const addedDetail = api.fixture('node-decision-added')
  const added = addedDetail.node as NodeRef
  const security = api.fixture('node-security').node as NodeRef
  const tradesAfter = api.fixture('trades-decision-added')
  const trade = tradesAfter.items[0] as { id: string; ticker: string }
  const editedTitle = added.label

  // 결정한 제안은 대기 목록과 배지에서 빠진다.
  const decided = new Set<string>()
  const pending = () => agentProposals.filter((p) => !decided.has(p.id))
  api.on('GET', '/api/me/proposals?status=PENDING&page=0&size=20', () => ({ body: pageOf(pending()) }))
  api.on('GET', '/api/me/proposals/summary', () => ({ body: { pending: pending().length } }))
  api.on('POST', `/api/me/proposals/${create.id}/accept`, () => {
    decided.add(create.id)
    return { body: accepted }
  })
  api.on('POST', `/api/me/proposals/${note.id}/reject`, () => {
    decided.add(note.id)
    return { body: rejected }
  })
  // 승인으로 만든 결정의 근거 따라가기. 스냅샷 결정의 따라가기에서 지금 항목만 새 결정으로 바꾼다.
  const trace = api.fixture('node-decision-trace')
  api.on('GET', `/api/nodes/${added.id}/trace`, {
    body: { ...trace, rootId: added.id, steps: trace.steps.map((s: { depth: number }) => (s.depth === 0 ? { ...s, node: addedDetail.node } : s)) },
  })
  // 체결은 승인 뒤 새 결정과 이어져 있다. 지우면 비어 있다.
  let tradeDeleted = false
  api.on('GET', '/api/me/trades?page=0&size=20', () => ({ body: tradeDeleted ? pageOf([]) : tradesAfter }))
  api.on('DELETE', `/api/me/trades/${trade.id}`, () => {
    tradeDeleted = true
    return { status: 204 }
  })
  api.on('GET', `/api/graph/neighborhood?id=${security.id}&hops=1`, { body: graphOf(api, security) })
  noMark(api, added.id, security.id)

  // 1. 발급 창에서 「조회와 기록」 을 고르면 범위 안내가 보이고 그 범위로 발급한다.
  await openApp(page)
  await openScreen(page, 'tokens')
  await openTokensAdvanced(page)
  await page.getByTestId('tokens-issue-open').click()
  await page.getByTestId('tokens-issue-scope-write').check()
  await expect(page.getByTestId('tokens-issue-scope-hint')).toBeVisible()
  await page.getByTestId('tokens-issue-submit').click()
  await expect(page.getByTestId('tokens-issued-value')).toHaveValue(api.fixture('token-issued').token)
  expect(api.lastRequest('POST', '/api/me/tokens').body).toEqual({ name: 'Hermes', scope: 'READ_WRITE' })
  await page.getByTestId('tokens-issued-close').click()
  await expect(page.locator('[data-testid="tokens-row"][data-name="Hermes"]').getByTestId('tokens-row-scope')).toHaveAttribute('data-scope', 'READ_WRITE')

  // 2. 대기 수 배지가 보이고 더보기 안의 배지와 같다.
  await expect(page.getByTestId('more-pending-badge')).toHaveAttribute('data-count', String(agentProposals.length))
  await page.getByTestId('more-open').click()
  await expect(page.getByTestId('more-item-proposals-badge')).toHaveAttribute('data-count', String(agentProposals.length))
  await page.keyboard.press('Escape')
  await openScreen(page, 'proposals')
  const card = (id: string) => page.locator(`[data-testid="proposal-card"][data-id="${id}"]`)
  await expect(card(create.id)).toBeVisible()
  await expect(card(note.id)).toBeVisible()
  await expect(card(create.id).getByTestId('proposal-summary')).toContainText(String((create.payload.properties as { title: string }).title))
  await expect(card(create.id).getByTestId('proposal-rationale')).toBeVisible()
  await shot(page, 'proposals-wide')

  // 3. 항목 만들기는 제목을 고쳐 승인하고, 공부 메모는 이유를 적어 거절한다. 그때마다 배지가 한 개씩 준다.
  await card(create.id).getByTestId('proposal-edit-open').click()
  await card(create.id).getByTestId('proposal-edit-prop-title').fill(editedTitle)
  await card(create.id).getByTestId('proposal-edit-submit').click()
  await expect(page.getByTestId('proposals-message')).toHaveAttribute('data-kind', 'success')
  await expect(card(create.id)).toHaveCount(0)
  await expect(page.getByTestId('more-pending-badge')).toHaveAttribute('data-count', String(agentProposals.length - 1))
  expect(api.lastRequest('POST', `/api/me/proposals/${create.id}/accept`).body).toMatchObject({
    payload: { ...create.payload, properties: { ...(create.payload.properties as object), title: editedTitle } },
  })
  await card(note.id).getByTestId('proposal-reject-open').click()
  await page.getByTestId('proposal-reject-reason').fill(rejected.decisionNote)
  await page.getByTestId('proposal-reject-confirm').click()
  await expect(card(note.id)).toHaveCount(0)
  expect(api.lastRequest('POST', `/api/me/proposals/${note.id}/reject`).body).toEqual({ reason: rejected.decisionNote })

  // 4. 승인함에서 새 결정을 열면 체결 한 줄이 보이고, 근거 따라가기에도 체결 절이 있다.
  await page.getByTestId('proposals-status-ACCEPTED').click()
  await expect(card(create.id)).toHaveAttribute('data-status', 'ACCEPTED')
  const open = card(create.id).getByTestId('proposal-result-open')
  await expect(open).toHaveAttribute('data-node-id', added.id)
  await open.click()
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', added.id)
  await expect(page.getByTestId('detail-label')).toHaveText(exact(editedTitle))
  await expect(page.getByTestId('detail-trades').getByTestId('trade-list-item')).toHaveCount(1)
  await page.getByTestId('node-trace').click()
  await expect(page.getByTestId('trace-step-trades')).toBeVisible()

  // 5. 내 체결에 이은 결정은 고친 이름이다. 종목을 누르면 종목 상세에도 체결 절이 있다.
  await openScreen(page, 'trades')
  const row = page.locator(`[data-testid="trade-row"][data-id="${trade.id}"]`)
  await expect(row).toHaveAttribute('data-ticker', trade.ticker)
  await expect(row.getByTestId('trade-decisions')).toContainText(editedTitle)
  await shot(page, 'trades-wide')
  await row.getByTestId('trade-security').click()
  await expect(page.getByTestId('detail-panel')).toHaveAttribute('data-node-id', security.id)
  await expect(page.getByTestId('detail-trades')).toBeVisible()

  // 6. 체결을 지우면 그 체결의 삭제를 보내고 행이 사라진다.
  await openScreen(page, 'trades')
  await row.getByTestId('trade-delete').click()
  await page.getByTestId('trades-delete-confirm').click()
  await expect(page.getByTestId('trades-message')).toHaveAttribute('data-kind', 'success')
  await expect(row).toHaveCount(0)
  api.lastRequest('DELETE', `/api/me/trades/${trade.id}`)
})

test.describe('열람자', () => {
  test.use({ role: 'VIEWER' })

  test('7h) 열람자는 공유 지식을 만드는 제안을 승인하지 못하고 거절만 한다', async ({ page, api }) => {
    const create = (api.fixture('proposals-pending-agent').items as Proposal[]).find((p) => p.kind === 'CREATE_NODE')!
    let rejected = false
    api.on('GET', '/api/me/proposals?status=PENDING&page=0&size=20', () => ({ body: pageOf(rejected ? [] : [create]) }))
    api.on('GET', '/api/me/proposals/summary', () => ({ body: { pending: rejected ? 0 : 1 } }))
    api.on('POST', `/api/me/proposals/${create.id}/reject`, () => {
      rejected = true
      return { body: { ...create, status: 'REJECTED' } }
    })

    await openApp(page)
    await openScreen(page, 'proposals')
    const card = page.locator(`[data-testid="proposal-card"][data-id="${create.id}"]`)
    await expect(card.getByTestId('proposal-editor-required')).toBeVisible()
    await expect(card.getByTestId('proposal-accept')).toBeDisabled()
    await card.getByTestId('proposal-reject-open').click()
    await page.getByTestId('proposal-reject-confirm').click()
    await expect(card).toHaveCount(0)
    expect(api.lastRequest('POST', `/api/me/proposals/${create.id}/reject`).body).toBeNull()
  })
})

test('7k) 에이전트가 올린 항목 고치기, 항목 보관, 관계 보관, 주장 만들기 제안이 카드로 보이고, 고치기를 승인하고 보관을 거절한다', async ({ page, api }) => {
  type WithRefs = Proposal & { refs: { nodes: Record<string, NodeRef>; relationships: Record<string, { from: NodeRef; to: NodeRef }> } }
  const items = api.fixture('proposals-pending-instance').items as WithRefs[]
  const byKind = (kind: string) => items.find((p) => p.kind === kind)!
  const update = byKind('UPDATE_NODE')
  const archive = byKind('ARCHIVE_NODE')
  const archiveRelationship = byKind('ARCHIVE_RELATIONSHIP')
  const claim = byKind('CREATE_CLAIM')
  const rejected = api.fixture('proposal-reject-archive') as Proposal & { decisionNote: string }
  // 결정한 제안은 대기 목록과 배지에서 빠진다.
  const decided = new Set<string>()
  const pending = () => items.filter((p) => !decided.has(p.id))
  api.on('GET', '/api/me/proposals?status=PENDING&page=0&size=20', () => ({ body: pageOf(pending()) }))
  api.on('GET', '/api/me/proposals/summary', () => ({ body: { pending: pending().length } }))
  api.on('POST', `/api/me/proposals/${update.id}/accept`, () => {
    decided.add(update.id)
    return { body: api.fixture('proposal-accept-update') }
  })
  api.on('POST', `/api/me/proposals/${archive.id}/reject`, () => {
    decided.add(archive.id)
    return { body: rejected }
  })

  await openApp(page)
  await openScreen(page, 'proposals')
  const card = (p: Proposal) => page.locator(`[data-testid="proposal-card"][data-id="${p.id}"]`)
  const label = (p: WithRefs, id: unknown) => p.refs.nodes[String(id)].label

  // 1. 종류마다 이름과 대상 항목이 보이고, 고쳐서 승인은 없다.
  const expected: [WithRefs, string, string[]][] = [
    [update, '항목 고치기', [label(update, update.payload.nodeId)]],
    [archive, '항목 보관', [label(archive, archive.payload.nodeId)]],
    [archiveRelationship, '관계 보관', Object.values(archiveRelationship.refs.relationships).flatMap((r) => [r.from.label, r.to.label])],
    [claim, '주장 만들기', [label(claim, claim.payload.subjectId), label(claim, claim.payload.objectId)]],
  ]
  for (const [p, kindName, names] of expected) {
    await expect(card(p)).toHaveAttribute('data-kind', p.kind)
    await expect(card(p).getByTestId('proposal-kind')).toHaveText(kindName)
    for (const name of names) await expect(card(p).getByTestId('proposal-summary')).toContainText(name)
    await expect(card(p).getByTestId('proposal-accept')).toBeEnabled()
    await expect(card(p).getByTestId('proposal-edit-open')).toHaveCount(0)
  }
  // 고치기는 바꿀 속성과 새 값을, 보관은 이유를, 주장 만들기는 근거 문서를 보인다.
  const newValue = (update.payload.properties as Record<string, string>).description
  await expect(card(update).locator('[data-testid="proposal-prop"][data-prop="description"]')).toContainText(newValue)
  await expect(card(archive)).toContainText(`이유: ${String(archive.payload.reason)}`)
  await expect(card(archiveRelationship)).toContainText(`이유: ${String(archiveRelationship.payload.reason)}`)
  await expect(card(claim)).toContainText(`근거 문서: ${label(claim, (claim.payload.documentIds as string[])[0])}`)
  await shot(page, 'proposals-instance-wide')

  // 2. 고치기를 그대로 승인하면 본문 없이 승인을 보내고 카드가 빠진다.
  await card(update).getByTestId('proposal-accept').click()
  await expect(page.getByTestId('proposals-message')).toHaveAttribute('data-kind', 'success')
  await expect(card(update)).toHaveCount(0)
  expect(api.lastRequest('POST', `/api/me/proposals/${update.id}/accept`).body).toBeNull()

  // 3. 보관은 이유를 적어 거절하면 그 이유를 보내고 카드가 빠진다. 나머지 둘은 남는다.
  await card(archive).getByTestId('proposal-reject-open').click()
  await page.getByTestId('proposal-reject-reason').fill(rejected.decisionNote)
  await page.getByTestId('proposal-reject-confirm').click()
  await expect(card(archive)).toHaveCount(0)
  expect(api.lastRequest('POST', `/api/me/proposals/${archive.id}/reject`).body).toEqual({ reason: rejected.decisionNote })
  await expect(card(archiveRelationship)).toBeVisible()
  await expect(card(claim)).toBeVisible()
})
