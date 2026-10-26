# 금융 온톨로지 워크벤치

두 사람이 각자의 투자 논리(세상의 변화, 병목, 산업, 기업, 시나리오 밸류에이션, 투자 결정)와 근거를 Neo4j 에 저장하고 웹에서 함께 탐색, 추가, 수정, 검토하는 도구다.
근거가 있는 지식그래프를 사람이 관리하는 첫 마일스톤이다. GraphRAG 검색이나 자동매매는 아직 없다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `ontology/financial-ontology.yaml` | 온톨로지의 첫 버전과 서버 코드가 소유하는 부분(검토 상태, 이력 이름, 주장 관계, Claim 타입). 그 뒤의 버전은 DB 에 쌓이고 ADMIN 이 웹에서 고친다 |
| `ontology/seeds/` | 시작할 때 한 번 넣는 초기 데이터. key 마다 한 번만 적용한다 |
| `api/` | Kotlin, Spring Boot 4.1, Neo4jClient. Google 로그인과 역할, 검증, 변경 이력, 조회 제한, 연동 토큰, 에이전트 API(조회, 체결 기록, 제안) |
| `web/` | React, TypeScript, Vite, Cytoscape.js |
| `compose.yml` | 운영 Compose. Neo4j 포트를 호스트에 열지 않는다 |
| `compose.dev.yml` | 개발용 Neo4j(`127.0.0.1:7476`, `127.0.0.1:7689`)와 가짜 OIDC 공급자(`127.0.0.1:8090`) |
| `compose.e2e.yml` | 브라우저 테스트용 override. 가짜 OIDC 공급자를 더한다 |
| `scripts/` | 백업, 복원, Compose 설정 검사 |
| `docs/` | 요구사항, 흐름, API 계약, 데이터 스키마, 배포, ADR |

## 실행

```bash
# cwd: 저장소 루트
cp .env.example .env    # NEO4J_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, WORKBENCH_BOOTSTRAP_ADMIN_EMAIL
docker compose up -d --build --wait
```

로그인은 Google 계정으로만 한다. 첫 관리자가 오른쪽 위 「더보기」 메뉴의 「사용자」 에서 다른 사람의 Gmail 과 역할(VIEWER, EDITOR, ADMIN)을 추가한다.
처음 열면 온톨로지의 타입과 관계를 그린 개념 지도가 보인다. 항목은 어느 화면에서나 오른쪽 위 「＋ 추가」 로 만든다.
항목 상세의 「근거 따라가기」 는 그 항목이 기댄 근거를 변화까지 거슬러 보이고, 「공부」 탭은 내가 「잘 모르겠어요」 로 표시한 항목을 모은다.
개인 비서 Hermes 가 워크벤치를 조회하게 하려면 「더보기」 의 「연동 토큰」 에서 토큰을 발급해 커넥터에 넣는다. 에이전트는 그 토큰으로 `/api/v1` 을 부른다. 「조회와 기록」 으로 발급한 토큰이면 Hermes 가 토스증권 체결을 「내 체결」 에 넣고, 투자 결정 만들기 같은 해석은 「더보기」 의 「제안」 에 올려 내가 승인한다. 체결은 나만 본다. 계약은 [API 계약](docs/api-contract.md) 의 「에이전트 API」 절이다.
Google OAuth client 만들기, 공개 HTTPS 배포, 백업과 복원, 개발 환경 실행은 [배포 문서](docs/deployment.md)에 있다.

## 검증

```bash
# cwd: 저장소 루트
bash scripts/tests/test_scripts.sh          # 스크립트 문법, 포트, cap_drop, digest 고정 규칙

# cwd: api
./gradlew test                               # Testcontainers 로 Neo4j 와 가짜 OIDC 공급자를 띄운다

# cwd: web
npm ci && npm run typecheck && npm test && npm run build

# 브라우저 흐름. 운영 Compose 에 가짜 OIDC override 를 겹쳐 띄운 뒤 실행한다
COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait   # cwd: 저장소 루트
WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npx playwright test  # cwd: web
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
- [이미지 workflow](.github/workflows/workbench-image.yml): GitHub-hosted runner(`ubuntu-latest`)에서 Buildx 로 `linux/amd64` 이미지를 GHCR 에 올린다. 공개 저장소이므로 홈서버 runner 를 쓰지 않는다(사용자 결정: 2026-10-24). 로컬 확인은 `docker buildx build --platform linux/amd64 .` 로 한다.
