# Phase 06. 브라우저 테스트: 기록 토큰, 체결, 제안 승인, 다른 사용자 화면

**Execution profile**: standard

## 목표

운영 Compose 와 e2e override 를 띄워 넓은 화면(1440px)과 휴대폰 폭(390px)에서 아래 흐름을 실행한다. 「조회와 기록」 토큰 발급, 그 토큰으로 체결과 제안 쓰기, 「제안」 화면의 배지, 고쳐서 승인과 거절, 「내 체결」 과 종목 상세의 체결 절, 다른 사용자 화면에서 체결이 보이지 않음. 이 phase 가 이 plan 의 유일한 브라우저 테스트 실행이다.

**범위 외**: 서버와 화면 코드의 새 기능. 테스트가 찾은 결함을 고치는 변경은 이 phase 에 담되, 그 기능을 만든 phase 의 문서와 계약을 함께 맞춘다.

## 컨텍스트

**근거 문서**: `financial-workbench/docs/flow.md` 의 「에이전트 쓰기」, 「제안」, 「내 체결」, 「연동 토큰」, `financial-workbench/docs/prd.md` 의 「요구가 충족됐다고 보는 관측」, `financial-workbench/web/TESTIDS.md` 의 「로그인과 상단」, 「연동 토큰 화면」, 「제안 화면」, 「내 체결」, `financial-workbench/docs/deployment.md` 의 「브라우저 테스트」.

- 테스트 파일은 `financial-workbench/web/e2e/workbench.spec.ts`, `financial-workbench/web/e2e/mobile.spec.ts`, `financial-workbench/web/e2e/support.ts` 다.
- `workbench.spec.ts` 는 직렬 `describe` 안에서 편집자 A 의 `pageA`, 편집자 B 의 `pageB`, `pageViewer`, `pageAdmin` 을 쓴다. 토큰 테스트는 `7g)` 다.
- `mobile.spec.ts` 의 「휴대폰 폭에서 연동 토큰을 …」 테스트가 모바일 테스트의 패턴이다.
- `support.ts` 의 도우미는 `loginAs`, `openScreen`, `ScreenKey`, `tokenIds`, `revokeTokensExcept`, `shot` 이다.
- `/api/v1` 은 쿠키 없는 `request.newContext({ baseURL: origin })` 로 부른다(`7g)` 와 같다).
- 더보기 메뉴의 항목 목록을 단언하는 기존 테스트(`workbench.spec.ts` 1146행 근처 `itemsOf(...)` 의 기대 배열)는 phase 04, 05 가 더한 `more-item-proposals`, `more-item-trades` 때문에 바뀐다.
- 체결의 종목 잇기는 e2e 데이터의 종목을 쓴다. 초기 데이터(`ontology/seeds/investment-logic-2026-10.yaml`)의 FLNC 종목(시장 `NASDAQ`, 종목 코드 `FLNC`)과 결정 「FLNC 첫 매수」 를 이름으로 찾는다. 이 테스트는 e2e 스택에만 체결을 넣는다.

## 의도 메모

- 테스트가 넣는 체결의 `externalId` 는 실행마다 다른 값(`e2e-${Date.now()}`)으로 둔다. 같은 스택을 다시 돌려도 앞 실행의 체결과 겹치지 않는다.
- 테스트가 발급한 토큰은 `revokeTokensExcept` 로 끝에 폐기한다. 넣은 체결은 「지우기」 로 지워 화면 확인까지 겸한다.
- 화면 확인은 testid 로 하고 스크린샷은 남기기만 한다. 사람이 열어 보고 판정한다.

## 작업 항목

### 1. `financial-workbench/web/e2e/support.ts`

`ScreenKey` 에 `'proposals' | 'trades'` 를 더한다.

### 2. `financial-workbench/web/e2e/workbench.spec.ts`

- 더보기 항목 기대 배열의 `more-item-tokens` 뒤에 `more-item-proposals`, `more-item-trades` 를 더한다(세 역할 모두).
- 새 테스트 `7h) 기록 토큰으로 체결과 제안을 쓰고, 제안을 고쳐 승인하면 결정과 체결이 이어지며 다른 사용자에게는 보이지 않는다`:
  1. A 가 「연동 토큰」 에서 「조회와 기록」(`tokens-issue-scope-write`)으로 발급하고 `tokens-issue-scope-hint` 를 본다. 목록의 `tokens-row-scope` 가 `data-scope="READ_WRITE"`. 「조회만」 토큰도 하나 발급한다.
  2. 「조회만」 토큰의 `POST /api/v1/trades` 는 `403`, 본문 `code = INSUFFICIENT_SCOPE`.
  3. 기록 토큰으로 FLNC 매수 체결 하나(`market: 'US'`, `ticker: 'flnc'`)를 두 번 보내면 `created`, `existing` 이고 `security.label` 이 FLNC 종목 이름이다.
  4. 기록 토큰으로 제안 둘을 올린다. 하나는 `CREATE_NODE`(`Decision`, `title: 'e2e 추가 매수 …'`, `action: 'ADD'`, `links: [{ type: 'HAS_DECISION', fromId: FLNC 종목 id }]`, `tradeIds: [체결 id]`), 하나는 `STUDY_NOTE`(FLNC 종목, `UNSURE`, 메모).
  5. A 의 화면을 새로 고치면 `more-pending-badge` 의 `data-count` 가 2 이상이다. `openScreen(pageA, 'proposals')` → `proposal-card` 두 장, 항목 만들기 카드의 `proposal-summary` 에 결정 이름, `proposal-rationale` 이 있다. `shot(pageA, 'proposals-wide')`.
  6. 항목 만들기 카드에서 「고쳐서 승인」 → 제목 칸을 `e2e 추가 매수(고침) …` 로 바꾸고 「이대로 승인」 → `proposals-message` 성공, 배지 수가 1 줄어든다. 공부 메모 카드는 「거절」 → 이유를 적어 거절한다.
  7. 「승인함」 칩에 승인한 카드와 `proposal-result-open` 이 있다. 누르면 작업 공간에서 새 결정의 상세가 열리고 `detail-trades` 에 체결 한 줄이 있다. 같은 결정의 근거 따라가기(`node-trace`)에 `trace-step-trades` 가 있다.
  8. 기록 토큰의 `GET /api/v1/proposals?status=REJECTED` 에 거절 이유가 있다.
  9. `openScreen(pageA, 'trades')` → `trade-row` 하나(`data-ticker="FLNC"`), `trade-decisions` 에 고친 결정 이름. `shot(pageA, 'trades-wide')`. FLNC 종목 상세에 `detail-trades` 가 있다.
  10. B 와 관리자 화면: `openScreen(pageB, 'trades')` 에 그 체결이 없고(`trades-empty` 나 행 없음), B 의 FLNC 종목 상세와 새 결정 상세에 `detail-trades` 가 없다. B 의 「제안」 에 A 의 제안이 없고 배지가 없다. `pageAdmin` 의 `fetch('/api/me/trades')` 결과에 그 체결 id 가 없다. `shot(pageB, 'trades-other-user-wide')`.
  11. 열람자: `pageViewer` 가 기록 토큰을 발급해 `CREATE_RELATIONSHIP` 제안을 올리면 자기 「제안」 화면에서 `proposal-editor-required` 가 보이고 `proposal-accept` 가 꺼져 있다. 거절하고 끝낸다.
  12. 정리: A 가 「내 체결」 에서 그 체결을 「지우기」 하면 행이 사라진다. `finally` 에서 발급한 토큰을 `revokeTokensExcept` 로 폐기한다. 승인으로 만든 결정은 상세의 「보관」 으로 보관한다.

### 3. `financial-workbench/web/e2e/mobile.spec.ts`

새 테스트 `휴대폰 폭에서 제안과 내 체결이 가로 스크롤 없이 열린다`: 기록 토큰을 발급해 체결 하나와 `STUDY_NOTE` 제안 하나를 쓴 뒤 `/proposals` 와 `/trades` 를 열어 `document.documentElement.scrollWidth <= window.innerWidth` 를 확인한다. 머리글의 탭 넷, 「더보기」(배지 포함), 「＋ 추가」 가 한 줄(같은 `top`)이다. `shot(page, 'proposals-mobile')`, `shot(page, 'trades-mobile')`. 끝에 제안을 거절하고 체결을 지우고 토큰을 폐기한다.

## 검증

```bash
cd financial-workbench/web && npm run typecheck && npm test && npm run build
cd financial-workbench && bash scripts/tests/test_scripts.sh
cd financial-workbench/api && ./gradlew test --rerun
cd financial-workbench && COMPOSE_PROJECT_NAME=plan017-verify NEO4J_PASSWORD=e2e-local-password COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && COMPOSE_PROJECT_NAME=plan017-verify NEO4J_PASSWORD=e2e-local-password COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
```

- 다섯째 줄의 브라우저 테스트가 모두 통과한다(새 `7h)` 와 모바일 테스트 포함). 실패하면 마지막 줄로 스택을 내리기 전에 `web/test-results/` 의 trace 와 스크린샷을 본다.
- 스크린샷 `web/test-results/screenshots/proposals-wide.png`, `trades-wide.png`, `trades-other-user-wide.png`, `proposals-mobile.png`, `trades-mobile.png` 을 열어 본다. 사용자에게 보일 사본은 저장소 루트의 `.omc/previews/plan017-trades-proposals/` 에 복사한다(커밋하지 않는다).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/e2e/support.ts` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
