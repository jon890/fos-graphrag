# Phase 05. 플러그인 스킬, 이미지 라벨, e2e 갱신

**Execution profile**: standard

## 목표

친구가 Claude Code·Codex 에서 「온톨로지 정의 바꾸기」 와 인스턴스 고치기를 스킬의 안내로 끝까지 하게 하고, GHCR 패키지에 설명을 붙이고, 바뀐 화면에 맞춰 브라우저 테스트를 고친다.

**범위 외**: 서버와 웹 코드(phase 01~04). e2e 는 이 phase 에서 고치기만 하고, 통합 검증에서 한 번 돌린다.

## 컨텍스트

- 플러그인: `plugin/.codex-plugin/plugin.json` 의 `skills` 목록, `plugin/skills/*/SKILL.md`, `plugin/README.md`, `plugin/.claude-plugin/plugin.json` 의 `description`. 형식 검사는 `scripts/tests/test_plugin.py` 다(스킬 디렉터리와 codex `skills` 목록의 일치, 머리말 `name` 과 `description`, 스킬에 적은 도구 이름이 `docs/api-contract.md` 「원격 MCP(`/mcp`)」 의 도구 표에 있는지). `scripts/tests/test_scripts.sh` 가 이 검사를 부른다.
- 기존 스킬 모양은 `plugin/skills/ontology-record/SKILL.md` 를 따른다(목표 한 줄, 순서 표, 단계 절, 말하는 방식).
- `scripts/tests/test_plugin.py` 의 `TOOL_NAME` 정규식 접두사는 `get|search|trace|lookup|list|record|submit` 뿐이라 `propose_ontology_change` 를 대조하지 못한다. 작업 항목 1 에서 접두사에 `propose` 를 더한다.
- 이미지 workflow 는 `.github/workflows/workbench-image.yml` 의 `labels: |` 블록이다. 라벨은 지시서가 이 plan 에 함께 요구했다. 저장소 설명은 GitHub 저장소 설명과 같은 문장 「투자 논리와 근거를 Neo4j 지식그래프에 함께 쌓고 웹에서 탐색하는 가치투자 온톨로지 (Kotlin, Spring Boot, React)」 다.
- e2e: `web/e2e/workbench.spec.ts` 의 온톨로지 절(폼 편집 테스트가 `ontology-edit-form` 을 쓴다), `web/e2e/mobile.spec.ts` 의 `m-ontology-form` 스크린샷, 연동 화면 테스트.

**근거 문서**: `docs/prd.md` 의 「친구가 대화로 하는 일」, `docs/flow.md` 의 「에이전트 쓰기」, 「온톨로지 변경 카드」, 「연동」, `docs/code-architecture.md` 의 「플러그인」, `docs/api-contract.md` 「원격 MCP(`/mcp`)」 의 「도구」

## 의도 메모

- 스킬은 토큰, 인증, YAML 문법 같은 내부 이야기를 꺼내지 않는다. 사용자가 바꾸고 싶은 것을 말로 확인하고, 올린 뒤 「더보기 → 제안에서 직접 승인해야 반영됩니다」 를 알린다. 제안은 올린 사람만 보고 승인하므로 다른 사람이 대신 승인한다고 안내하지 않는다.
- 이미지 라벨에 운영 주소를 넣지 않는다(저장소는 공개다).

## 작업 항목

### 1. 새 스킬 `plugin/skills/ontology-change/SKILL.md`

- 머리말 `name: ontology-change`, `description` 에 「온톨로지 바꿔 줘」, 「새 종류 추가해 줘」, 「속성 이름 바꿔 줘」, 「관계 종류 더해 줘」 같은 말.
- 순서: 1. 바꿀 내용을 한 문장으로 확인받는다. 2. `get_ontology_yaml` 로 지금 YAML 과 버전을 받는다. 3. 필요한 곳만 고친다(키는 바꾸지 않고, 코드가 소유하는 `reviewStatuses`, `changeActions`, `changeFields`, `claimRelationships`, `nodeTypes.Claim` 은 건드리지 않는다). 4. `propose_ontology_change` 로 올린다(`baseVersion` 은 받은 `version`, `rationale` 에 까닭, `note` 에 한 줄 메모). 5. `ONTOLOGY_INVALID` 면 `details.errors` 의 줄 번호를 보고 고쳐 다시 올린다(세 번까지). `REVISION_CONFLICT` 면 2 단계부터 다시 한다. 6. 「더보기 → 제안에서 바뀐 점과 영향을 보고 직접 승인해야 반영됩니다. 승인에는 관리자 역할이 필요합니다.」 를 알린다. 제안은 올린 사람만 보고 승인한다. 「조회만 허락된 연결」 이면 `ontology-start` 의 안내를 따른다.
- `plugin/.codex-plugin/plugin.json` 의 `skills` 에 `./skills/ontology-change` 를 더한다.
- `scripts/tests/test_plugin.py` 의 `TOOL_NAME` 접두사에 `propose` 를 더한다.

### 2. `plugin/skills/ontology-record/SKILL.md`

- `description` 과 본문에 항목 고치기, 보관, 관계 보관, 주장 만들기를 더한다. 고치기와 보관은 먼저 `get_node` 로 `node.revision` 과 관계의 `relationshipId` 를 읽는다. 주장은 근거 문서가 하나 이상 필요하고, 없으면 먼저 근거 문서를 만드는 제안을 올린다. `REVISION_CONFLICT` 면 다시 읽고 새로 올린다.
- 「제안」 에서 승인할 사람이 본인(친구)이고 주장 검토는 다른 사람이 한다고 알린다.

### 3. 처음 시작 스킬 `plugin/skills/ontology-start/SKILL.md`, `plugin/README.md`, 두 `plugin.json` 의 `description`

`ontology-start` 를 처음 시작을 끝까지 이끄는 스킬로 넓힌다. 새 스킬을 만들지 않는다(`docs/code-architecture.md` 「플러그인」). 순서 표와 단계:

1. 연결 확인: `get_connection`. 인증이 필요하면 지금의 로그인 안내.
2. 누구로 붙었는지: 표시 이름, 역할(`user.role` 을 「열람자」, 「편집자」, 「관리자」 로), 범위(「조회만」, 「조회와 기록」). 역할이 `ADMIN` 이 아니면 「온톨로지 정의를 바꾸려면 관리자 역할이 필요합니다. 관리자에게 내 역할을 관리자로 바꿔 달라고 부탁하세요.」 를 덧붙인다.
3. 범위가 `READ` 면 「더보기 → 연동」 에서 연결을 끊고 다시 로그인해 「조회와 기록」 을 고르라고 안내하고, 다시 연결하면 1 단계부터 한다.
4. 지금 온톨로지 한눈에 보기: `get_ontology` 로 버전, 항목 종류 몇 가지(표시 이름), 관계 몇 가지(문장 틀)를 다섯 줄 안으로 보인다.
5. 할 수 있는 일 세 가지와 예시 문장: 조회(「안전마진이 뭐야」), 데이터 추가(「FLNC 에 근거 문서를 이어 줘」), 온톨로지 수정(「온톨로지에 새 종류 더해 줘」). 내 역할로 승인할 수 없는 일이 있으면 그 일 옆에 「내 역할로는 승인할 수 없습니다」 와 필요한 역할을 적는다.
6. 첫 데이터 추가를 함께 해 보기: 사용자가 원하면 `ontology-record` 의 순서로 항목 하나(예: 개념 하나)를 제안으로 올리고 「더보기 → 제안」 에서 승인하는 위치까지 안내한다. 원하지 않으면 건너뛴다.

토큰, 인증 방식, OAuth 같은 내부 말은 쓰지 않는다. 두 `plugin.json`, 저장소 루트 `.claude-plugin/marketplace.json` 의 `description` 과 `README.md` 의 설명을 「찾아보고, 데이터와 온톨로지 정의를 고치는 제안을 올립니다」 로 맞춘다.
- `plugin/README.md` 첫 문단을 「찾아보고, 항목과 온톨로지 정의를 고치는 제안을 올리는」 으로 고친다.

### 4. 이미지 라벨 `.github/workflows/workbench-image.yml`

`labels: |` 에 `org.opencontainers.image.title=가치투자 온톨로지` 와 `org.opencontainers.image.description=투자 논리와 근거를 Neo4j 지식그래프에 함께 쌓고 웹에서 탐색하는 가치투자 온톨로지 (Kotlin, Spring Boot, React)` 를 더한다.

`scripts/tests/test_scripts.sh` 에 두 라벨이 있는지 보는 `check` 줄을 하나 더한다(기존 `check "이미지 workflow 는 main 에서만 publish 한다"` 와 같은 모양).

### 5. e2e `web/e2e/workbench.spec.ts`, `web/e2e/mobile.spec.ts`, `web/e2e/support.ts`

- phase 04 가 토큰 발급을 접힌 `tokens-advanced` 안으로 옮겼다. `web/e2e/support.ts` 의 `issueToken` 은 시그니처를 그대로 두고 본문에서 먼저 `tokens-advanced` 를 펼친다(`open` 이 없을 때만 `summary` 를 누른다). `tokens-issue-open` 을 바로 누르는 다른 호출부(`git grep -n "tokens-issue-open" web/e2e` 로 찾는다. `mobile.spec.ts` 두 곳, `workbench.spec.ts` 세 곳이다)도 먼저 펼치게 고친다.
- 고친 초안에서 `ontology-draft-discard` 를 누르는 기존 테스트(`workbench.spec.ts` 의 9c)는 이제 확인 창이 먼저 열리므로 `ontology-discard-confirm-submit` 을 누르게 고친다.
- 온톨로지를 저장하거나 제안을 승인하는 새 테스트는 기존 9b 처럼 `finally` 에서 시작 버전으로 되돌린다(`POST /api/ontology/versions/{N}/restore`).

- 폼 편집 테스트(`ontology-edit-form`, `ontology-form-*`)를 지운다. 같은 시나리오(Person 에 속성 더하기)를 YAML 편집으로 바꾼다.
- 새 테스트: 운영 크기를 흉내 내 YAML 끝에 긴 주석 없는 속성을 더해 편집칸을 늘린 뒤 편집칸을 맨 아래로 스크롤해도 `ontology-yaml-toolbar` 와 `ontology-preview` 가 화면 안에 있다(`toBeInViewport`). 틀린 키를 넣고 「저장 전에 확인」 하면 `ontology-preview-error-line` 을 눌러 편집칸의 선택 위치가 그 줄이다. 저장까지 한다. `/ontology?view=form` 을 열면 주소가 `view=yaml` 이다.
- 새 테스트: ADMIN 의 연동 토큰(「조회와 기록」)으로 `POST /api/v1/proposals` 에 `ONTOLOGY_CHANGE` 를 올린 뒤 「제안」 에서 `proposal-ontology-preview` 를 보고 승인하면 `ontology-version` 이 하나 오른다. 스크린샷 `10-ontology-change-proposal`.
- 연동 화면 테스트: `integrations-install` 이 보이고 `tokens-advanced` 가 접혀 있으며, 펼친 뒤 지금의 토큰 발급 흐름이 된다.
- `mobile.spec.ts`: `m-ontology-form` 을 YAML 편집기 스크린샷 `m-ontology-yaml` 로 바꾸고 결과 칸이 `data-layout="below"` 인지 본다. 연동 화면의 설치 안내 스크린샷 `m-integrations`.
- e2e 실행은 통합 검증에서 한 번만 한다. 이 phase 에서는 타입 검사로 문법만 본다.
- 테스트 지원 파일(`api/src/test/kotlin/dev/fos/workbench/support/`, `web/e2e/support.ts` 의 기존 함수 시그니처), `web/playwright.config.ts`, `compose*.yml` 은 고치지 않는다. 테스트 구조를 바꾸는 다른 plan 이 나란히 돈다.

## 검증

```bash
bash scripts/tests/test_scripts.sh
python3 scripts/tests/test_plugin.py
cd web && npm run typecheck && npx playwright test --list e2e/workbench.spec.ts e2e/mobile.spec.ts
```

모두 종료 코드 0. `playwright test --list` 는 테스트를 실행하지 않고 목록만 읽어 spec 파일의 문법과 가져오기를 확인한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `plugin/skills/ontology-change/SKILL.md` | 신규 |
| `plugin/skills/ontology-record/SKILL.md` | 수정 |
| `plugin/skills/ontology-start/SKILL.md` | 수정 |
| `plugin/README.md` | 수정 |
| `plugin/.codex-plugin/plugin.json` | 수정 |
| `plugin/.claude-plugin/plugin.json` | 수정 |
| `.claude-plugin/marketplace.json` | 수정 |
| `scripts/tests/test_plugin.py` | 수정 |
| `.github/workflows/workbench-image.yml` | 수정 |
| `scripts/tests/test_scripts.sh` | 수정 |
| `web/e2e/workbench.spec.ts` | 수정 |
| `web/e2e/mobile.spec.ts` | 수정 |
| `web/e2e/support.ts` | 수정 |
