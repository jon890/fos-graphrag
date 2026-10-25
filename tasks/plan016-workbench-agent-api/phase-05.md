# Phase 05. 더보기 메뉴의 연동 토큰 화면

**Execution profile**: standard

## 목표

더보기 메뉴에 「연동 토큰」(`/tokens`, 모든 역할)을 더하고, 토큰 목록, 발급 창(이름 입력, 원문 한 번 보이기, 복사), 폐기 확인 창, Hermes 연결 안내를 만든다. 서버는 `/tokens` 를 `index.html` 로 돌려준다.

**범위 외**: API(phase 01~04 에서 끝남). 브라우저 테스트(phase 06).

## 컨텍스트

**근거 문서**: `financial-workbench/docs/flow.md` 의 「연동 토큰」, 「주소와 뒤로가기」(`/tokens` 행), `financial-workbench/docs/api-contract.md` 의 「연동 토큰」, `financial-workbench/web/TESTIDS.md` 의 「연동 토큰 화면」, 「로그인과 상단」(`more-item-tokens`), `financial-workbench/docs/code-architecture.md` 의 「웹 구조」(`web/src/components/tokens/`).

- 경로와 메뉴: `web/src/routes.ts` 의 `TabKey`, `TAB_PATHS`, `moreItems(role)`. `web/src/components/header/MoreMenu.tsx` 의 `MORE_LABEL`. 단위 테스트 `web/src/routes.test.ts` 가 `moreItems` 결과를 역할마다 정확한 배열로 단언한다(143~145줄). 이 phase 에서 그 값을 고친다.
- 화면 고르기: `web/src/App.tsx` 가 `activeTab === 'users' && ...` 처럼 탭마다 화면을 그린다. `/tokens` 는 모든 역할이라 권한 바꿔 열기 effect 는 고치지 않는다.
- 서버 화면 경로: `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` 의 `@GetMapping` 목록. 테스트 `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` 의 경로 목록(25줄)에 더한다.
- API 호출: `web/src/api/client.ts` 의 `request` 와 `api` 객체(`users: { list, create, patch }` 모양), 타입은 `web/src/api/types.ts`. 쓰기는 `request` 가 CSRF 를 처리한다. 오류 문구는 `errorMessage(e)`, 오류 코드는 `ApiError` 의 `code`.
- 화면 부품: `@/components/ui/` 의 `Button`, `Input`, `Table`, `Dialog`, `Alert`. 표와 메시지 모양은 `web/src/components/UsersTab.tsx` 를 따른다. 창은 `Dialog`(Portal)다.
- 복사: `web/src/components/CopyLinkButton.tsx` 의 `useCopyLink` 처럼 `navigator.clipboard.writeText` 를 쓰고, 실패하면 입력칸을 선택한다. 이 화면은 원문을 이미 읽기 전용 입력칸에 보이므로 실패하면 그 칸을 선택하고 「직접 복사하세요」 를 보인다.
- 시각 표시: `web/src/lib/format.ts` 의 `formatDateTime`.
- 컴포넌트 테스트는 `react-dom/server` 의 `renderToStaticMarkup` 과 `web/src/components/testSupport.tsx` 의 `withApp` 으로 그린다(`web/src/components/tabs.test.tsx` 의 UsersTab 테스트).

## 의도 메모

- 원문은 발급 창의 React 상태에만 둔다. 창을 닫으면 상태를 지운다. `localStorage` 나 주소에 넣지 않는다.
- 상한(5개)은 서버가 집행한다. 화면은 목록 길이로 단추를 끄고, 서버의 `409 TOKEN_LIMIT` 도 창 안에 보인다.
- 좁은 화면에서 표가 넘치지 않게 만든 때와 마지막 사용을 한 칸에 두 줄로 쌓는다(`docs/flow.md` 「연동 토큰」).

## 작업 항목

### 1. `web/src/api/types.ts`, `web/src/api/client.ts`

```ts
export interface IntegrationTokenView { id: string; name: string; last4: string; createdAt: string; lastUsedAt: string | null }
export interface IssuedIntegrationToken extends IntegrationTokenView { token: string }
```

`api.tokens = { list: () => GET /api/me/tokens, issue: (name) => POST /api/me/tokens {name}, revoke: (id) => DELETE /api/me/tokens/{id} }`. 경로 조각은 기존 `enc` 로 감싼다.

### 2. `web/src/routes.ts`, `web/src/components/header/MoreMenu.tsx`

- `TabKey` 에 `'tokens'`, `TAB_PATHS.tokens = '/tokens'`.
- `moreItems` 는 모든 역할의 끝에 `'tokens'` 를 더한다. 결과: VIEWER `['changes', 'ontology', 'tokens']`, EDITOR `['changes', 'ontology', 'review', 'tokens']`, ADMIN `['changes', 'ontology', 'review', 'users', 'tokens']`. 주석의 역할 설명을 고친다.
- `MORE_LABEL.tokens = '연동 토큰'`.

### 3. `web/src/components/tokens/TokensTab.tsx`(신규)

`docs/flow.md` 「연동 토큰」 의 문구와 동작, `web/TESTIDS.md` 「연동 토큰 화면」 의 testid 를 그대로 쓴다.

- 위쪽 안내(`tokens-guide`), 「＋ 토큰 발급」(`tokens-issue-open`), 상한 안내(`tokens-limit`), 처리 결과(`tokens-message`, `data-kind`).
- 목록 표(`tokens-table`)와 행(`tokens-row`, `data-id`, `data-name`), 칸(`tokens-row-name`, `tokens-row-created`, `tokens-row-last-used`, `tokens-row-last4`, `tokens-row-revoke`). 빈 상태 `tokens-empty`, 실패 `tokens-error` 와 `tokens-retry`.
- 발급 창(`tokens-issue-dialog`): 이름 칸(`tokens-issue-name`, 기본값 `Hermes`, `maxLength=50`), `tokens-issue-submit`(trim 한 이름이 비면 `disabled`, 보내는 동안 `disabled`), `tokens-issue-cancel`, 창 안 오류 `tokens-issue-error`. 성공하면 같은 창이 결과로 바뀐다: `tokens-issued-value`(읽기 전용 `input`, 값은 원문), `tokens-issued-copy`, `tokens-issued-copied`, `tokens-issued-warning`, `tokens-issued-close`(닫고 원문 상태를 지우고 목록을 다시 읽는다).
- 폐기 확인 창(`tokens-revoke-dialog`, `tokens-revoke-confirm`, `tokens-revoke-cancel`): 문구는 흐름 문서 그대로. 성공하면 목록을 다시 읽고 `tokens-message` 에 성공 문구.
- 순수 함수는 같은 파일에서 `export` 해 테스트한다: `canIssue(count: number, max = 5): boolean`, `maskedLast4(last4: string): string`(값 앞에 `…` 를 붙인다).

### 4. `web/src/App.tsx`

`{activeTab === 'tokens' && <TokensTab />}` 를 `users` 줄 다음에 더하고 import 한다.

### 5. 서버 화면 경로

`SpaRouteController.kt` 의 목록에 `"/tokens"` 를 더한다. `SpaRouteIntegrationTest.kt` 의 경로 목록에 `"/tokens"` 를 더한다. 주석이 가리키는 `docs/flow.md` 표에는 이미 `/tokens` 가 있다.

### 6. 이 phase 를 검증하는 테스트

- `web/src/routes.test.ts`: `moreItems` 의 세 단언을 위 배열로 고치고, `tabOfPath('/tokens')` 가 `'tokens'` 라는 단언을 더한다.
- `web/src/components/tokens/TokensTab.test.tsx`(신규): `renderToStaticMarkup(withApp(<TokensTab />))` 에 `tokens-tab`, `tokens-guide`, `tokens-issue-open` 이 있고 안내에 「Hermes」 가 있다. `canIssue(4)` 는 참, `canIssue(5)` 는 거짓. `maskedLast4('x9Qa')` 는 `…x9Qa`.

## 검증

```bash
cd financial-workbench/web && npm run typecheck && npm test && npm run build
cd financial-workbench/api && ./gradlew test --rerun --tests 'dev.fos.workbench.web.SpaRouteIntegrationTest'
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/src/api/types.ts` | 수정 |
| `financial-workbench/web/src/api/client.ts` | 수정 |
| `financial-workbench/web/src/routes.ts` | 수정 |
| `financial-workbench/web/src/routes.test.ts` | 수정 |
| `financial-workbench/web/src/components/header/MoreMenu.tsx` | 수정 |
| `financial-workbench/web/src/components/tokens/TokensTab.tsx` | 신규 |
| `financial-workbench/web/src/components/tokens/TokensTab.test.tsx` | 신규 |
| `financial-workbench/web/src/App.tsx` | 수정 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/web/SpaRouteController.kt` | 수정 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/web/SpaRouteIntegrationTest.kt` | 수정 |
