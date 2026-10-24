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
  // 가짜 서버(http://localhost:8090/default/authorize?...)의 interactiveLogin 폼이다.
  await page.waitForURL(/\/authorize/)
  await page.locator('input[name=username]').fill(user.sub)
  await page
    .locator('textarea[name=claims]')
    .fill(JSON.stringify({ email: user.email, email_verified: user.emailVerified ?? true, name: user.name }))
  await page.locator('input[type=submit]').click()

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

export type ScreenKey = 'map' | 'workspace' | 'list' | 'changes' | 'ontology' | 'review' | 'users'

const TOP_SCREENS: ScreenKey[] = ['map', 'workspace', 'list']

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
}

export async function newPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  // 가짜 OIDC 서버의 세션 쿠키가 섞이지 않게 사용자마다 새 context 를 쓴다.
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}
