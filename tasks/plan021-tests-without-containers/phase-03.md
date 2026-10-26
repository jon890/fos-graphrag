# Phase 03. 가짜 API 와 Playwright 설정을 만들고 휴대폰 폭 화면 테스트를 옮긴다

**Execution profile**: deep

## 목표

Playwright 가 Vite 개발 서버를 띄우고 가짜 API 로 도는 기반을 만든다. 첫 소비자로 `web/e2e/mobile.spec.ts` 를 가짜 API 위로 옮긴다.

**범위 외**: `web/e2e/workbench.spec.ts` 의 시나리오(phase 04, 05). 이 phase 동안 그 파일은 Playwright 가 돌리지 않게 빼 두고, 타입 검사는 계속 통과해야 한다.

## 컨텍스트

- phase 02 가 만든 `web/e2e/fixtures/<이름>.json` 은 `{"request": {"method", "path", "query"}, "status", "body"}` 모양이다. id 는 `00000000-0000-4000-8000-<순번>` 이다. 이름 목록은 `ls web/e2e/fixtures` 로 본다.
- 화면이 부르는 경로는 `web/src/api/client.ts` 가 소유한다. CSRF 는 `/api/auth/csrf` 가 심은 `XSRF-TOKEN` 쿠키를 `X-XSRF-TOKEN` 헤더로 보낸다(`web/src/api/csrf.ts`). 로그인은 `GOOGLE_LOGIN_PATH`(`/oauth2/authorization/google`)로 이동하고, 서버는 허용하지 않은 로그인을 `/?login=denied` 로 돌려보낸다(`web/src/App.tsx` 의 `readLoginDenied`).
- `web/vite.config.ts` 의 개발 서버는 `/api`, `/oauth2`, `/login/oauth2`, `/oauth/`, `/.well-known`, `/mcp` 를 `127.0.0.1:8080` 으로 넘긴다. 가짜 API 가 이 경로를 모두 `page.route` 로 먼저 받으므로 8080 에 서버가 없어도 된다.
- `web/tsconfig.node.json` 이 `e2e` 를 타입 검사에 넣는다. `workbench.spec.ts` 가 쓰는 `web/e2e/support.ts` 의 기존 export 는 phase 05 까지 지우지 않는다.
- 지금 `mobile.spec.ts` 의 시나리오와 셀렉터는 그 파일과 `web/TESTIDS.md` 가 소유한다.

**근거 문서**: `docs/code-architecture.md` 의 「가짜 API」, `docs/adr/018-tests-without-containers.md`

## 의도 메모

- 가짜 API 를 상태 있는 메모리 서버로 만들지 않는다. 서버 규칙을 두 벌 유지하게 된다(ADR-018 의 「메모리 가짜 저장소」). 만들기 같은 쓰기는 기록하고 스냅샷이나 테스트가 준 응답을 돌려준다.
- 스냅샷에도 덮어쓰기에도 없는 요청은 501 로 답하고 테스트 끝에 실패시킨다. 조용히 빈 응답을 주면 빠진 계약이 숨는다.
- 개발 서버 포트는 5180 이다. 개발자가 쓰는 5173 과 겹치지 않게 한다.

## 작업 항목

### 1. `web/e2e/mock/api.ts`(신규)

`class MockApi` 와 `async function mockApi(page: Page, options: MockOptions): Promise<MockApi>`.
`type MockOptions = { role?: Role | null; signedInRole?: Role; loginResult?: 'success' | 'denied' }`, `type Role = 'VIEWER' | 'EDITOR' | 'ADMIN'`. `role` 기본값은 `'EDITOR'`(로그인 상태), `null` 이면 로그아웃 상태다.

- 시작할 때 `web/e2e/fixtures/*.json` 을 읽어 `METHOD path?query` 를 키로 둔다. 요청의 query 는 `URLSearchParams` 순서 그대로 비교한다. 같은 키의 스냅샷이 둘 이상이면 읽을 때 실패한다. 예외는 `auth-me-*` 넷(모두 `GET /api/auth/me`)이고 아래 로그인 규칙이 고른다. 같은 요청의 다른 상태는 테스트가 `on` 과 `fixture(name)` 으로만 준다.
- `page.route` 로 `/api/**`, `/oauth2/**`, `/login/oauth2/**`, `/oauth/**`, `/.well-known/**`, `/mcp` 를 받는다. Vite 의 모듈 요청(`/src/**`, `/@vite/**`, `/node_modules/**`)은 건드리지 않는다.
- 응답 고르는 순서: 테스트가 `on(method, path, response | handler)` 로 준 덮어쓰기, 그다음 스냅샷. 둘 다 없으면 501 과 `{"code":"MOCK_MISSING","request":"..."}` 로 답하고 `missing` 에 쌓는다.
- 로그인: `role` 이 `null` 이면 `/api/auth/me` 가 `auth-me-anonymous` 다. `/oauth2/authorization/google` 를 받으면 `options.loginResult` 가 `'denied'` 이면 `/?login=denied` 로, 아니면 `signedInRole`(기본 `EDITOR`)로 로그인 상태를 바꾸고 `/` 로 302 한다. 로그인 상태면 `/api/auth/me` 는 `auth-me-<role 소문자>` 다.
- CSRF 는 `docs/api-contract.md` 의 계약을 따른다. `/api/auth/csrf` 는 `XSRF-TOKEN=mock-csrf` 쿠키를 심고 `200 {"headerName":"X-XSRF-TOKEN","cookieName":"XSRF-TOKEN"}` 이다. `/api` 아래 `POST`, `PUT`, `PATCH`, `DELETE` 요청의 `X-XSRF-TOKEN` 이 쿠키와 다르면 `403 {"code":"CSRF_REJECTED","message":"..."}` 로 답한다. 화면은 이 코드를 받으면 토큰을 새로 받아 한 번 다시 보낸다(`web/src/api/client.ts`). `/oauth/token`, `/oauth/register` 처럼 서버가 CSRF 를 보지 않는 경로는 계약을 따라 뺀다.
- `requests: { method, path, query, body }[]` 에 받은 요청을 쌓는다. `lastRequest(method, path)` 를 둔다.
- `fixture(name)` 은 스냅샷의 `body` 를 깊은 복사로 돌려준다. 테스트는 이것을 고쳐 `on` 에 넘긴다.
- `assertNoMissing()` 은 `missing` 이 비어 있지 않으면 요청 목록과 함께 실패한다.

### 2. `web/e2e/mock/test.ts`(신규)

`@playwright/test` 의 `test` 를 `extend` 해 `api` fixture 와 옵션 fixture 셋(`role`, `signedInRole`, `loginResult`, 기본값은 `MockOptions` 와 같다)을 준다. 각 테스트는 `test.use({ role: 'EDITOR' })`, `test.use({ role: null, loginResult: 'denied' })` 처럼 고르고, fixture 가 끝날 때 `api.assertNoMissing()` 을 부른다. 스크린샷 도우미 `shot` 은 기존 `web/e2e/support.ts` 의 것을 다시 내보낸다.

### 3. `web/playwright.config.ts`

- `webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5180 --strictPort', url: 'http://127.0.0.1:5180', reuseExistingServer: !process.env.CI, timeout: 60_000 }` 를 더한다.
- `baseURL` 은 `http://127.0.0.1:5180` 로 고정하고 `WORKBENCH_URL` 을 지운다.
- `fullyParallel: true` 로 바꾸고 `workers` 는 지정하지 않는다. 테스트끼리 서버 상태를 공유하지 않는다.
- `chromium` project 의 `testIgnore` 에 `/workbench\.spec\.ts$/` 를 이 phase 동안 더한다. 주석에 「phase 05 에서 옮긴 뒤 지운다」 가 아니라 「Compose 서버가 필요한 옛 시나리오. 가짜 API 로 옮기면 지운다」 로 적는다.
- 1440×900 의 `chromium` 과 390×844 의 `mobile` 두 project 는 그대로 둔다.

### 4. `web/e2e/mobile.spec.ts`

8개 시나리오를 가짜 API 위로 옮긴다. 로그인은 `mockApi` 의 역할로 하고, 만들기와 발급, 동의 같은 쓰기는 화면이 보낸 요청의 경로와 본문을 `api.lastRequest` 로 확인한다. 만든 뒤 보이는 상세는 `api.on` 으로 스냅샷(`node-company` 등)을 고쳐 준다.
가로 스크롤 검사(`expectNoHorizontalOverflow`)와 스크린샷 이름은 그대로 둔다. 실행마다 다른 접미사(`suffix`)는 필요 없으면 지운다.
서버에만 기대는 검사(예: 발급한 토큰으로 `/api/v1` 을 부르면 200)는 화면 테스트에서 빼고, 같은 검사를 하는 서버 JUnit 테스트 이름을 `.orch/pr-body-plan021-tests-without-containers.md` 의 「옮긴 시나리오」 표에 적는다. 그런 JUnit 테스트가 없으면 해당 `*IntegrationTest` 에 더한다.

### 5. 이 phase 를 검증하는 `web/e2e/mock.spec.ts`(신규)

가짜 API 자체를 확인한다. `chromium` project 에서 돈다.

- 정상: 열람자로 `/` 를 열면 머리글의 `current-user-role` 이 `VIEWER` 다. 로그아웃 상태에서 `login-google` 을 누르면 로그인되어 `current-user-name` 이 보인다.
- 실패: `X-XSRF-TOKEN` 없이 `page.evaluate` 로 `POST /api/nodes` 를 보내면 `403 CSRF_REJECTED` 다. `/api/auth/csrf` 는 200 과 계약의 본문을 준다. 스냅샷에 없는 `GET /api/unknown` 은 501 이고 `missing` 에 남는다(이 테스트는 끝에 `missing` 을 비워 fixture 의 실패 검사를 피한다).
- `loginResult: 'denied'` 이면 `login-denied` 가 보인다.

### 6. `web/e2e/support.ts`

옛 시나리오가 쓰는 export 는 지우지 않는다. 화면 테스트가 함께 쓰는 순수 도우미(`shot`, `shotElement`, `exact`, `escapeRegExp`, `openScreen`, `OAUTH_CALLBACK`)는 그대로 두고, 새 spec 은 이것만 가져다 쓴다. 로그인 도우미는 `mock/test.ts` 가 맡는다. 바꿀 것이 없으면 이 파일은 고치지 않는다.

### 7. 문서와 TESTIDS

- `web/TESTIDS.md` 머리말의 「e2e 테스트가 기대는 셀렉터다. 이름을 바꾸면 `e2e/workbench.spec.ts` 와 `e2e/mobile.spec.ts` 도 함께 고친다」 를 「화면 테스트(`e2e/*.spec.ts`)가 기대는 셀렉터다. 이름을 바꾸면 그 테스트도 함께 고친다」 로 바꾼다.
- `README.md` 「검증」 에 `cd web && npx playwright install chromium && npm run test:e2e   # 가짜 API 로 1440px, 390px 화면 테스트` 를 더한다. Compose 줄은 phase 05 에서 지운다.

## 검증

```bash
cd api && DOCKER_HOST=unix:///nonexistent.sock ./gradlew test --rerun
cd web && npm run typecheck && npm test && npm run build
cd web && DOCKER_HOST=unix:///nonexistent.sock npx playwright test e2e/mock.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
bash scripts/tests/test_scripts.sh
```

- 셋째 줄은 Docker 와 API 서버 없이 통과해야 한다. 스크린샷은 `web/test-results/screenshots/` 에 있고 직접 열어 화면이 깨지지 않았는지 본다.
- 셋째 줄이 끝난 뒤 5180 포트를 쥔 프로세스가 남지 않는다(`lsof -i :5180` 이 비어 있다).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `web/e2e/mock/api.ts` | 신규 |
| `web/e2e/mock/test.ts` | 신규 |
| `web/e2e/mock.spec.ts` | 신규 |
| `web/e2e/mobile.spec.ts` | 수정 |
| `web/e2e/support.ts` | 수정 |
| `web/playwright.config.ts` | 수정 |
| `web/TESTIDS.md` | 수정 |
| `web/e2e/fixtures/*.json` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/snapshot/ApiSnapshotTest.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/**/*IntegrationTest.kt` | 수정 |
| `README.md` | 수정 |
