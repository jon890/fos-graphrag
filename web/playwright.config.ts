import { defineConfig, devices } from '@playwright/test'

// 웹을 빌드해 Vite preview 서버(운영 CSP 를 건다)로 띄우고, 화면이 부르는 API 는 e2e/mock 의 가짜 API 가 page.route 로 받는다.
// 개발자가 쓰는 5173 과 겹치지 않게 5180 을 쓴다.
// 다른 워크트리가 띄운 서버를 재사용하면 그 코드로 테스트하게 되므로 늘 새로 띄운다. 포트가 차 있으면 --strictPort 로 실패한다.
const BASE_URL = 'http://127.0.0.1:5180'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'npx vite build && npx vite preview --host 127.0.0.1 --port 5180 --strictPort',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
})
