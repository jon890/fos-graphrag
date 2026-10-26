# Phase 06. Compose 브라우저 테스트 스택을 지우고, 운영 확인 스크립트와 테스트 workflow 를 둔다

**Execution profile**: standard

## 목표

`compose.e2e.yml` 과 그것을 가리키는 스크립트 검사와 문서를 지운다. 배포 뒤 확인(health, 인증 경계, OAuth 메타데이터의 공개 origin)을 컨테이너 없이 도는 스크립트 하나로 모으고 `scripts/deploy-prod.sh` 의 마지막 단계로 부른다. GitHub-hosted runner 에서 서버, 웹 단위, 화면 테스트와 스크립트 검사를 도는 workflow 를 둔다(사용자 결정 2026-10-26, ADR-018).

**범위 외**: 운영 배포 자체. 이 phase 는 운영 주소에 요청을 보내지 않는다. 스크립트 검사는 로컬 가짜 HTTP 서버로 한다. `api/src/main/resources/application.yaml` 의 `e2e` 프로필 그룹과 `ProdStartupGuard` 의 안내 문구는 남긴다(`index.json` 의 `deferred`).

## 컨텍스트

- Compose 와 스크립트, 문서에서 e2e 를 가리키는 곳: `compose.e2e.yml`, `scripts/check-compose.sh`(e2e 렌더링 `e2e_json` 과 그 검사, 통과 문구), `scripts/tests/test_scripts.sh`(「e2e override 는 prod 프로필을 켜지 않는다」), `README.md`(「구성」 표의 `compose*.yml` 줄, 「검증」 의 Compose 브라우저 블록), `docs/deployment.md`(「브라우저 테스트」 절), `docs/code-architecture.md`(「전체 배치」 의 `compose.e2e.yml` 줄과 `web/e2e/` 설명, 「설정」 표의 `e2e` 와 `mockoidc` 줄, 「결정」 의 브라우저 테스트 항목), `docs/prd.md`(「자동 테스트와 브라우저 테스트는 가짜 OIDC 공급자를 쓴다」), `.orch/overlay.md`(「검증 명령」 의 브라우저 줄). `git grep -n "compose.e2e\|E2E_ADMIN\|WORKBENCH_URL"` 로 빠진 곳을 찾는다. `README.md` 는 해요체로 쓰여 있으니 같은 문체로 고친다.
- `scripts/deploy-prod.sh` 는 이미지 workflow 를 돌리고 홈서버에 배포한 뒤 `HEALTH_URL`(공개 origin 의 `/api/health`)이 200 이 될 때까지 기다리는 루프 안에서 `exit 0` 한다. 공개 origin 은 이 파일이 소유한다.
- 지금 운영 확인 명령은 `docs/deployment.md` 의 「에이전트 연동 확인」 과 「원격 MCP 확인」 에 curl 로 흩어져 있다.
- 서버의 경로: `GET /api/health`(`web/HealthController.kt`), `GET /api/v1/ontology`(토큰 없으면 401), `POST /mcp`(토큰 없으면 401 과 `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp", scope="read write"`, `mcp/McpSecurity.kt`), `GET /.well-known/oauth-protected-resource/mcp` 의 `resource`, `GET /.well-known/oauth-authorization-server` 의 `issuer`(`oauth/OAuthMetadataController.kt`).
- 새 스크립트는 TypeScript 로 쓰고 Node 24 가 바로 실행한다(`node scripts/smoke-prod.ts`). 외부 패키지를 쓰지 않는다(`fetch`, `node:test`, `node:http`). `.ts` 직접 실행과 `import.meta.main` 은 Node 24 가 필요하다.
- 이미지 workflow `.github/workflows/workbench-image.yml` 이 action 을 commit SHA 로 고정하는 방식을 따른다.

**근거 문서**: `docs/code-architecture.md` 의 「테스트」, `docs/adr/018-tests-without-containers.md`

## 의도 메모

- 토큰을 쓰는 확인은 `SMOKE_TOKEN` 환경 변수가 있을 때만 한다. 토큰을 저장소나 로그에 남기지 않는다. 쓰기 요청은 보내지 않는다.
- `docs/code-architecture.md` 「결정」 의 브라우저 테스트 항목 세 줄 가운데 셋째 줄(「`prod` 에 가짜 공급자를 허용하는 안은 버렸다 ...」)은 `ProdStartupGuard` 의 근거라 남긴다. 앞 두 줄만 지우고, 셋째 줄은 「`prod` 와 `mockoidc` 를 함께 켜면 시작을 막는다. `prod` 에 가짜 공급자를 허용하는 안은 ...」 로 다듬어 독립 항목으로 둔다.

## 작업 항목

### 1. Compose 브라우저 테스트 스택 지우기

- `compose.e2e.yml` 을 지운다.
- `scripts/check-compose.sh` 에서 e2e 렌더링(`e2e_json`)과 그 검사, 통과 문구의 「e2e」 를 지운다. 개발 Compose 검사는 남긴다.
- `scripts/tests/test_scripts.sh` 의 「e2e override 는 prod 프로필을 켜지 않는다」 줄을 지운다.

### 2. `scripts/smoke-prod.ts`(신규)

`node scripts/smoke-prod.ts <공개 origin>` 으로 부른다. 검사마다 `통과: ...` 나 `실패: ...` 를 한 줄씩 찍고, 하나라도 실패하면 종료 코드 1 이다.

`export async function smoke(origin: string, token?: string, options?: { allowHttp?: boolean }): Promise<{ ok: boolean; lines: string[] }>` 로 내보내고, 파일을 직접 실행했을 때만(`import.meta.main`) 인자와 `SMOKE_TOKEN` 을 읽어 실행한다. origin 이 `https://` 로 시작하지 않으면 `allowHttp` 가 없는 한 바로 실패한다.

1. `GET /api/health` 가 200 이다.
2. 토큰 없는 `GET /api/v1/ontology` 가 401 이다.
3. 토큰 없는 `POST /mcp`(본문 `{}`, `Content-Type: application/json`)가 401 이고, `WWW-Authenticate` 가 `Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp"` 를 담는다.
4. `/.well-known/oauth-protected-resource/mcp` 의 `resource` 가 `<origin>/mcp` 다.
5. `/.well-known/oauth-authorization-server` 의 `issuer` 가 `<origin>` 이다.
6. 토큰이 있으면 `Authorization: Bearer` 로 `GET /api/v1/me` 가 200 이다. 없으면 `건너뜀: SMOKE_TOKEN 없음` 을 찍는다.

### 3. 이 phase 를 검증하는 `scripts/tests/smoke-prod.test.ts`(신규)

`node:test` 와 `node:http` 로 가짜 서버를 띄워 `smoke(origin, token, { allowHttp: true })` 를 부른다.

- 정상: 위 다섯 응답을 모두 맞게 주면 `ok` 가 true 다. 토큰을 주면 `/api/v1/me` 에 `Authorization` 헤더가 실린다.
- 실패: `issuer` 가 다른 origin 이면 `ok` 가 false 이고 그 줄이 `실패:` 로 시작한다. `POST /mcp` 가 401 이어도 `WWW-Authenticate` 가 없으면 실패다. origin 이 `http://` 이고 `allowHttp` 가 없으면 바로 실패한다.

`scripts/tests/test_scripts.sh` 에 `node --test scripts/tests/smoke-prod.test.ts` 를 더하고 실패를 `failed=1` 로 센다.

### 4. `scripts/deploy-prod.sh`

health 루프 안의 `exit 0` 을 루프를 빠져나오는 형태로 바꾸고, health 가 끝내 200 이 아니면 지금처럼 실패한다. 그 뒤 `node "$(dirname "$0")/smoke-prod.ts" "${HEALTH_URL%/api/health}"` 를 부르고 실패하면 종료 코드 1 이다. 머리 주석의 단계 설명에 4) 운영 확인을 더한다.

### 5. `.github/workflows/test.yml`(신규)

- `name: test`. `on: pull_request`(branches `main`)와 `push`(branches `main`). `permissions: contents: read`. 모든 job 은 `runs-on: ubuntu-latest`. action 은 commit SHA 로 고정하고 버전을 주석으로 단다(`actions/checkout` 은 `workbench-image.yml` 과 같은 SHA). job 이름(`api`, `web`, `scripts`)이 GitHub 체크 이름이 된다.
- job `api`: Temurin 21 을 준비하고 `cd api && ./gradlew test --rerun`. 그 뒤 `test -z "$(git status --porcelain -- web/e2e/fixtures)"` 로 커밋한 스냅샷과 같은지 본다(`git diff` 는 untracked 파일을 놓친다). 다르면 `git status` 와 `git diff --stat` 을 찍고 실패한다.
- job `web`: Node 24 를 준비하고 `cd web && npm ci && npm run typecheck && npm test && npm run build && npx playwright install --with-deps chromium && npx playwright test --project=chromium --project=mobile`. 실패하면 `web/test-results/` 와 `web/playwright-report/` 를 artifact 로 올린다.
- job `scripts`: Node 24 를 준비한 뒤 `bash scripts/tests/test_scripts.sh`.
- `scripts/tests/test_scripts.sh` 에 「테스트 workflow 의 action 이 SHA 로 고정됐다」 검사(`.github/workflows/test.yml` 의 `uses:` 줄이 모두 `@[0-9a-f]{40}` 를 담는다)를 더한다.

### 6. 문서

- `README.md`: 「구성」 표의 `compose*.yml` 줄에서 브라우저 테스트(`compose.e2e.yml`)를 빼고, `.github/workflows/` 설명에 테스트 workflow 를 더한다. 「검증」 의 Compose 브라우저 블록을 지우고 phase 03 이 더한 `npm run test:e2e` 줄만 남긴다. 「검증」 에 PR 과 main 에서 테스트 workflow 가 같은 검사를 돈다고 적는다.
- `docs/deployment.md`: 「브라우저 테스트」 절을 「화면 테스트는 Docker 없이 가짜 API 로 돈다」 와 명령 한 블록으로 바꾼다. 「배포 뒤 확인」 절을 새로 두고 `node scripts/smoke-prod.ts https://<공개 origin>` 과 `SMOKE_TOKEN` 사용법, 각 검사의 기대값을 적는다. 「원격 MCP 확인」 의 curl 세 줄은 이 절을 가리키는 한 줄로 바꾸고, 실제 Claude Code 로 붙는 사람 확인 문단은 남긴다.
- `docs/code-architecture.md`: 「전체 배치」 의 `compose.e2e.yml` 줄을 지우고 `web/e2e/` 설명을 「Playwright 화면 테스트와 가짜 API, 응답 스냅샷(`fixtures/`)」 으로, `.github/workflows/` 설명을 「GHCR 이미지 workflow 와 테스트 workflow」 로 고친다. 「설정」 표의 `e2e` 줄 설명을 「쓰지 않는다」 로 고치고 `mockoidc` 줄의 용도에서 e2e 를 뺀다. 「결정」 의 브라우저 테스트 항목은 의도 메모대로 고친다.
- `docs/prd.md` 의 그 문장을 「서버 자동 테스트는 가짜 OIDC 공급자를, 화면 테스트는 가짜 API 를 쓴다」 로 고친다.
- `.orch/overlay.md`: 「검증 명령」 의 브라우저 줄을 `cd web && npx playwright test --project=chromium --project=mobile`(Docker 없음, 스크린샷은 `web/test-results/screenshots/`)으로 바꾼다. 「배포」 에 「배포 스크립트가 마지막에 `scripts/smoke-prod.ts` 로 운영을 확인한다」 를 더한다.

## 검증

```bash
cd api && DOCKER_HOST=unix:///nonexistent.sock ./gradlew test --rerun
cd web && npm run typecheck && npm test && npm run build
cd web && DOCKER_HOST=unix:///nonexistent.sock npx playwright test --project=chromium --project=mobile
node --test scripts/tests/smoke-prod.test.ts
bash scripts/tests/test_scripts.sh
bash -n scripts/deploy-prod.sh
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/test.yml'))"
! git grep -n "compose.e2e\|E2E_ADMIN\|WORKBENCH_URL" -- . ':!tasks' ':!docs/adr'
```

- 실제 workflow 실행은 원격 검증 목록에 있다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `compose.e2e.yml` | 삭제 |
| `scripts/check-compose.sh` | 수정 |
| `scripts/smoke-prod.ts` | 신규 |
| `scripts/tests/smoke-prod.test.ts` | 신규 |
| `scripts/tests/test_scripts.sh` | 수정 |
| `scripts/deploy-prod.sh` | 수정 |
| `.github/workflows/test.yml` | 신규 |
| `docs/deployment.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `docs/prd.md` | 수정 |
| `README.md` | 수정 |
| `.orch/overlay.md` | 수정 |
