# Phase 04. 동의 화면과 「연동」 화면의 연결된 앱

**Execution profile**: standard

## 목표

앱이 연 브라우저에서 로그인하고 「연결 허용」 을 누르는 동의 화면(`/connect`)과, 더보기 「연동」 화면의 「연결된 앱」 목록과 끊기를 만든다.

**범위 외**: 서버 API(phase 02 가 만들었다), 플러그인(phase 05). 브라우저 테스트는 이 phase 에서 쓰고, 실행은 구현 마감의 통합 검증에서 한 번 한다.

## 컨텍스트

- 화면 규칙과 문구는 `docs/flow.md` 의 「앱 연결」 의 「동의 화면」, 「연동」 의 「연결된 앱」 이 소유한다. 문구를 그대로 옮긴다.
- API 는 `docs/api-contract.md` 의 「OAuth 인가 서버」 의 「인가 요청과 동의」(`GET`, `POST /api/oauth/authorize`, `AuthorizationPreview`, `OAUTH_INVALID_CLIENT`, `OAUTH_REDIRECT_ERROR`)와 「연결된 앱」(`ConnectionView`)이다.
- fetch 래퍼와 CSRF 는 `web/src/api/client.ts` 의 `api` 객체와 `buildQuery` 를 따른다. 타입은 `web/src/api/types.ts`.
- `web/src/App.tsx` 는 시작할 때 `rememberReturnTo` 로 주소를 두고 `api.auth.me()` 로 로그인을 확인한다. 로그인하지 않았으면 `LoginView` 를 그린다. 로그인했으면 모르는 경로를 `/map` 으로 바꿔 연다. `/connect` 는 이 바꿔 열기와 머리글, 탭, 첫 접속 가이드(`GuideProvider`), 온톨로지 읽기를 모두 건너뛰고 `ConnectPage` 만 그려야 한다.
- 로그인 뒤 돌아갈 주소 검사는 `web/src/routes.ts` 의 `isSafeReturnTo` 가 `TAB_PATHS` 의 경로만 받는다. `/connect` 는 탭이 아니므로 `TAB_PATHS` 에 넣지 않고 `isSafeReturnTo` 가 따로 받게 한다.
- 「연동」 화면은 `web/src/components/tokens/TokensTab.tsx` 다. 표, 확인 창, 좁은 화면의 두 줄 쌓기는 이 파일의 연동 토큰 표를 본뜬다. 메뉴 이름은 `web/src/components/header/MoreMenu.tsx` 의 `MORE_LABEL.tokens` 다.
- 컴포넌트 테스트는 `react-dom/server` 렌더링이다(`web/src/components/tokens/TokensTab.test.tsx`, `web/src/components/testSupport.tsx`).
- 브라우저 테스트의 로그인과 화면 열기는 `web/e2e/support.ts` 의 도우미를 쓴다. testid 목록은 `web/TESTIDS.md` 다.
- 개발 서버 프록시는 `web/vite.config.ts` 다.

**근거 문서**: `docs/flow.md` 「앱 연결」, 「연동」, 「주소와 뒤로가기」, 「로그인을 거치는 링크」, `docs/api-contract.md` 「OAuth 인가 서버」, 「연결된 앱」, `docs/code-architecture.md` 「웹 구조」

## 의도 메모

- 동의 결정 뒤 이동은 `window.location.assign(redirectUrl)` 이다. 돌아갈 주소는 서버가 검사해 만든 값만 쓴다. 화면이 query 로 주소를 만들지 않는다.
- 앱 이름은 앱이 정한 값이라 그대로 텍스트로 보이고 HTML 로 해석하지 않는다(React 기본 이스케이프).
- 「연동 토큰」 절의 testid(`tokens-*`)는 바꾸지 않는다. 기존 e2e 가 쓴다.

## 작업 항목

### 1. API 와 순수 규칙

- `web/src/api/types.ts`: `AuthorizationPreview`, `ConnectionView`, `ConsentDecision` 타입.
- `web/src/api/client.ts`: `api.oauth.preview(search: string)`(받은 query 를 붙인 `GET /api/oauth/authorize`), `api.oauth.decide(body)`(`POST /api/oauth/authorize`), `api.connections.list()`, `api.connections.disconnect(id)`.
- `web/src/lib/connect.ts`: `readAuthorizationQuery(search): Record<string, string>`(계약의 여덟 칸만 읽는다), `consentSentence(clientName, requestedScope)`, `redirectNotice(kind, host)`. 문구는 `docs/flow.md` 「동의 화면」 그대로.
- `web/src/routes.ts`: `export const CONNECT_PATH = '/connect'`, `isSafeReturnTo` 가 `/connect` 도 받는다. 「더보기」 주석을 「연동」 으로 고친다.

### 2. 동의 화면 `web/src/components/connect/ConnectPage.tsx`

- 처음 그릴 때 `api.oauth.preview(location.search)` 를 부른다. 결과에 따라 동의 본문, `OAUTH_INVALID_CLIENT` 화면, `OAUTH_REDIRECT_ERROR` 화면을 그린다. 범위 라디오, 「연결 허용」, 「거절」, 진행 중 안내, 실패 안내는 `docs/flow.md` 「동의 화면」 대로다.
- testid: `connect-page`, `connect-user`, `connect-sentence`, `connect-redirect`, `connect-warning`, `connect-scope-write`, `connect-scope-read`, `connect-allow`, `connect-deny`, `connect-progress`, `connect-error`, `connect-invalid`, `connect-back`(앱으로 돌아가기). `web/TESTIDS.md` 에 「앱 연결」 절로 더한다.
- `web/src/App.tsx`: 경로가 `CONNECT_PATH` 면 로그인한 뒤 `ConnectPage` 만 그린다. 로그인하지 않았으면 `LoginView` 에 `notice="앱을 연결하려면 먼저 Google 로 로그인하세요."` 를 넘긴다(`notice` 의 testid 는 `login-notice`).

### 3. 「연동」 화면의 연결된 앱

- `web/src/components/tokens/ConnectionsSection.tsx`(신규): 「연결된 앱」 제목, 안내, 표(앱 이름, 범위, 연결한 때, 마지막 사용, 「연결 끊기」), 빈 상태, 확인 창, 끊은 뒤 안내, 실패와 「다시 시도」. testid: `connections-section`, `connections-guide`, `connections-empty`, `connections-table`, `connections-row`(`data-id`, `data-name`), `connections-row-name`, `connections-row-scope`(`data-scope`), `connections-row-created`, `connections-row-last-used`, `connections-row-disconnect`, `connections-confirm`, `connections-confirm-submit`, `connections-message`, `connections-error`, `connections-retry`.
- `TokensTab.tsx`: 화면 제목을 「연동」 으로 두고 위에 `ConnectionsSection`, 아래에 지금의 연동 토큰 부분을 「연동 토큰」 소제목과 함께 둔다.
- `MoreMenu.tsx`: `MORE_LABEL.tokens` 를 「연동」 으로. `MoreMenu.test.tsx` 와 `routes.test.ts` 가 옛 문구를 단언하면 고친다.
- `web/vite.config.ts`: 프록시에 `/oauth/`, `/.well-known`, `/mcp` 를 더한다(`changeOrigin: false`). 기존 `/oauth2` 키와 겹치지 않게 `/oauth/` 는 끝에 `/` 를 붙인다.

### 4. 이 phase 를 검증하는 테스트

- `web/src/lib/connect.test.ts`: `readAuthorizationQuery` 가 모르는 칸을 버리고 여덟 칸을 읽는다. `consentSentence('Claude Code', 'READ')` 가 「… 조회하려 합니다.」 로 끝나고 `READ_WRITE` 는 「조회하고 기록하려 합니다.」 로 끝난다. `redirectNotice('HTTPS', 'app.example')` 가 「app.example 로 돌아갑니다」 를 담는다.
- `web/src/routes.test.ts`: `isSafeReturnTo('/connect?client_id=x')` 가 참, `isSafeReturnTo('/connectx')` 는 거짓.
- `web/src/components/connect/ConnectPage.test.tsx`: preview 결과를 넣어 그린 HTML 에 앱 이름 문장, 「조회와 기록」 이 고른 상태, 두 단추가 있다. `requestedScope: 'READ'` 면 `connect-scope-write` 가 없다. `OAUTH_INVALID_CLIENT` 상태면 `connect-allow` 가 없다. 상태를 props 나 내보낸 순수 렌더 함수로 넣을 수 있게 컴포넌트를 나눈다(`TokensTab.test.tsx` 의 방식).
- `web/src/components/tokens/ConnectionsSection.test.tsx`: 빈 목록이면 「아직 연결한 앱이 없습니다.」, 한 줄이면 앱 이름과 「조회만」 이 보인다.
- `web/e2e/workbench.spec.ts` 에 「앱 연결 동의와 연결된 앱 끊기」 테스트: 로그인한 페이지에서 `page.request.post('/oauth/register', …)` 로 `redirect_uris: ['http://127.0.0.1:43210/callback']` 클라이언트를 등록하고, `page.route('http://127.0.0.1:43210/**', r => r.fulfill({ body: 'ok' }))` 로 돌아갈 곳을 받는다. PKCE 값을 만들어 `/oauth/authorize?…` 를 열고 `connect-allow` 를 눌러 `code` 가 붙은 주소로 이동하는지 본다. `page.request.post('/oauth/token', { form })` 로 토큰을 받고, `/tokens` 의 `connections-row` 에 앱이 보이며 「연결 끊기」 뒤 사라진다. 끊은 뒤 같은 갱신 토큰이 `400` 이다. 스크린샷을 `test-results/screenshots/` 에 남긴다(기존 테스트의 방식).
- `web/e2e/mobile.spec.ts` 에 390px 폭에서 동의 화면과 연결된 앱 표가 가로 스크롤 없이 보이는 테스트를 더한다. 가로 스크롤 검사는 이 파일의 기존 도우미를 쓴다.
- e2e 가 연결을 만들면 테스트 끝에 그 사용자의 연결을 모두 끊는다(`support.ts` 에 `revokeConnections(page)` 를 연동 토큰 정리 도우미 옆에 더한다).

## 검증

```bash
cd web && npx vitest run src/lib/connect.test.ts src/routes.test.ts src/components/connect/ConnectPage.test.tsx src/components/tokens/ConnectionsSection.test.tsx src/components/tokens/TokensTab.test.tsx src/components/header/MoreMenu.test.tsx
cd web && npm run typecheck && npm test && npm run build
cd web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts | grep -E '앱 연결|연결된 앱'
```

기대값: 첫 줄은 이 phase 의 테스트가 모두 통과한다. 둘째 줄은 오류 없이 끝나고 `vitest` 가 모두 통과한다. 셋째 줄은 새 e2e 테스트 이름을 보인다(실행은 통합 검증에서 한다).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `web/src/api/types.ts` | 수정 |
| `web/src/api/client.ts` | 수정 |
| `web/src/lib/connect.ts` | 신규 |
| `web/src/lib/connect.test.ts` | 신규 |
| `web/src/routes.ts` | 수정 |
| `web/src/routes.test.ts` | 수정 |
| `web/src/App.tsx` | 수정 |
| `web/src/components/connect/ConnectPage.tsx` | 신규 |
| `web/src/components/connect/ConnectPage.test.tsx` | 신규 |
| `web/src/components/tokens/ConnectionsSection.tsx` | 신규 |
| `web/src/components/tokens/ConnectionsSection.test.tsx` | 신규 |
| `web/src/components/tokens/TokensTab.tsx` | 수정 |
| `web/src/components/tokens/TokensTab.test.tsx` | 수정 |
| `web/src/components/header/MoreMenu.tsx` | 수정 |
| `web/src/components/header/MoreMenu.test.tsx` | 수정 |
| `web/vite.config.ts` | 수정 |
| `web/e2e/support.ts` | 수정 |
| `web/e2e/workbench.spec.ts` | 수정 |
| `web/e2e/mobile.spec.ts` | 수정 |
| `web/TESTIDS.md` | 수정 |
