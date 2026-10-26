import { test as base } from '@playwright/test'
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

export const test = base.extend<MockFixtures>({
  role: ['EDITOR', { option: true }],
  signedInRole: ['EDITOR', { option: true }],
  loginResult: ['success', { option: true }],
  // 테스트가 api 를 받지 않아도 8080 으로 요청이 새지 않게 늘 붙인다.
  api: [
    async ({ page, role, signedInRole, loginResult }, use) => {
      const api = await mockApi(page, { role, signedInRole, loginResult })
      await use(api)
      api.assertNoMissing()
    },
    { auto: true },
  ],
})
