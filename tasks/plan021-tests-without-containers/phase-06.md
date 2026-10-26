# Phase 06. 배포 뒤 운영 확인을 스크립트 하나로 모으고 테스트 workflow 를 둔다

**Execution profile**: standard

## 목표

배포 뒤 확인(health, 인증 경계, OAuth 메타데이터의 공개 origin)을 컨테이너 없이 도는 스크립트 하나로 모으고 `scripts/deploy-prod.sh` 의 마지막 단계로 부른다. GitHub-hosted runner 에서 서버, 웹 단위, 화면 테스트를 도는 workflow 를 둔다.

**범위 외**: 운영 배포 자체. 이 phase 는 운영 주소에 요청을 보내지 않는다. 스크립트 검사는 로컬 가짜 HTTP 서버로 한다.

## 컨텍스트

- `scripts/deploy-prod.sh` 는 이미지 workflow 를 돌리고 홈서버에 배포한 뒤 `HEALTH_URL`(공개 origin 의 `/api/health`)이 200 이 될 때까지 기다린다. 공개 origin 은 이 파일이 소유한다(README 「저장소는 공개라서 ...」 문단).
- 지금 운영 확인 명령은 `docs/deployment.md` 의 「에이전트 연동 확인」 과 「원격 MCP 확인」 에 curl 로 흩어져 있다.
- 서버의 경로: `GET /api/health`(`web/HealthController.kt`), `GET /api/v1/ontology`(토큰 없으면 401), `POST /mcp`(토큰 없으면 401 과 `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp", scope="read write"`, `mcp/McpSecurity.kt`), `GET /.well-known/oauth-protected-resource/mcp` 의 `resource`, `GET /.well-known/oauth-authorization-server` 의 `issuer`(`oauth/OAuthMetadataController.kt`).
- 새 스크립트는 TypeScript 로 쓰고 Node 24 가 바로 실행한다(`node scripts/smoke-prod.ts`). 외부 패키지를 쓰지 않는다(`fetch`, `node:test`, `node:http`).
- 이미지 workflow `.github/workflows/workbench-image.yml` 이 action 을 commit SHA 로 고정하는 방식을 따른다.

**근거 문서**: `docs/code-architecture.md` 의 「테스트」, `docs/adr/018-tests-without-containers.md`

## 의도 메모

- 토큰을 쓰는 확인은 `SMOKE_TOKEN` 환경 변수가 있을 때만 한다. 토큰을 저장소나 로그에 남기지 않는다. 쓰기 요청은 보내지 않는다.
- 이 확인은 컨테이너를 띄우지 않는다.

## 작업 항목

### 1. `scripts/smoke-prod.ts`(신규)

`node scripts/smoke-prod.ts <공개 origin>` 으로 부른다. origin 이 `https://` 로 시작하지 않으면 바로 실패한다. 검사마다 `통과: ...` 나 `실패: ...` 를 한 줄씩 찍고, 하나라도 실패하면 종료 코드 1 이다.

1. `GET /api/health` 가 200 이다.
2. 토큰 없는 `GET /api/v1/ontology` 가 401 이다.
3. 토큰 없는 `POST /mcp`(본문 `{}`, `Content-Type: application/json`)가 401 이고, `WWW-Authenticate` 가 `Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp"` 를 담는다.
4. `/.well-known/oauth-protected-resource/mcp` 의 `resource` 가 `<origin>/mcp` 다.
5. `/.well-known/oauth-authorization-server` 의 `issuer` 가 `<origin>` 이다.
6. `SMOKE_TOKEN` 이 있으면 `Authorization: Bearer` 로 `GET /api/v1/me` 가 200 이다. 없으면 `건너뜀: SMOKE_TOKEN 없음` 을 찍는다.

검사 함수는 `export async function smoke(origin: string, token?: string): Promise<{ ok: boolean; lines: string[] }>` 로 내보내고, 파일을 직접 실행했을 때만(`import.meta.main`) 인자를 읽어 실행한다.

### 2. 이 phase 를 검증하는 `scripts/tests/smoke-prod.test.ts`(신규)

`node:test` 와 `node:http` 로 가짜 서버를 띄워 `smoke` 를 부른다. 가짜 서버는 TLS 가 없으므로 테스트는 `smoke` 의 origin 검사를 우회하는 내부 인자(`{ allowHttp: true }`)를 쓴다.

- 정상: 위 다섯 응답을 모두 맞게 주면 `ok` 가 true 다. `SMOKE_TOKEN` 을 주면 `/api/v1/me` 에 `Authorization` 헤더가 실린다.
- 실패: `issuer` 가 `http://` 로 시작하면 `ok` 가 false 이고 그 줄이 `실패:` 로 시작한다. `POST /mcp` 가 401 이어도 `WWW-Authenticate` 가 없으면 실패다. origin 이 `http://` 이면 `allowHttp` 없이 바로 실패한다.

`scripts/tests/test_scripts.sh` 에 `node --test scripts/tests/smoke-prod.test.ts` 를 더하고 실패를 `failed=1` 로 센다.

### 3. `scripts/deploy-prod.sh`

health 200 을 확인한 뒤 `node scripts/smoke-prod.ts "${HEALTH_URL%/api/health}"` 를 부르고, 실패하면 종료 코드 1 이다. 머리 주석의 단계 설명에 4) 운영 확인을 더한다.

### 4. `.github/workflows/test.yml`(신규)

- `on: pull_request`(base `main`)와 `push`(`main`). `permissions: contents: read`. `runs-on: ubuntu-latest`. action 은 commit SHA 로 고정하고 버전을 주석으로 단다(`workbench-image.yml` 과 같은 `actions/checkout` SHA 를 쓴다).
- job `api`: Temurin 21 을 준비하고 `cd api && ./gradlew test --rerun`. 그 뒤 `git diff --exit-code -- web/e2e/fixtures` 로 커밋한 스냅샷과 같은지 본다.
- job `web`: Node 24, `cd web && npm ci && npm run typecheck && npm test && npm run build && npx playwright install --with-deps chromium && npx playwright test --project=chromium --project=mobile`. 실패하면 `web/test-results/` 와 `web/playwright-report/` 를 artifact 로 올린다.
- job `scripts`: `bash scripts/tests/test_scripts.sh`.
- `scripts/tests/test_scripts.sh` 에 「테스트 workflow 의 action 이 SHA 로 고정됐다」 검사(`uses:` 줄이 모두 `@[0-9a-f]{40}` 를 담는다)를 더한다.

### 5. 문서

- `docs/deployment.md`: 「배포 뒤 확인」 절을 새로 두고 `node scripts/smoke-prod.ts https://<공개 origin>` 과 `SMOKE_TOKEN` 사용법, 각 검사의 기대값을 적는다. 「원격 MCP 확인」 의 curl 세 줄은 이 절을 가리키는 한 줄로 바꾸고, 실제 Claude Code 로 붙는 사람 확인 문단은 남긴다.
- `README.md` 「구성」 의 `.github/workflows/` 설명과 「검증」 에 테스트 workflow 를 더한다.
- `docs/code-architecture.md` 「전체 배치」 의 `.github/workflows/` 설명에 테스트 workflow 를 더한다.
- `.orch/overlay.md` 「배포」 에 「배포 스크립트가 마지막에 `scripts/smoke-prod.ts` 로 운영을 확인한다」 를 더한다.

## 검증

```bash
cd api && DOCKER_HOST=unix:///nonexistent.sock ./gradlew test --rerun
cd web && npm run typecheck && npm test && npm run build
cd web && DOCKER_HOST=unix:///nonexistent.sock npx playwright test --project=chromium --project=mobile
node --test scripts/tests/smoke-prod.test.ts
bash scripts/tests/test_scripts.sh
bash -n scripts/deploy-prod.sh
```

- workflow 파일의 문법은 `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/test.yml'))"` 로 본다. 실제 실행은 원격 검증 목록에 있다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/smoke-prod.ts` | 신규 |
| `scripts/tests/smoke-prod.test.ts` | 신규 |
| `scripts/tests/test_scripts.sh` | 수정 |
| `scripts/deploy-prod.sh` | 수정 |
| `.github/workflows/test.yml` | 신규 |
| `docs/deployment.md` | 수정 |
| `docs/code-architecture.md` | 수정 |
| `README.md` | 수정 |
| `.orch/overlay.md` | 수정 |
