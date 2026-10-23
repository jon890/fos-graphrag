# 금융 온톨로지 워크벤치

두 사람이 금융 지식(기업, 종목, 산업, 근거 문서, 인물, 개념, 주장)을 Neo4j 에 저장하고 웹에서 함께 탐색, 추가, 수정, 검토하는 도구다.
근거가 있는 지식그래프를 사람이 관리하는 첫 마일스톤이다. GraphRAG 검색이나 자동매매는 아직 없다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `ontology/financial-ontology.yaml` | 온톨로지의 첫 버전과 서버 코드가 소유하는 부분(검토 상태, 이력 이름, 주장 관계, Claim 타입). 그 뒤의 버전은 DB 에 쌓이고 ADMIN 이 웹에서 고친다 |
| `ontology/seeds/` | 시작할 때 한 번 넣는 초기 데이터. key 마다 한 번만 적용한다 |
| `api/` | Kotlin, Spring Boot 4.1, Neo4jClient. Google 로그인과 역할, 검증, 변경 이력, 조회 제한 |
| `web/` | React, TypeScript, Vite, Cytoscape.js |
| `compose.yml` | 운영 Compose. Neo4j 포트를 호스트에 열지 않는다 |
| `compose.dev.yml` | 개발용 Neo4j(`127.0.0.1:7476`, `127.0.0.1:7689`)와 가짜 OIDC 공급자(`127.0.0.1:8090`) |
| `compose.e2e.yml` | 브라우저 테스트용 override. 가짜 OIDC 공급자를 더한다 |
| `scripts/` | 백업, 복원, Compose 설정 검사 |
| `docs/` | 요구사항, 흐름, API 계약, 데이터 스키마, 배포, ADR |

## 실행

```bash
# cwd: financial-workbench
cp .env.example .env    # NEO4J_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, WORKBENCH_BOOTSTRAP_ADMIN_EMAIL
docker compose up -d --build --wait
```

로그인은 Google 계정으로만 한다. 첫 관리자가 「사용자」 탭에서 다른 사람의 Gmail 과 역할(VIEWER, EDITOR, ADMIN)을 추가한다.
Google OAuth client 만들기, 공개 HTTPS 배포, 백업과 복원, 개발 환경 실행은 [배포 문서](docs/deployment.md)에 있다.

## 검증

```bash
# cwd: financial-workbench
bash scripts/tests/test_scripts.sh          # 스크립트 문법, 포트, cap_drop, digest 고정 규칙

# cwd: financial-workbench/api
./gradlew test                               # Testcontainers 로 Neo4j 와 가짜 OIDC 공급자를 띄운다

# cwd: financial-workbench/web
npm ci && npm run typecheck && npm test && npm run build

# 브라우저 흐름. 운영 Compose 에 가짜 OIDC override 를 겹쳐 띄운 뒤 실행한다
COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait   # cwd: financial-workbench
WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npx playwright test  # cwd: financial-workbench/web
```

Colima 처럼 Docker 소켓이 VM 안에 있는 환경에서는 `api/build.gradle.kts` 가 `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` 를 `/var/run/docker.sock` 으로 둔다.
`DOCKER_HOST` 에 `.colima` 가 들어 있을 때만 적용한다.

## 문서

- [제품 요구사항과 다음 GraphRAG 마일스톤](docs/prd.md)
- [흐름](docs/flow.md)
- [코드 구조와 결정](docs/code-architecture.md)
- [API 계약](docs/api-contract.md)
- [데이터 스키마](docs/data-schema.md)
- [배포와 백업](docs/deployment.md)
- [이미지 workflow](../.github/workflows/workbench-image.yml): `homeserver` label 의 self-hosted runner 가 필요하다. GitHub-hosted 로는 돌지 않는다. 로컬 확인은 `docker build --platform linux/amd64 financial-workbench` 로 한다.
