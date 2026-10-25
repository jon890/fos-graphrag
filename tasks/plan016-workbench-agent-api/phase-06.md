# Phase 06. 연동 토큰 브라우저 테스트

**Execution profile**: standard

## 목표

연동 토큰의 발급과 복사, 목록, 그 토큰으로 `/api/v1` 부르기, 폐기를 넓은 화면(1440px)과 휴대폰 폭(390px) 브라우저 테스트로 남긴다. 테스트는 이 phase 에서 쓰고 목록 확인까지 한다. 실제 실행은 모든 phase 뒤 통합 검증에서 한 번 한다.

**범위 외**: 화면과 API 의 동작 변경. 테스트가 기대는 testid 가 화면에 없으면 이 phase 에서 만들지 않고 `PHASE_BLOCKED` 로 멈춘다.

## 컨텍스트

**근거 문서**: `financial-workbench/docs/prd.md` 의 「요구가 충족됐다고 보는 관측」(연동 토큰 발급과 복사, 1440px 와 390px, `/api/v1/ontology` 200), `financial-workbench/docs/flow.md` 의 「연동 토큰」, 「에이전트 조회」, `financial-workbench/web/TESTIDS.md` 의 「연동 토큰 화면」, 「로그인과 상단」.

- `web/e2e/workbench.spec.ts` 는 `test.describe.configure({ mode: 'serial' })` 의 한 묶음이다. `pageAdmin`, `pageA`, `pageB`, `pageViewer` 를 앞 테스트가 연다. `8)` 이 열람자를 비활성화한다. 새 테스트는 `7f)` 다음, `8)` 앞에 둔다.
- `7b)` 가 더보기 메뉴 항목을 역할마다 정확한 배열로 단언한다. phase 05 가 모든 역할 끝에 `tokens` 를 더했으므로 이 phase 에서 그 세 배열을 고친다.
- 도우미는 `web/e2e/support.ts` 의 `loginAs`, `openScreen`, `newPage`, `shot`, `ScreenKey` 다. `ScreenKey` 에 `'tokens'` 를 더한다(`openScreen` 은 더보기 메뉴로 연다).
- `web/e2e/mobile.spec.ts` 의 `expectNoHorizontalOverflow(page)` 와 `loginAs(page, admin, 'success', '/map')` 패턴을 따른다.
- 테스트 주소는 `playwright.config.ts` 의 `baseURL`(`WORKBENCH_URL`, 기본 `http://127.0.0.1:8081`)이다. 토큰 요청은 브라우저 쿠키 없이 보내야 하므로 Playwright 의 `request.newContext({ baseURL })` 로 새 요청 문맥을 만든다.
- 클립보드: Chromium 은 `context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })` 뒤에 `page.evaluate(() => navigator.clipboard.readText())` 로 읽는다. `127.0.0.1` 은 보안 문맥이다.
- 스크린샷은 `shot(page, 이름)` 이 `web/test-results/screenshots/` 에 남긴다. 통합 검증 뒤 사람이 볼 사본은 저장소 루트의 `.omc/previews/plan016-agent-api/` 에 복사한다(이 phase 의 커밋에는 넣지 않는다).

## 의도 메모

- 토큰 원문은 테스트 로그와 스크린샷에 남아도 되는 e2e 전용 값이다. 그래도 테스트 끝에 폐기해 같은 스택에서 뒤에 도는 테스트가 그 토큰을 보지 않게 한다.
- 「다른 사용자의 목록이 보이지 않음」 은 화면(편집자 B 의 연동 토큰 화면)과 API(B 의 세션 `GET /api/me/tokens`) 둘로 확인한다.

## Blocked 조건

- `TESTIDS.md` 의 「연동 토큰 화면」 testid 나 `more-item-tokens` 가 화면에 없으면 `PHASE_BLOCKED: 연동 토큰 화면 testid 없음` 을 출력하고 멈춘다.

## 작업 항목

### 1. `web/e2e/support.ts`

`ScreenKey` 에 `'tokens'` 를 더한다.

### 2. `web/e2e/workbench.spec.ts`

- `7b)` 의 배열: 관리자 `['more-item-changes', 'more-item-ontology', 'more-item-review', 'more-item-users', 'more-item-tokens']`, 편집자 `[..., 'more-item-review', 'more-item-tokens']`, 열람자 `['more-item-changes', 'more-item-ontology', 'more-item-tokens']`.
- 새 테스트 `7g) 연동 토큰을 발급해 복사하고 그 토큰으로 에이전트 API 를 부르며, 폐기하면 막힌다`:
  1. `pageA` 의 문맥에 클립보드 권한을 준다. `openScreen(pageA, 'tokens')` 뒤 주소가 `/tokens` 이고 `more-open` 이 `data-active="true"`, `tokens-guide` 에 「Hermes」 가 있다.
  2. `tokens-issue-open` → `tokens-issue-name` 을 `e2e 토큰` 으로 바꿔 `tokens-issue-submit`. `tokens-issued-value` 의 `value` 가 `/^fwb_[A-Za-z0-9_-]{43}$/` 이고 `tokens-issued-warning` 이 보인다. 스크린샷 `tokens-issued-wide`.
  3. `tokens-issued-copy` 를 누르면 `tokens-issued-copied` 가 보이고, 클립보드 값이 원문과 같다.
  4. `tokens-issued-close` 뒤 `tokens-row`(`data-name="e2e 토큰"`)가 하나 있고, `tokens-row-last4` 가 원문 끝 네 글자 앞에 `…` 를 붙인 값이며, 화면 어디에도 원문 전체가 없다(`page.content()` 에 원문이 없다). `tokens-row-last-used` 는 「아직 쓰지 않음」. 스크린샷 `tokens-list-wide`.
  5. 쿠키 없는 요청 문맥으로 `GET /api/v1/ontology` 에 `Authorization: Bearer <원문>` 을 담으면 `200` 이고 본문의 `nodeTypes` 가 배열이다. 헤더 없이 부르면 `401`. `pageA` 의 브라우저 안에서 `fetch('/api/v1/ontology')`(쿠키만)도 `401` 이다.
  6. 화면을 새로 읽으면 그 행의 `tokens-row-last-used` 가 「아직 쓰지 않음」 이 아니다.
  7. 편집자 B 의 `openScreen(pageB, 'tokens')` 에는 `data-name="e2e 토큰"` 행이 없고, B 의 브라우저에서 `fetch('/api/me/tokens')` 결과에 그 id 가 없다.
  8. A 가 `tokens-row-revoke` → `tokens-revoke-dialog` 의 문구에 「e2e 토큰」 이 있고 `tokens-revoke-confirm`. 그 행이 사라지고 `tokens-message` 가 `data-kind="success"`. 같은 원문으로 `GET /api/v1/ontology` 는 `401`.

### 3. `web/e2e/mobile.spec.ts`

새 테스트 「휴대폰 폭에서 연동 토큰을 발급하고 폐기해도 가로 스크롤이 없다」: 관리자로 로그인해 더보기 → `more-item-tokens`. `expectNoHorizontalOverflow`. 발급 창에서 기본 이름 그대로 발급하고 `tokens-issued-value` 가 보이면 `expectNoHorizontalOverflow`, 스크린샷 `tokens-issued-mobile`. 닫은 뒤 목록에서 `expectNoHorizontalOverflow`, 스크린샷 `tokens-list-mobile`. 그 행을 폐기해 정리하고 행이 사라지는 것을 확인한다.

## 검증

```bash
cd financial-workbench/web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench/web && npm run typecheck && npm test
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/e2e/support.ts` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
