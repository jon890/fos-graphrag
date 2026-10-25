# Phase 06. 브라우저 테스트

**Execution profile**: standard

## 목표

근거 따라가기, 이해 표시와 공부 탭, 개념 칩과 개념 상세, 이해 표시가 다른 사용자에게 보이지 않음, 개념 지도 글자 크기를 브라우저 테스트로 남긴다. 테스트는 이 phase 에서 쓰기만 하고 목록 확인까지 한다. 실제 실행은 모든 phase 뒤 통합 검증에서 한 번 한다.

**범위 외**: 화면과 API 의 동작 변경. 테스트가 기대는 testid 가 없으면 이 phase 에서 만들지 않고 `PHASE_BLOCKED` 로 멈춘다.

## 컨텍스트

**근거 문서**: `financial-workbench/docs/prd.md` 의 「요구가 충족됐다고 보는 관측」(근거 따라가기, 이해 표시, 개념 칩, 1440px 지도 글자), `financial-workbench/docs/flow.md` 의 「근거 따라가기」, 「내 이해 표시」, 「공부」, 「개념 설명」, 「개념 지도」, `financial-workbench/web/TESTIDS.md`.

- e2e 스택은 빈 DB 에서 시작해 저장소 YAML 로 첫 온톨로지 버전을 만들고 초기 데이터 두 파일(`investment-logic-2026-10`, `learning-concepts-2026-10`)을 적용한다. 그래서 「FLNC 첫 매수」 결정과 「FLNC 간이 DCF (Valley AI 화면)」 밸류에이션, 개념 「DCF」 가 있고, 결정과 밸류에이션은 이어져 있지 않다.
- `web/e2e/workbench.spec.ts` 는 `test.describe.configure({ mode: 'serial' })` 의 한 묶음이고 `pageAdmin`, `pageA`, `pageB`, `pageViewer` 를 앞 테스트가 연다. `8)` 이 열람자를 비활성화하므로 열람자를 쓰는 새 테스트는 `7b)` 와 `8)` 사이에 둔다. 도우미는 `web/e2e/support.ts` 의 `loginAs`, `openScreen`, `newPage`, `shot`, `shotElement`, `exact` 다. `ScreenKey` 에 `study`, `trace` 가 없으면 더한다.
- `web/e2e/mobile.spec.ts` 의 `expectNoHorizontalOverflow(page)` 와 「휴대폰 폭에서 개념 지도와 머리글이 한 줄에 들어간다」 의 y 좌표 비교를 따른다.
- 스크린샷은 `shot(page, 이름)` 이 `test-results/screenshots/` 에 남긴다.

## 의도 메모

- 결정과 밸류에이션을 잇는 테스트는 초기 데이터를 바꾼다. 같은 스택에서 뒤에 도는 테스트가 그 결정의 `missing` 을 기대하지 않게, 근거 따라가기 테스트 안에서 처음 상태를 먼저 확인한 뒤 잇는다.
- 다른 사용자에게 보이지 않음은 화면(공부 탭)과 API(`GET /api/me/knowledge/{id}`) 둘로 확인한다.

## Blocked 조건

- `TESTIDS.md` 에 이 phase 가 쓰는 testid(`node-trace`, `trace-*`, `knowledge-*`, `concept-chip`, `concept-section`, `tab-study`, `study-*`, `concept-map-canvas` 의 `data-node-font-px`)가 없으면 `PHASE_BLOCKED: 화면 testid 없음` 을 출력하고 멈춘다.

## 작업 항목

### 1. `web/e2e/workbench.spec.ts` 에 테스트를 더한다

`7b)` 다음, `8)` 앞에 아래를 순서대로 둔다.

- `7c) 결정의 근거 따라가기가 변화까지 단계를 보이고, 후보 밸류에이션을 이으면 그 단계가 생긴다`: 편집자 A 가 작업 공간 검색으로 「FLNC 첫 매수」 를 열고 `node-trace` 를 누른다. 주소가 `/trace?node=` 다. `trace-step` 에 결정(`data-role="root"`), 종목, 기업, 병목, 변화가 있고 병목 카드(`데이터센터 전력 접속과 ESS 공급`)는 `data-status="SUPPORTED"`, 변화 카드의 `trace-step-description` 에 「원문 대조 대기」 가 있다. 결정 카드의 `trace-missing`(`data-relationship="BASED_ON"`)에 `trace-candidate-link` 「FLNC 간이 DCF (Valley AI 화면)」 이 있다. 그것을 누르면 밸류에이션 카드가 생기고 그 카드의 `concept-chip` 에 「DCF」 가 있다. `trace-summary` 의 `data-steps` 가 처음보다 1 크다. 스크린샷 `trace-wide`.
- `7d) 이해 표시는 본인에게만 보이고 공부 탭에 단계 맥락과 함께 모인다`: A 가 근거 따라가기의 병목 카드에서 `knowledge-unsure` 를 누르고 메모 「계통 접속이 왜 막히는지 모르겠다」 를 저장한다. `trace-summary` 의 `data-unsure` 가 1 이다. `tab-study` 를 누르면 `study-item` 에 그 병목이 있고 `study-item-context` 에 「FLNC 첫 매수」 가 있고 `study-item-note` 에 메모가 있다. 스크린샷 `study-wide`. 편집자 B 의 공부 탭에는 그 항목이 없고, B 의 브라우저에서 `GET /api/me/knowledge/<병목 id>` 의 `level` 이 `null` 이다. A 가 `study-known` 을 누르면 그 카드가 사라지고 `study-counts` 의 `data-known` 이 1 늘어난다. 열람자가 같은 병목 상세에서 `knowledge-unsure` 를 눌러 저장된다(`aria-pressed="true"` 가 새로고침 뒤에도 남는다). 그 뒤 A 가 공부 탭을 새로 열어도 `study-counts` 의 `data-unsure` 와 `data-known` 은 열람자가 누르기 전과 같다(쓰기 격리).
- `7e) 개념 칩은 한 줄 정의를 보이고 개념 상세는 쓴 곳을 보인다`: A 가 「FLNC 간이 DCF (Valley AI 화면)」 상세를 연다. `concept-chip` 「DCF」 에 마우스를 올리면 `concept-summary` 가 보인다. 칩을 누르면 개념 「DCF」 상세가 열리고 `concept-section`(`data-section="used-by"`)에 그 밸류에이션이 있다. 스크린샷 `concept-wide`.
- `7f) 넓은 화면 개념 지도의 노드 글자는 13px 이상이다`: `/map` 에서 `concept-map-canvas` 의 `data-layout-done` 이 `true` 가 된 뒤 `data-node-font-px` 가 13 이상이다. 스크린샷 `map-wide`.

### 2. `web/e2e/mobile.spec.ts`

- 기존 「휴대폰 폭에서 개념 지도와 머리글이 한 줄에 들어간다」 의 y 좌표 비교 목록에 `tab-study` 를 더한다.
- 새 테스트 「휴대폰 폭에서 근거 따라가기와 공부 탭이 가로 스크롤 없이 열린다」: 관리자로 로그인해 작업 공간 검색에서 「FLNC 첫 매수」 상세를 열고 `node-trace` 를 눌러 `trace-step` 이 보이면 `expectNoHorizontalOverflow`, 스크린샷 `trace-mobile`. 단계 하나에서 `knowledge-unsure` 를 누른 뒤 `tab-study` 로 가서 `study-item` 이 보이면 `expectNoHorizontalOverflow`, 스크린샷 `study-mobile`. 끝에 그 항목의 `study-known` 을 눌러 정리한다.

### 3. `web/e2e/support.ts`

`ScreenKey` 와 `openScreen` 의 대상에 `study` 를 더한다(필요할 때만).

## 검증

```bash
cd financial-workbench/web && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench/web && npm run typecheck && npm test
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
| `financial-workbench/web/e2e/mobile.spec.ts` | 수정 |
| `financial-workbench/web/e2e/support.ts` | 수정 |
