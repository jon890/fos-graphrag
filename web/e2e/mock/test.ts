import { test as base, type Page } from '@playwright/test'
import { mockApi, type MockApi, type Role } from './api'

// 가짜 API 를 붙인 test. 역할은 test.use({ role: 'ADMIN' }) 처럼 고른다.
// 테스트가 끝날 때 스냅샷에도 덮어쓰기에도 없는 요청이 있었으면 실패한다.

export { expect } from '@playwright/test'
export { shot } from '../support'
export type { MockApi, Role } from './api'

type MockFixtures = {
  role: Role | null
  signedInRole: Role
  loginResult: 'success' | 'denied'
  api: MockApi
}

/**
 * 운영 서버는 CSP `style-src 'self'` 로 실행 중에 넣는 <style> 을 막는다. Cytoscape 가 넣는
 * `.__________cytoscape_container { position: relative; }` 도 막혀 그래프 칸은 legacy.css 의 `position: absolute` 를 따른다.
 * 개발 서버에는 CSP 가 없어 그 규칙이 이기고 그래프 칸의 높이가 0 이 된다. Vite 도 CSS 를 <style> 로 넣어 CSP 를 그대로 걸 수 없으므로,
 * 같은 id 의 빈 <style> 을 먼저 두어 Cytoscape 가 규칙을 넣지 않게 한다(이미 있으면 넣지 않는다).
 */
async function emulateProductionStyleCsp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const id = '__________cytoscape_stylesheet'
    const add = () => {
      if (document.getElementById(id)) return
      const style = document.createElement('style')
      style.id = id
      ;(document.head ?? document.documentElement).appendChild(style)
    }
    if (document.documentElement) add()
    else document.addEventListener('readystatechange', add, { once: true })
  })
}

export const test = base.extend<MockFixtures>({
  role: ['EDITOR', { option: true }],
  signedInRole: ['EDITOR', { option: true }],
  loginResult: ['success', { option: true }],
  // 테스트가 api 를 받지 않아도 8080 으로 요청이 새지 않게 늘 붙인다.
  api: [
    async ({ page, role, signedInRole, loginResult }, use) => {
      await emulateProductionStyleCsp(page)
      const api = await mockApi(page, { role, signedInRole, loginResult })
      await use(api)
      api.assertNoMissing()
    },
    { auto: true },
  ],
})
