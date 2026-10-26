import { defineConfig, devices } from '@playwright/test'

// Vite 개발 서버를 띄우고, 화면이 부르는 API 는 e2e/mock 의 가짜 API 가 page.route 로 받는다.
// 개발자가 쓰는 5173 과 겹치지 않게 5180 을 쓴다.
const BASE_URL = 'http://127.0.0.1:5180'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
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
      // workbench.spec.ts 는 Compose 서버가 필요한 옛 시나리오다. 가짜 API 로 옮기면 지운다.
      testIgnore: [/mobile\.spec\.ts$/, /workbench\.spec\.ts$/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
  ],
})
