# Phase 05. 나머지 시나리오를 옮기고 Compose 브라우저 테스트 스택을 지운다

**Execution profile**: deep

## 목표

`web/e2e/workbench.spec.ts` 의 나머지 시나리오를 가짜 API 위로 옮기고, 옛 파일과 `compose.e2e.yml`, e2e 전용 스크립트 검사와 문서를 지운다. 이 phase 뒤로 화면 테스트는 Docker 없이만 돈다.

**범위 외**: 배포 뒤 운영 확인 스크립트와 CI(phase 06).

## 컨텍스트

- 가짜 API 와 사용 예: `web/e2e/mock/api.ts`, `web/e2e/mock/test.ts`, phase 04 의 `web/e2e/navigation.spec.ts`, `web/e2e/knowledge.spec.ts`.
- 새 응답이 필요하면 `api/src/test/kotlin/dev/fos/workbench/snapshot/ApiSnapshotTest.kt` 에 더해 다시 만든다.
- 옮길 시나리오(번호는 옛 파일의 번호다):

| 새 파일 | 옛 시나리오 |
|---|---|
| `web/e2e/learning.spec.ts` | 7c(근거 따라가기 단계), 7d(이해 표시와 공부 탭), 7e(개념 칩과 개념 상세), 7f(개념 지도 글자 13px 이상) |
| `web/e2e/integrations.spec.ts` | 7g(연동 토큰 발급, 복사, 폐기), 7i(앱 연결 동의와 끊기), 7j(로그아웃 상태의 앱 연결 시작), 7h(체결과 제안, 제안 고쳐 승인) |
| `web/e2e/admin.spec.ts` | 0(사용자 추가), 7(열람자의 편집 버튼 없음), 7b(더보기 메뉴의 역할별 항목), 8(비활성화된 사용자의 세션 끊김 화면), 9, 9b, 9c(온톨로지 YAML 과 폼 편집, 영향 미리보기) |
| `web/e2e/guide.spec.ts` | 10(열람자 둘러보기 가이드), 11(편집자 따라하기), 11b(새로고침 뒤 이어서 하기) |

- 앱 연결 동의(7i, 7j)는 `/connect` 화면이 `GET /api/oauth/authorize?...` 와 `POST /api/oauth/authorize` 를 부른다. 허용 뒤 돌아갈 `redirectUrl` 은 `http://127.0.0.1:43210/callback?...` 이고, 테스트가 그 주소를 `page.route` 로 받는다(옛 `support.ts` 의 `OAUTH_CALLBACK`). 코드 교환과 갱신 토큰 폐기는 서버 동작이라 `oauth/OAuthAuthorizationIntegrationTest` 가 본다.
- Compose 와 스크립트에서 e2e 를 가리키는 곳: `compose.e2e.yml`, `scripts/check-compose.sh`(e2e 렌더링과 검사), `scripts/tests/test_scripts.sh`(「e2e override 는 prod 프로필을 켜지 않는다」), `README.md` 「구성」 과 「검증」, `docs/deployment.md` 「브라우저 테스트」 와 「검증」, `docs/code-architecture.md` 「전체 배치」 와 「설정」 표의 `e2e` 줄, 「결정」 의 브라우저 테스트 문단, `docs/prd.md` 의 「자동 테스트와 브라우저 테스트는 가짜 OIDC 공급자를 쓴다」, `.orch/overlay.md` 「검증 명령」 의 브라우저 줄. `git grep -n "compose.e2e\|E2E_ADMIN\|WORKBENCH_URL"` 로 빠진 곳을 찾는다.

**근거 문서**: `docs/code-architecture.md` 의 「테스트」, `docs/adr/018-tests-without-containers.md`

## 의도 메모

- `api/src/main/resources/application.yaml` 의 `e2e` 프로필 그룹과 `ProdStartupGuard` 의 안내 문구는 이 계획의 범위 밖이라 남긴다(`index.json` 의 `deferred`).
- 「비활성화하면 기존 세션이 끊긴다」(8)는 서버 동작이다. 화면 테스트는 401 을 받은 화면이 로그인 안내(`login-notice`)로 가는 것만 본다.
- 7f 의 글자 크기는 화면 배율 계산이라 화면 테스트에 남긴다.

## 작업 항목

### 1. 새 spec 네 개

위 표대로 옮긴다. 쓰기는 `api.lastRequest` 로, 이어지는 화면은 스냅샷 응답으로 확인한다. 셀렉터와 스크린샷 이름은 옛 테스트의 것을 쓴다.

### 2. 서버 동작 검사를 JUnit 으로 옮긴다

phase 04 와 같은 규칙이다. 토큰으로 `/api/v1` 부르기와 폐기 뒤 401(`agent/IntegrationTokenIntegrationTest`, `agent/AgentAuthIntegrationTest`), 체결과 제안이 다른 사용자에게 보이지 않음(`proposal/ProposalIntegrationTest`, `trade` 패키지), 열람자 403(`RoleAndUserAdminIntegrationTest`), 비활성화와 세션 끊김, 온톨로지 버전 저장과 되돌리기(`ontology/OntologyVersionIntegrationTest`)를 찾고, 없는 것은 더한다. `.orch/pr-body-plan021-tests-without-containers.md` 의 「옮긴 시나리오」 표를 채운다.

### 3. 옛 파일과 도우미 지우기

- `web/e2e/workbench.spec.ts` 를 지운다. `web/playwright.config.ts` 의 `testIgnore` 에서 `workbench\.spec\.ts` 를 뺀다.
- `web/e2e/support.ts` 에서 서버에 기대던 도우미(`fillMockOidc`, `loginAs`, `newPage`, `tokenIds`, `revokeTokensExcept`, `issueToken`, `revokeConnections`, `registerOAuthClient`, `newPkce`, `authorizeUrl`, `admin`, `TestUser`)를 지운다. 남은 도우미가 없으면 남은 export(`shot`, `shotElement`, `exact`, `escapeRegExp`, `openScreen`, `OAUTH_CALLBACK`)만 둔다. `npm run typecheck` 의 `noUnusedLocals` 가 쓰지 않는 것을 알려준다.

### 4. Compose 브라우저 테스트 스택 지우기

- `compose.e2e.yml` 을 지운다.
- `scripts/check-compose.sh` 에서 e2e 렌더링(`e2e_json`)과 그 검사, 통과 문구의 「e2e」 를 지운다. 개발 Compose 검사는 남긴다.
- `scripts/tests/test_scripts.sh` 의 「e2e override 는 prod 프로필을 켜지 않는다」 줄을 지운다.

### 5. 문서

- `README.md`: 「구성」 표의 `compose.e2e.yml` 줄을 지운다. 「검증」 의 Compose 브라우저 블록을 지우고 phase 03 이 더한 `npm run test:e2e` 줄만 남긴다.
- `docs/deployment.md`: 「브라우저 테스트」 절을 「화면 테스트는 Docker 없이 가짜 API 로 돈다」 와 명령 한 블록으로 바꾸고, 「검증」 의 Compose 줄을 지운다.
- `docs/code-architecture.md`: 「전체 배치」 의 `compose.e2e.yml` 줄과 `web/e2e/` 설명을 「Playwright 화면 테스트와 가짜 API, 응답 스냅샷(`fixtures/`)」 으로 고친다. 「설정」 표의 `e2e` 줄 설명을 「쓰지 않는다. 정리는 다음 작업」 으로 고치고 `mockoidc` 줄의 용도에서 e2e 를 뺀다. 「결정」 의 「브라우저 테스트는 `prod` 를 켜지 않고 `e2e` 프로필 ...」 두 줄을 지운다.
- `docs/prd.md` 의 그 문장을 「서버 자동 테스트는 가짜 OIDC 공급자를, 화면 테스트는 가짜 API 를 쓴다」 로 고친다.
- `.orch/overlay.md` 「검증 명령」 의 브라우저 줄을 `cd web && npx playwright test --project=chromium --project=mobile`(Docker 없음, 스크린샷은 `web/test-results/screenshots/`)으로 바꾼다.
- `web/TESTIDS.md` 에서 옛 파일 이름을 가리키는 곳이 있으면 고친다.

## 검증

```bash
cd api && DOCKER_HOST=unix:///nonexistent.sock ./gradlew test --rerun
cd api && ./gradlew test --rerun --tests '*ApiSnapshotTest' && git diff --exit-code -- ../web/e2e/fixtures
cd web && npm run typecheck && npm test && npm run build
cd web && DOCKER_HOST=unix:///nonexistent.sock npx playwright test --project=chromium --project=mobile
bash scripts/tests/test_scripts.sh
! git grep -n "compose.e2e\|E2E_ADMIN\|WORKBENCH_URL" -- . ':!tasks'
```

- 넷째 줄은 모든 화면 테스트를 Docker 와 API 서버 없이 돌린다.
- 스크린샷(`web/test-results/screenshots/`)을 직접 열어 본다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `web/e2e/learning.spec.ts` | 신규 |
| `web/e2e/integrations.spec.ts` | 신규 |
| `web/e2e/admin.spec.ts` | 신규 |
| `web/e2e/guide.spec.ts` | 신규 |
| `web/e2e/workbench.spec.ts` | 삭제 |
| `web/e2e/support.ts` | 수정 |
| `web/e2e/mock/api.ts` | 수정 |
| `web/playwright.config.ts` | 수정 |
| `web/TESTIDS.md` | 수정 |
| `web/e2e/fixtures/*.json` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/snapshot/ApiSnapshotTest.kt` | 수정 |
| `api/src/test/kotlin/dev/fos/workbench/**/*IntegrationTest.kt` | 수정 |
| `compose.e2e.yml` | 삭제 |
| `scripts/check-compose.sh` | 수정 |
| `scripts/tests/test_scripts.sh` | 수정 |
| `README.md` | 수정 |
| `docs/deployment.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `docs/prd.md` | 수정 |
| `.orch/overlay.md` | 수정 |
