import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'

// 브라우저 테스트 파일들이 함께 쓰는 사용자와 로그인, 스크린샷 도우미다.

export interface TestUser {
  sub: string
  email: string
  name: string
  emailVerified?: boolean
}

export const admin: TestUser = {
  sub: process.env.E2E_ADMIN_SUB ?? 'admin-sub',
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com',
  name: process.env.E2E_ADMIN_NAME ?? '관리자',
}

export const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? 'test-results/screenshots'

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true })
}

/** 스크롤 영역 안의 한 요소만 찍는다. 전체 화면 스크린샷이 스크롤 아래쪽만 담는 화면에 쓴다. */
export async function shotElement(locator: Locator, name: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded()
  await locator.screenshot({ path: path.join(screenshotDir, `${name}.png`) })
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function exact(text: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`)
}

/**
 * 「Google 로 로그인」 을 누른 뒤 열린 가짜 OIDC 서버(http://localhost:8090/default/authorize?...)의 interactiveLogin 폼을 채워 보낸다.
 * 머리글이 없는 화면(`/connect`)에서도 쓸 수 있도록 로그인 뒤 화면은 기다리지 않는다.
 */
export async function fillMockOidc(page: Page, user: TestUser): Promise<void> {
  await page.waitForURL(/\/authorize/)
  await page.locator('input[name=username]').fill(user.sub)
  await page
    .locator('textarea[name=claims]')
    .fill(JSON.stringify({ email: user.email, email_verified: user.emailVerified ?? true, name: user.name }))
  await page.locator('input[type=submit]').click()
}

/**
 * 앱의 「Google 로 로그인」 을 눌러 가짜 OIDC 서버의 로그인 폼을 채운다.
 * expect 가 success 면 앱에 로그인된 것을, denied 면 「접근 권한이 없습니다」 화면을 확인한다.
 * 첫 접속 가이드가 열리면 기본으로 건너뛴다. 가이드를 확인하는 테스트만 guide: 'keep' 으로 남긴다.
 */
export async function loginAs(
  page: Page,
  user: TestUser,
  expectResult: 'success' | 'denied' = 'success',
  startPath = '/',
  options: { guide?: 'skip' | 'keep' } = {},
): Promise<void> {
  await page.goto(startPath)
  await page.getByTestId('login-google').click()
  await fillMockOidc(page, user)

  if (expectResult === 'denied') {
    await expect(page.getByTestId('login-denied')).toBeVisible()
    await expect(page.getByTestId('login-google')).toBeVisible()
    return
  }
  await expect(page.getByTestId('current-user-name')).toHaveText(user.name)
  // 첫 화면(/)은 개념 지도다. 온톨로지를 받아야 지도가 그려진다. 다른 화면으로 들어왔으면 그 화면의 탭이 선택된 것을 본다.
  const screen = screenOfPath(startPath)
  if (screen === 'map') {
    await expect(page.getByTestId('tab-map')).toBeVisible()
    await expect(page.getByTestId('concept-map')).toBeVisible()
  } else if (TOP_SCREENS.includes(screen)) {
    await expect(page.getByTestId(`tab-${screen}`)).toHaveAttribute('aria-selected', 'true')
  } else {
    await expect(page.getByTestId('more-open')).toHaveAttribute('data-active', 'true')
  }
  if (options.guide === 'keep') return
  // 끝낸 기록이 있는 사용자나 다른 탭으로 들어온 사용자는 가이드가 열리지 않는다.
  const bubble = page.getByTestId('guide-bubble')
  const opened = await bubble
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false)
  if (!opened) return
  // 따라하기 진행 상태가 남아 있으면 첫 단계는 「이어서 하기」 질문이라 건너뛰기 대신 그만두기를 누른다.
  const stop = page.getByTestId('guide-stop')
  if (await stop.isVisible()) await stop.click()
  else await page.getByTestId('guide-skip').click()
  await expect(bubble).toHaveCount(0)
}

export type ScreenKey = 'map' | 'workspace' | 'list' | 'study' | 'changes' | 'ontology' | 'review' | 'users' | 'tokens' | 'proposals' | 'trades'

const TOP_SCREENS: ScreenKey[] = ['map', 'workspace', 'list', 'study']

/** 주소가 열리는 화면. `/` 는 개념 지도이고, 옛 `/?node=` 링크는 작업 공간이다 */
function screenOfPath(startPath: string): ScreenKey {
  const url = new URL(startPath, 'http://localhost')
  if (url.pathname === '/') return url.searchParams.get('node') ? 'workspace' : 'map'
  return url.pathname.slice(1) as ScreenKey
}

/** 화면을 연다. 상단 탭이면 탭을, 아니면 「더보기」 메뉴의 항목을 누른다 */
export async function openScreen(page: Page, key: ScreenKey): Promise<void> {
  if (TOP_SCREENS.includes(key)) {
    await page.getByTestId(`tab-${key}`).click()
    return
  }
  await page.getByTestId('more-open').click()
  await page.getByTestId(`more-item-${key}`).click()
  // 닫히는 애니메이션이 끝나기 전에 스크린샷을 찍으면 메뉴가 겹쳐 찍힌다.
  await expect(page.locator('[data-testid^="more-item-"]')).toHaveCount(0)
}

export async function newPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  // 가짜 OIDC 서버의 세션 쿠키가 섞이지 않게 사용자마다 새 context 를 쓴다.
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

/** 이 페이지의 사용자가 지금 가진(폐기하지 않은) 연동 토큰 id */
export async function tokenIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const list: { id: string }[] = await (await fetch('/api/me/tokens')).json()
    return list.map((t) => t.id)
  })
}

/**
 * 이 페이지의 사용자 세션으로 `keep` 에 없는 연동 토큰을 모두 폐기한다.
 * 테스트가 중간에 실패해도 발급한 토큰이 남지 않게 finally 에서 부른다. 이미 폐기된 토큰의 404 는 무시한다.
 * 정리 실패가 테스트의 원래 실패를 덮지 않게, 실패는 던지지 않고 로그로만 남긴다.
 */
export async function revokeTokensExcept(page: Page, keep: string[]): Promise<void> {
  try {
    const failed = await page.evaluate(async (kept) => {
      await fetch('/api/auth/csrf', { headers: { Accept: 'application/json' } })
      const xsrf = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('XSRF-TOKEN='))
        ?.slice('XSRF-TOKEN='.length)
      const list: { id: string }[] = await (await fetch('/api/me/tokens')).json()
      const errors: string[] = []
      for (const { id } of list.filter((t) => !kept.includes(t.id))) {
        const res = await fetch(`/api/me/tokens/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'X-XSRF-TOKEN': decodeURIComponent(xsrf ?? '') },
        })
        if (!res.ok && res.status !== 404) errors.push(`${id}: ${res.status}`)
      }
      return errors
    }, keep)
    if (failed.length > 0) console.warn(`연동 토큰 정리 실패: ${failed.join(', ')}`)
  } catch (e) {
    console.warn('연동 토큰 정리 실패', e)
  }
}

/**
 * 「연동 토큰」 화면에서 토큰을 발급해 원문을 돌려준다. 발급 창은 닫고 목록 화면에 남는다.
 * 호출한 쪽이 끝에 revokeTokensExcept 로 폐기한다.
 */
export async function issueToken(page: Page, name: string, scope: 'read' | 'write'): Promise<string> {
  await openScreen(page, 'tokens')
  const advanced = page.getByTestId('tokens-advanced')
  if (!(await advanced.evaluate((el) => (el as HTMLDetailsElement).open))) await advanced.locator('summary').click()
  await page.getByTestId('tokens-issue-open').click()
  await page.getByTestId('tokens-issue-name').fill(name)
  await page.getByTestId(`tokens-issue-scope-${scope}`).check()
  await page.getByTestId('tokens-issue-submit').click()
  const value = page.getByTestId('tokens-issued-value')
  await expect(value).toHaveValue(/^fwb_[A-Za-z0-9_-]{43}$/)
  const token = await value.inputValue()
  await page.getByTestId('tokens-issued-close').click()
  await expect(page.getByTestId('tokens-issue-dialog')).toHaveCount(0)
  return token
}

/**
 * 이 페이지의 사용자 세션으로 연결된 앱(OAuth 연결)을 모두 끊는다.
 * 앱 연결을 만든 테스트가 끝에 finally 에서 부른다. 정리 실패가 테스트의 원래 실패를 덮지 않게 로그로만 남긴다.
 */
export async function revokeConnections(page: Page): Promise<void> {
  try {
    const failed = await page.evaluate(async () => {
      await fetch('/api/auth/csrf', { headers: { Accept: 'application/json' } })
      const xsrf = document.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('XSRF-TOKEN='))
        ?.slice('XSRF-TOKEN='.length)
      const list: { id: string }[] = await (await fetch('/api/me/connections')).json()
      const errors: string[] = []
      for (const { id } of list) {
        const res = await fetch(`/api/me/connections/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'X-XSRF-TOKEN': decodeURIComponent(xsrf ?? '') },
        })
        if (!res.ok && res.status !== 404) errors.push(`${id}: ${res.status}`)
      }
      return errors
    })
    if (failed.length > 0) console.warn(`앱 연결 정리 실패: ${failed.join(', ')}`)
  } catch (e) {
    console.warn('앱 연결 정리 실패', e)
  }
}

/** 앱이 돌아올 loopback 주소. 브라우저 테스트는 이 주소를 page.route 로 받는다 */
export const OAUTH_CALLBACK = 'http://127.0.0.1:43210/callback'

export interface Pkce {
  verifier: string
  challenge: string
}

/** PKCE(S256) 검증값과 도전값 */
export function newPkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

/** `/oauth/register` 로 loopback 클라이언트를 등록하고 client_id 를 돌려준다 */
export async function registerOAuthClient(page: Page, name: string): Promise<string> {
  const res = await page.request.post(`${new URL(page.url()).origin}/oauth/register`, {
    data: { client_name: name, redirect_uris: [OAUTH_CALLBACK], token_endpoint_auth_method: 'none' },
  })
  expect(res.status()).toBe(201)
  return (await res.json()).client_id as string
}

/** 앱이 브라우저로 여는 `/oauth/authorize` 주소 */
export function authorizeUrl(origin: string, clientId: string, pkce: Pkce, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: OAUTH_CALLBACK,
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state,
    scope: 'read write',
    resource: `${origin}/mcp`,
  })
  return `${origin}/oauth/authorize?${params.toString()}`
}
