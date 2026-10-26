import path from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'

// 화면 테스트 파일들이 함께 쓰는 스크린샷과 화면 열기 도우미다.

const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? 'test-results/screenshots'

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), fullPage: true })
}

/** 스크롤 영역 안의 한 요소만 찍는다. 전체 화면 스크린샷이 스크롤 아래쪽만 담는 화면에 쓴다. */
export async function shotElement(locator: Locator, name: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded()
  await locator.screenshot({ path: path.join(screenshotDir, `${name}.png`) })
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function exact(text: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`)
}

type ScreenKey = 'map' | 'workspace' | 'list' | 'study' | 'changes' | 'ontology' | 'review' | 'users' | 'tokens' | 'proposals' | 'trades'

const TOP_SCREENS: ScreenKey[] = ['map', 'workspace', 'list', 'study']

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

/** 앱이 돌아올 loopback 주소. 화면 테스트는 이 주소를 page.route 로 받는다 */
export const OAUTH_CALLBACK = 'http://127.0.0.1:43210/callback'
