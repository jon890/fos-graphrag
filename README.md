# 가치투자 온톨로지

투자 논리와 근거를 지식그래프에 쌓고, 사람과 AI 가 함께 읽고 고치는 도구예요.

- 웹 앱과 Claude Code·Codex 플러그인으로 써요.
- 두 사람이 함께 쓰고 있어요.
- 최종 목표는 토스증권과 이어서 실제 매매까지 가는 거예요.

처음 오셨다면 아래 순서로 읽으면 돼요.

1. [무엇을 만드나요](#무엇을-만드나요)
2. [왜 만드나요](#왜-만드나요)
3. [최종 목표](#최종-목표)
4. [바로 써 보기](#바로-써-보기)
5. [개발자용 안내](#개발자용-안내)

<br>

## 무엇을 만드나요

투자 논리를 하나의 흐름으로 이어 저장해요.

> 세상의 변화 → 병목 → 산업 → 기업 → 시나리오 밸류에이션 → 투자 결정

여기에 두 가지 층이 있어요.

| 층 | 뜻 | 예시 |
| --- | --- | --- |
| 온톨로지 | 무엇을 어떻게 적을지 정한 틀 | 「기업」 타입, 「병목을 푼다」 관계 |
| 인스턴스 | 그 틀 위에 쌓인 실제 데이터 | 「A 기업이 전력 병목을 푼다」 와 그 근거 |

지금 할 수 있는 일이에요.

- **둘러보기**: 개념 지도로 온톨로지를 보고, 항목을 찾아요.
- **근거 따라가기**: 투자 결정이 기댄 근거를 세상의 변화까지 거슬러 올라가요.
- **공부**: 잘 모르는 개념을 「잘 모르겠어요」 로 표시해 모아 봐요.
- **AI 와 함께 쓰기**: Claude Code 나 Codex 에게 말로 찾고, 데이터를 더해요.

AI 가 올린 내용은 바로 반영되지 않아요.
**제안**으로 올라오고, 사람이 웹에서 승인해야 반영돼요.

<br>

## 왜 만드나요

투자 판단은 대개 머릿속이나 흩어진 메모에 남아요.
시간이 지나면 이런 질문에 답하기 어려워요.

- 이 종목을 왜 샀지?
- 그때 믿었던 근거가 아직 유효한가?
- 친구는 같은 종목을 어떤 논리로 보고 있지?

그래서 세 가지를 하려고 해요.

1. **같은 틀로 적어요.**
   온톨로지가 정한 타입과 관계로 적으면, 두 사람의 논리를 같은 구조에서 비교할 수 있어요.
2. **근거를 끝까지 이어요.**
   투자 결정에서 근거, 세상의 변화까지 따라갈 수 있어야 판단을 다시 점검할 수 있어요.
3. **AI 가 같은 구조를 읽고 쓰게 해요.**
   입력은 AI 가 돕고, 판단과 승인은 사람이 해요.

<br>

## 최종 목표

토스증권 계좌와 가치투자 온톨로지를 이어서, **근거가 있는 투자 결정이 실제 매매까지 닿게** 하는 거예요.

- 「왜 이 종목을 이만큼 사는가」 가 그래프에 남아요.
- 체결 결과가 다시 그 결정에 붙어요.
- 나중에 판단이 맞았는지 되돌아볼 수 있어요.

한 번에 가지 않고 단계를 밟고 있어요.

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1 | 웹에서 투자 논리와 근거를 쌓고 함께 검토 | ✅ 운영 중 |
| 2 | Claude Code·Codex 로 조회하고, 온톨로지와 데이터를 고치기 | 🚧 진행 중 |
| 3 | 개인 비서가 토스증권 체결을 기록하고 해석을 제안 | ⏸ 기능만 있음 |
| 4 | 증권사 연동과 실제 매매 | 🎯 다음 목표 |

자세한 요구사항은 [제품 요구사항](docs/prd.md)에 있어요.

<br>

## 바로 써 보기

로그인은 Google 계정으로 해요.
관리자가 웹의 「더보기 → 사용자」 에서 Gmail 을 먼저 더해 줘야 해요.

### Claude Code

1. 아래 두 줄을 차례로 입력해요.

   ```
   /plugin marketplace add jon890/fos-valuation-ontology
   /plugin install valuation-ontology@fos-valuation-ontology
   ```

2. 「가치투자 온톨로지 연결해 줘」 라고 말해요.
3. 브라우저가 열리면 Google 로 로그인하고 「연결 허용」 을 눌러요.
   데이터를 더하거나 고치려면 「조회와 기록」 을 골라요.

### Codex

1. 터미널에서 아래 두 줄을 차례로 실행해요.

   ```bash
   codex plugin marketplace add jon890/fos-valuation-ontology
   codex plugin add valuation-ontology@fos-valuation-ontology
   ```

2. Codex 에서 「가치투자 온톨로지 연결해 줘」 라고 말해요.
3. 브라우저가 열리지 않으면 `codex mcp login valuation-ontology` 를 실행해요.

### 이렇게 말해 보세요

- 「안전마진이 뭐야」
- 「FLNC 투자 근거 보여줘」
- 「내 공부 목록 보여줘」

막혔을 때와 연결을 끊는 방법은 [플러그인 안내](plugin/README.md)에 있어요.

<br>

## 개발자용 안내

### 저장소 구성

| 경로 | 내용 |
| --- | --- |
| `api/` | 서버. Kotlin, Spring Boot 4.1, Neo4j |
| `web/` | 웹 앱. React, TypeScript, Vite, Cytoscape.js |
| `plugin/` | Claude Code·Codex 플러그인과 스킬 |
| `ontology/` | 온톨로지 첫 버전(`financial-ontology.yaml`)과 초기 데이터(`seeds/`) |
| `docs/` | 요구사항, 흐름, API 계약, 데이터 스키마, 배포, ADR |
| `scripts/` | 배포, 백업, 복원, 설정 검사 |
| `compose*.yml` | 운영(`compose.yml`), 개발(`compose.dev.yml`), 브라우저 테스트(`compose.e2e.yml`) |
| `.github/workflows/` | GHCR 이미지 빌드 |

온톨로지는 첫 버전만 파일에 있어요.
그 뒤의 버전은 DB 에 쌓이고 웹에서 고쳐요.

공개 저장소라서 운영 주소, 홈서버 경로, 계정은 적지 않아요.
공개 주소만 `scripts/deploy-prod.sh` 와 `plugin/.mcp.json` 에 있어요.

### 직접 띄우기

```bash
# cwd: 저장소 루트
cp .env.example .env    # NEO4J_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, WORKBENCH_BOOTSTRAP_ADMIN_EMAIL
docker compose up -d --build --wait
```

- `WORKBENCH_BOOTSTRAP_ADMIN_EMAIL` 의 계정이 첫 관리자가 돼요.
- 역할은 VIEWER, EDITOR, ADMIN 셋이에요.
- Google OAuth client 만들기, HTTPS 배포, 백업과 복원은 [배포 문서](docs/deployment.md)에 있어요.

### 검증

```bash
# cwd: 저장소 루트
bash scripts/tests/test_scripts.sh          # 스크립트 문법, 포트, cap_drop, digest 고정

# cwd: api
./gradlew test                               # Docker 없이 테스트 JVM 안에 Neo4j 와 가짜 OIDC 공급자를 띄워요

# cwd: api
./gradlew test --rerun --tests '*ApiSnapshotTest'   # web/e2e/fixtures/*.json 을 다시 써요. 바뀐 파일은 함께 커밋해요
git diff --stat -- ../web/e2e/fixtures

# cwd: web
npm ci && npm run typecheck && npm test && npm run build

# cwd: 저장소 루트
cd web && npx playwright install chromium && npm run test:e2e   # 가짜 API 로 1440px, 390px 화면 테스트
```

브라우저 테스트는 운영 Compose 에 가짜 OIDC 를 겹쳐 띄운 뒤 돌려요.

```bash
COMPOSE_FILE=compose.yml:compose.e2e.yml docker compose up -d --build --wait   # cwd: 저장소 루트
WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npx playwright test  # cwd: web
```

### 개인 비서 연동(고급)

아직 쓰지 않는 기능이에요.

- 「더보기 → 연동」 에서 토큰을 발급해 fos-assistant 커넥터에 넣어요.
- 에이전트는 그 토큰으로 `/api/v1` 을 불러요.
- 계약은 [API 계약](docs/api-contract.md)의 「에이전트 API」 절에 있어요.

### 문서

| 문서 | 내용 |
| --- | --- |
| [제품 요구사항](docs/prd.md) | 무엇을, 어디까지 만드는지 |
| [흐름](docs/flow.md) | 화면과 사용자 흐름 |
| [코드 구조와 결정](docs/code-architecture.md) | 모듈 구조와 설계 결정 |
| [API 계약](docs/api-contract.md) | 서버 API 와 에이전트 API |
| [데이터 스키마](docs/data-schema.md) | Neo4j 노드와 관계 |
| [배포와 백업](docs/deployment.md) | 운영 배포, 백업, 복원 |
| [ADR](docs/adr/) | 주요 결정의 기록 |

이미지는 GitHub-hosted runner 에서 `linux/amd64` 로 빌드해 GHCR 에 올려요([workflow](.github/workflows/workbench-image.yml)).
