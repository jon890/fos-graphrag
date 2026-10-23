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
 */
export async function loginAs(
  page: Page,
  user: TestUser,
  expectResult: 'success' | 'denied' = 'success',
  startPath = '/',
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
  // 온톨로지를 받아야 작업 공간이 그려진다.
  await expect(page.getByTestId('search-input')).toBeVisible()
}

export async function newPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  // 가짜 OIDC 서버의 세션 쿠키가 섞이지 않게 사용자마다 새 context 를 쓴다.
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}
