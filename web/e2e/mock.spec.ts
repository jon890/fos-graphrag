import { expect, test } from './mock/test'

// 가짜 API 자체를 확인한다. 로그인 상태와 역할, CSRF 계약, 없는 요청의 실패를 본다.

test.describe('열람자로 로그인한 상태', () => {
  test.use({ role: 'VIEWER' })

  test('머리글의 역할 배지가 VIEWER 다', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('current-user-role')).toHaveAttribute('data-role', 'VIEWER')
  })
})

test.describe('로그아웃 상태', () => {
  test.use({ role: null })

  test('「Google 로 로그인」 을 누르면 로그인되어 이름이 보인다', async ({ page, api }) => {
    await page.goto('/')
    await expect(page.getByTestId('current-user-name')).toHaveCount(0)
    await page.getByTestId('login-google').click()
    await expect(page.getByTestId('current-user-name')).toHaveText(api.fixture('auth-me-editor').displayName)
    await expect(page.getByTestId('current-user-role')).toHaveAttribute('data-role', 'EDITOR')
  })
})

test.describe('허용하지 않은 로그인', () => {
  test.use({ role: null, loginResult: 'denied' })

  test('「접근 권한이 없습니다」 안내가 보인다', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('login-google').click()
    await expect(page.getByTestId('login-denied')).toBeVisible()
    await expect(page.getByTestId('login-google')).toBeVisible()
  })
})

test('CSRF 토큰 없는 쓰기는 403 CSRF_REJECTED 이고, /api/auth/csrf 는 계약의 본문과 쿠키를 준다', async ({ page, api }) => {
  await page.goto('/')
  await expect(page.getByTestId('current-user-name')).toBeVisible()

  const rejected = await page.evaluate(async () => {
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Company', properties: { name: 'x' } }),
    })
    return { status: res.status, body: await res.json() }
  })
  expect(rejected.status).toBe(403)
  expect(rejected.body.code).toBe('CSRF_REJECTED')
  expect(api.lastRequest('POST', '/api/nodes').body).toEqual({ type: 'Company', properties: { name: 'x' } })

  const csrf = await page.evaluate(async () => {
    const res = await fetch('/api/auth/csrf')
    return { status: res.status, body: await res.json(), cookie: document.cookie }
  })
  expect(csrf.status).toBe(200)
  expect(csrf.body).toEqual({ headerName: 'X-XSRF-TOKEN', cookieName: 'XSRF-TOKEN' })
  expect(csrf.cookie).toContain('XSRF-TOKEN=')

  // 쿠키와 같은 토큰을 보내면 CSRF 검사를 지나 응답 고르기로 넘어간다
  api.on('POST', '/api/nodes', { status: 201, body: api.fixture('node-company') })
  const accepted = await page.evaluate(async () => {
    const token = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('XSRF-TOKEN='))!
      .slice('XSRF-TOKEN='.length)
    const res = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(token) },
      body: '{}',
    })
    return res.status
  })
  expect(accepted).toBe(201)
})

test('스냅샷에 없는 요청은 501 이고 missing 에 남는다', async ({ page, api }) => {
  await page.goto('/')
  await expect(page.getByTestId('current-user-name')).toBeVisible()
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/unknown')
    return { status: r.status, body: await r.json() }
  })
  expect(res.status).toBe(501)
  expect(res.body).toEqual({ code: 'MOCK_MISSING', request: 'GET /api/unknown' })
  expect(api.missing).toEqual(['GET /api/unknown'])
  expect(() => api.assertNoMissing()).toThrow(/GET \/api\/unknown/)
  // fixture 가 끝에 다시 검사하므로 비운다
  api.missing.length = 0
})
