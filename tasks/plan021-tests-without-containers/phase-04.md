# Phase 04. 로그인, 이동, 지식 편집 시나리오를 가짜 API 로 옮긴다

**Execution profile**: standard

## 목표

`web/e2e/workbench.spec.ts` 의 앞쪽 시나리오(로그인과 화면 이동, 항목 만들기와 주장, 검토, 그래프와 상세, 동시 수정, 보관)를 가짜 API 위의 새 spec 파일 둘로 옮긴다.

**범위 외**: 이해 표시와 근거 따라가기, 연동과 앱 연결, 체결과 제안, 가이드, 사용자와 온톨로지 관리(phase 05). 옛 `workbench.spec.ts` 삭제(phase 05).

## 컨텍스트

- phase 03 이 만든 가짜 API: `web/e2e/mock/api.ts` 의 `MockApi`(`on`, `fixture`, `requests`, `lastRequest`, `assertNoMissing`)와 `web/e2e/mock/test.ts` 의 `test`(역할 fixture). 사용 예는 `web/e2e/mobile.spec.ts` 와 `web/e2e/mock.spec.ts` 다.
- 스냅샷은 `web/e2e/fixtures/*.json` 이고, 새 응답이 필요하면 `api/src/test/kotlin/dev/fos/workbench/snapshot/ApiSnapshotTest.kt` 에 저장을 더해 만든다. JSON 을 직접 쓰지 않는다.
- 옮길 시나리오는 옛 파일의 아래 테스트다. 이름 앞 번호는 옛 파일의 번호다.

| 새 파일 | 옛 시나리오 |
|---|---|
| `web/e2e/navigation.spec.ts` | 0b(로그인 거절), 0c(이력의 「시스템」), 0d(렌더링 오류 뒤 「다시 시도」), 0e(첫 화면 안내와 한국어 표시 이름), 0f(탭과 뒤로가기), 0g(개념 지도 첫 화면), 0h(개념 지도의 ＋ 타입 추가), 3b(링크로 들어와 로그인 뒤 상세), 4b(뒤로가기와 검색 조건), 4c(고급 필터), 6d(목록과 이력에서 뒤로가기) |
| `web/e2e/knowledge.spec.ts` | 1, 1b, 1c(만들기, 같은 이름 경고, 투자 사슬), 2, 2b, 2c, 2d(주장 만들기), 3(검토), 4(주변 그래프와 근거), 4d(읽기 카드와 편집), 5(동시 수정 409), 6(보관과 복원), 6b(유일한 근거 문서 보관), 6c(이력의 이름) |

**근거 문서**: `docs/code-architecture.md` 의 「가짜 API」, `docs/adr/018-tests-without-containers.md`

## 의도 메모

- 화면 테스트는 화면이 무엇을 보이고 무엇을 보내는지만 본다. 「A 가 만든 것을 B 가 본다」 는 B 의 역할로 같은 스냅샷을 보이는 화면 테스트와, 저장 뒤 다른 사용자가 읽는 서버 JUnit 테스트로 나눈다.
- 409 같은 실패 응답은 `api.on` 으로 준다. 응답 본문은 서버가 실제로 주는 모양이어야 하므로 스냅샷에 실패 응답(예: `node-patch-conflict`)을 더해 쓴다.
- 시나리오 사이의 순서 의존을 없앤다. 각 테스트는 스냅샷 상태에서 시작한다.

## 작업 항목

### 1. `web/e2e/navigation.spec.ts`(신규)

위 표의 시나리오를 옮긴다. 셀렉터와 스크린샷 이름은 옛 테스트의 것을 쓴다. 0b 는 `loginResult: 'denied'` 로, 3b 는 로그아웃 상태로 `/workspace?node=<id>` 를 연 뒤 로그인해 상세가 열리는지 본다.

### 2. `web/e2e/knowledge.spec.ts`(신규)

위 표의 시나리오를 옮긴다. 만들기와 고치기, 검토, 보관은 `api.lastRequest` 로 경로와 본문(`type`, `properties`, `expectedRevision`, `status`, `reason`)을 확인하고, 이어지는 화면은 스냅샷 응답으로 확인한다.

### 3. 서버 동작 검사를 JUnit 으로 옮긴다

옮기며 뺀 서버 동작 검사마다 같은 것을 보는 서버 테스트를 찾는다(예: 동시 수정은 `ConcurrencyIntegrationTest`, 자기 검토 금지는 `knowledge/ClaimIntegrationTest`, 같은 이름 경고는 화면 규칙이라 화면 테스트에 남는다). 없으면 해당 `*IntegrationTest` 에 더한다.
`.orch/pr-body-plan021-tests-without-containers.md` 의 「옮긴 시나리오」 표에 옛 시나리오 번호, 새 화면 테스트, 서버 테스트(클래스와 메서드 이름)를 한 줄씩 적는다. 버린 시나리오는 까닭을 적는다.

### 4. 스냅샷 더하기

필요한 응답이 없으면 `ApiSnapshotTest` 에 만들고 `./gradlew test --rerun --tests '*ApiSnapshotTest'` 로 다시 쓴다. 기존 스냅샷의 diff 는 새 데이터로 생긴 것만 있어야 한다.

## 검증

```bash
cd api && DOCKER_HOST=unix:///nonexistent.sock ./gradlew test --rerun
cd api && ./gradlew test --rerun --tests '*ApiSnapshotTest' && git diff --exit-code -- ../web/e2e/fixtures
cd web && npm run typecheck && npm test && npm run build
cd web && DOCKER_HOST=unix:///nonexistent.sock npx playwright test e2e/mock.spec.ts e2e/mobile.spec.ts e2e/navigation.spec.ts e2e/knowledge.spec.ts --project=chromium --project=mobile
bash scripts/tests/test_scripts.sh
```

- 둘째 줄 전에 첫 줄이 만든 스냅샷을 `git add` 한다. 다시 만들어도 diff 가 비어야 한다.
- 스크린샷(`web/test-results/screenshots/`)을 직접 열어 본다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `web/e2e/navigation.spec.ts` | 신규 |
| `web/e2e/knowledge.spec.ts` | 신규 |
| `web/e2e/mock/api.ts` | 수정 |
| `web/e2e/fixtures/*.json` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/snapshot/ApiSnapshotTest.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/**/*IntegrationTest.kt` | 수정 |
