# Phase 03. 목록, 검토 대기, 변경 이력의 주소 상태

**Execution profile**: standard

## 목표

목록 탭의 타입, 검색어, 보관 포함, 쪽 번호와 검토 대기 두 구역의 쪽 번호, 변경 이력의 사용자와 쪽 번호를 주소의 query 로 옮긴다. 모두 주소만 바꾸고 기록을 쌓지 않는다(replace).
그 탭에서 항목을 열었다가 뒤로가기로 돌아오면 보던 조건과 쪽이 그대로인 것을 브라우저 테스트로 확인한다.

**범위 외**: 작업 공간은 phase 02 에서 끝났다. 서버는 phase 01 에서 끝났다. 이 phase 는 `financial-workbench/api/` 를 고치지 않는다.

## 컨텍스트

- 앞 phase 결과: `financial-workbench/web/src/routes.ts` 에 `parseListQuery`/`listSearch`(`type`, `q`, `archived`, `page`), `parseReviewQuery`/`reviewSearch`(`page`, `minePage`), `parseChangesQuery`/`changesSearch`(`target`, `actor`, `page`)가 있다. `App.tsx` 는 `/changes` 의 `target` 을 `ChangesTab` 의 `targetId` 로 넘기고 `onTargetIdChange` 를 replace 로 연결했다. 탭 단추는 그 탭에서 마지막으로 보던 주소로 간다.
- `financial-workbench/web/src/components/ListTab.tsx`: `ListTab({ onOpen })` 이 `type`, `qInput`, `q`, `includeArchived`, `pageNo` 를 `useState` 로 들고, 폼 제출(`FormEvent`)이 `q` 를 바꾼다. 행을 누르면 `onOpen(id)` 다.
- `financial-workbench/web/src/components/ReviewTab.tsx`: `ReviewSection`(scope 마다 하나)이 `pageNo` 를 `useState` 로 들고 `Pager` 로 바꾼다. 편집자는 구역 둘(`review-section-reviewable`, `review-section-mine`), 열람자는 한 목록이다. 열람자 목록의 쪽은 `page` 를 쓴다.
- `financial-workbench/web/src/components/ChangesTab.tsx`: `actor`(이메일, `changes-actor-filter` select)와 `pageNo` 를 `useState` 로 든다. 대상은 props 의 `targetId` 다.
- 쪽 넘기기 부품은 `financial-workbench/web/src/components/Pager.tsx` 다.
- 브라우저 테스트: `financial-workbench/web/e2e/workbench.spec.ts` 의 `6c)` 가 이력 탭에서 사용자를 고르고(`selectOption({ value: editorA.email })`) 대상을 고른다. `list-row` 는 목록 탭의 행이다(`financial-workbench/web/TESTIDS.md` 「목록 탭」).

**근거 문서**: `financial-workbench/docs/flow.md` 의 「주소와 뒤로가기」(목록, 검토 대기, 변경 이력 행)와 「뒤로가기 한 번으로 되돌리는 동작」, `financial-workbench/docs/adr/007-routes-in-url.md`

## 의도 메모

- 쪽 넘기기와 필터는 기록을 쌓지 않는다(사용자 결정 2026-10-22). 뒤로가기 한 번이 탭이나 항목 단위로 움직이게 하려는 것이다.
- 검색어는 제출할 때만 주소에 쓴다. 칠 때마다 쓰지 않는다.

## Blocked 조건

- 8081 이나 8090 포트를 다른 스택이 쓰고 있으면 그 스택을 내리지 말고 `PHASE_BLOCKED: 8081 또는 8090 사용 중` 을 출력하고 멈춘다.

## 작업 항목

### 1. `ListTab.tsx`

- `type`, `q`, `includeArchived`, `pageNo` 상태를 지우고 `parseListQuery(location.search)` 로 읽는다. 바꾸면 `navigate('/list' + listSearch({...}), { replace: true })` 다. 타입, 검색어, 보관 포함을 바꾸면 `page` 를 0 으로 돌린다.
- `qInput` 은 입력용으로 남기고 주소의 `q` 가 바뀌면 따라가게 한다.

### 2. `ReviewTab.tsx`

- `ReviewSection` 의 `pageNo` 를 props 로 받는다(`page`, `onPage`). `ReviewTab` 이 `parseReviewQuery` 로 읽어 구역 1(또는 열람자 목록)에 `page`, 구역 2 에 `minePage` 를 넘기고, 바꾸면 `navigate('/review' + reviewSearch({...}), { replace: true })` 다.
- 「마지막 쪽을 다 처리해 빈 쪽이 되면 앞 쪽으로 간다」 는 지금 동작(`ReviewTab.tsx` 의 `p.items.length === 0 && pageNo > 0` 이면 `pageNo - 1`)을 바꾼다. 받은 응답의 `totalPages` 로 끝 쪽(`max(totalPages - 1, 0)`)을 구해 한 번에 그 쪽으로 replace 한다. `/review?page=999` 처럼 열었을 때 빈 쪽마다 요청이 쌓이지 않게 하려는 것이다. 목록과 이력의 쪽 번호도 같은 방식으로 끝 쪽을 넘으면 끝 쪽으로 replace 한다(`docs/flow.md`).

### 3. `ChangesTab.tsx`

- `actor` 와 `pageNo` 상태를 지우고 `parseChangesQuery(location.search)` 로 읽는다. 사용자를 고르면 `actor` 를 바꾸고 `page` 를 0 으로, 쪽 넘기기는 `page` 만 바꾼다. 모두 replace 다.
- 대상(`target`)은 phase 01 의 `targetId`, `onTargetIdChange` 그대로다. 대상을 바꿀 때 `page` 를 0 으로 돌리는지 확인하고, 안 돌리면 함께 돌린다.

### 4. 이 phase 를 검증하는 테스트

- `financial-workbench/web/src/components/tabs.test.tsx` 에 정적 렌더 테스트를 더한다.
  - `withApp(<ListTab onOpen={() => {}} />, testOntology, undefined, '/list?type=Company&q=abc&archived=1')` 이면 타입 select 안에 `<option value="Company" selected=""` 가 있고(정적 렌더는 고른 값을 `selected` 속성으로 낸다), 검색 입력에 `value="abc"`, 보관 포함에 `checked=""` 가 있다. testid 는 `financial-workbench/web/TESTIDS.md` 「목록 탭」 에서 읽는다.
  - `withApp(<ChangesTab … />, …, '/changes?actor=a%40example.com')` 이면 `changes-actor-filter` 의 값이 `a@example.com` 이다. 사용자 목록은 비동기로 읽으므로 선택지가 없을 때의 값 단언이 어렵다면, 이 단언은 브라우저 테스트로 옮기고 그 사실을 커밋 메시지에 적는다.
- `financial-workbench/web/e2e/workbench.spec.ts` 에 `6d) 목록과 이력에서 항목을 열었다가 뒤로가기로 돌아오면 조건이 그대로다` 를 `6c)` 다음에 더한다.
  1. `pageA` 로 `tab-list` 에서 타입을 기업으로 고르고 `data.supplier` 를 검색한다. 주소에 `type=Company` 와 `q=` 가 있다.
  2. `list-row`(`hasText: data.supplier`)를 눌러 상세를 연다. 주소가 `/workspace?node=` 다.
  3. `pageA.goBack()` 하면 주소가 1의 주소이고 타입 select 와 검색 입력 값이 그대로이며 `list-row` 가 보인다.
  4. `tab-changes` 에서 `changes-actor-filter` 를 편집자 A 의 이메일로 고른다. 주소에 `actor=` 가 있다. 첫 `change-row` 의 대상 이름 단추(행 안 「대상 이름」 칸의 `button`. testid 가 없으므로 `row.locator('td').nth(4).locator('button')` 처럼 칸 순서로 찾고, 칸 순서는 `ChangesTab.tsx` 의 표 머리에서 확인한다)를 눌러 항목을 연 뒤 `goBack()` 하면 `changes-actor-filter` 값이 그대로다.
  5. 쪽 넘기기가 기록을 쌓지 않는지는 쪽이 둘 이상일 때만 본다. 데이터가 한 쪽이면 건너뛴다(`if`).
  - 각 `goBack()` 뒤에는 목록이 다시 읽힐 때까지 기다린 뒤 단언한다.

## 검증

```bash
cd financial-workbench/web && npm ci && npm run typecheck
cd financial-workbench/web && npx vitest run src/components/tabs.test.tsx src/routes.test.ts
cd financial-workbench/web && npm test
cd financial-workbench/web && npm run build
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan009 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait
cd financial-workbench/web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile
cd financial-workbench && NEO4J_PASSWORD=e2e-local-password COMPOSE_PROJECT_NAME=wb-plan009 COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose down -v
cd financial-workbench/api && ./gradlew test
```

- 각 줄은 저장소 루트에서 돈다. 두 project 가 모두 통과해야 한다. 마지막 `./gradlew test` 는 세 phase 를 합친 뒤 서버 테스트가 그대로인지 다시 본다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/web/src/components/ListTab.tsx` | 수정 |
| `financial-workbench/web/src/components/ReviewTab.tsx` | 수정 |
| `financial-workbench/web/src/components/ChangesTab.tsx` | 수정 |
| `financial-workbench/web/src/components/tabs.test.tsx` | 수정 |
| `financial-workbench/web/e2e/workbench.spec.ts` | 수정 |
