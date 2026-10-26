# Phase 05. Claude Code·Codex 플러그인과 비개발자용 스킬

**Execution profile**: standard

## 목표

친구가 Claude Code 에서 두 줄로 설치하고, 스킬의 안내만 따라 로그인과 첫 조회까지 가게 하는 `plugin/` 과 저장소 루트 마켓플레이스를 만든다. Codex 의 설치 방법을 실제로 확인해 문서에 적는다.

**범위 외**: 서버와 화면(phase 01~04). 운영 서버에 붙는 확인은 머지 뒤의 일이다(원격 검증 목록).

## 컨텍스트

- 배치와 이름은 `docs/code-architecture.md` 의 「플러그인」 절이 소유한다: 마켓플레이스 이름 `fos-valuation-ontology`, 플러그인 이름 `valuation-ontology`, MCP 서버 이름 `valuation-ontology`, 스킬 `ontology-start`, `ontology-explore`, `ontology-record`.
- 도구 이름과 쓰임은 `docs/api-contract.md` 「원격 MCP(`/mcp`)」 의 도구 표다. 스킬은 이 표의 이름만 쓴다.
- 운영 공개 주소는 `scripts/deploy-prod.sh` 의 `HEALTH_URL` 의 origin 이다. `.mcp.json` 의 `url` 은 그 origin 에 `/mcp` 를 붙인 값이다. 근거는 `docs/adr/015-remote-mcp-oauth.md` 의 「결과」.
- Claude Code 형식: 플러그인 루트의 `.mcp.json` 은 `{"mcpServers": {"<이름>": {"type": "http", "url": "…"}}}` 이고, 마켓플레이스 `.claude-plugin/marketplace.json` 은 `name`, `owner.name`, `plugins[{name, source: "./plugin", description}]` 이다(https://code.claude.com/docs/en/plugin-marketplaces). 설치는 `/plugin marketplace add jon890/fos-valuation-ontology` 와 `/plugin install valuation-ontology@fos-valuation-ontology` 다. 로그인을 다시 시작하는 곳은 Claude Code 의 `/mcp` 화면이다.
- Codex 형식의 예는 `/Users/nhn/personal/fos-skills/.codex-plugin/plugin.json`(`name`, `description`, `author`, `homepage`, `repository`, `skills` 배열)과 `/Users/nhn/personal/fos-skills/docs/adr/007-codex-manifest-without-hooks.md` 다. 읽기만 한다. Codex 는 `.codex-plugin/plugin.json` 이 있으면 `.claude-plugin/plugin.json` 을 읽지 않는다. Codex 의 원격 MCP 는 `codex mcp add <이름> --url <주소>` 와 `codex mcp login <이름>` 이다(https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
- 스킬 문서 형식은 `/Users/nhn/.claude/references/skill-structure.md` 를 먼저 읽는다. 머리말은 `name`, `description` 이다.
- 친구는 개발자가 아니다. 스킬은 한국어 합니다체로 다음 할 일만 말하고, 명령줄이나 토큰 이야기를 꺼내지 않는다. 사라, 팔라는 권유를 하지 않는다.
- 스크립트 검사는 `scripts/tests/test_scripts.sh` 가 모은다. 새 검사는 Python 으로 쓴다(사용자 규칙).

**근거 문서**: `docs/code-architecture.md` 「플러그인」, `docs/api-contract.md` 「원격 MCP(`/mcp`)」, `docs/flow.md` 「앱 연결」, `docs/adr/015-remote-mcp-oauth.md`

## 의도 메모

- 도구 설명은 서버가 가진다. 스킬은 도구를 부르는 순서와 사람에게 하는 말만 담는다. 도구 설명을 스킬에 다시 적지 않는다.
- Codex 가 플러그인의 MCP 설정을 어떤 키로 읽는지는 2026-10-26 조사로 확정하지 못했다. 이 phase 에서 임시 `CODEX_HOME` 으로 실제로 설치해 보고, 되는 방식만 README 에 적는다. 안 되면 `codex mcp add` 로 직접 더하는 방법을 적고 그 사실을 PR 본문에 남긴다.

## 작업 항목

### 1. 마켓플레이스와 플러그인 정보

- `.claude-plugin/marketplace.json`(저장소 루트): 이름, 주인 `jon890`, 플러그인 하나(`valuation-ontology`, `./plugin`, 한국어 설명).
- `plugin/.claude-plugin/plugin.json`: `name`, `description`, `author`, `homepage`, `repository`(`https://github.com/jon890/fos-valuation-ontology`).
- `plugin/.codex-plugin/plugin.json`: 같은 `name` 과 설명, `skills: ["./skills/ontology-start", "./skills/ontology-explore", "./skills/ontology-record"]`. MCP 설정을 가리키는 키는 아래 3 의 확인 결과로 정한다. `version` 은 넣지 않는다(fos-skills ADR-007 의 측정).
- `plugin/.mcp.json`: `valuation-ontology` 서버, `type: "http"`, `url` 은 운영 origin 의 `/mcp`.

### 2. 스킬

- `plugin/skills/ontology-start/SKILL.md`(시작하기): `get_connection` 을 부른다. 연결되면 표시 이름과 범위를 알리고 예시 질문 셋(「안전마진이 뭐야」, 「FLNC 투자 근거 보여줘」, 「내 공부 목록 보여줘」)을 보인다. 연결이 안 됐으면(도구가 인증을 요구하거나 실패) 「브라우저가 열리면 Google 로 로그인하고 『연결 허용』 을 누르세요」 만 말한다. 브라우저가 열리지 않으면 Claude Code 는 `/mcp` 화면에서 `valuation-ontology` 를 골라 로그인, Codex 는 3 에서 확인한 방법으로 다시 시작하라고 그 도구에 맞게 안내한다. 「조회만」 으로 연결해 쓰기가 막히면 「더보기 → 연동」 에서 연결을 끊고 다시 로그인해 「조회와 기록」 을 고르라고 안내한다.
- `plugin/skills/ontology-explore/SKILL.md`(개념과 근거 찾기): 「안전마진이 뭐야」, 「FLNC 투자 근거 보여줘」 같은 질문에 `search_nodes` → `get_node` → `trace_node` → 이어진 개념(`get_node` 의 `concepts`, 필요하면 `get_neighborhood`) 순으로 부른다. 종목 코드면 `lookup_security` 를 먼저 쓴다. 답에는 근거 문서 제목과 주소, 주장의 검토 상태(검토 완료, 검토 전)를 붙이고 잘린 결과(`...Truncated`)면 그렇다고 말한다.
- `plugin/skills/ontology-record/SKILL.md`(기록과 제안): 투자 결정, 근거 잇기, 공부 메모를 `submit_proposals` 로 올리고 「워크벤치의 더보기 → 제안에서 승인해야 반영됩니다」 라고 안내한다. 체결은 사용자가 준 체결만 `record_trades` 로 넣고 나만 본다고 알린다. 올리기 전에 무엇을 올릴지 한 문장으로 확인받는다. 사라, 팔라는 권유를 하지 않는다.
- 세 스킬의 `description` 은 사용자가 할 법한 말(「가치투자 온톨로지 연결」, 「투자 근거 보여줘」, 「제안 올려줘」)로 언제 쓰는지 밝힌다.

### 3. Codex 설치 방법 확인

사용자 설정을 건드리지 않게 임시 디렉터리를 `CODEX_HOME` 으로 쓴다.

```bash
export CODEX_HOME=$(mktemp -d)
codex plugin marketplace add "$PWD"            # 저장소 루트. 로컬 경로를 받지 않으면 --help 로 형식을 확인한다
codex plugin list
codex plugin add valuation-ontology@fos-valuation-ontology
codex mcp list                                  # valuation-ontology 가 보이는지
```

- 플러그인의 MCP 서버가 `codex mcp list` 에 보이면 그 방식(필요하면 `.codex-plugin/plugin.json` 에 MCP 설정 파일을 가리키는 키)을 확정한다. 보이지 않으면 README 의 Codex 절에 `codex mcp add valuation-ontology --url <운영 origin>/mcp` 와 `codex mcp login valuation-ontology` 를 적는다.
- GitHub 원격 설치 형식(`codex plugin marketplace add jon890/fos-valuation-ontology`)은 `--help` 로 확인해 README 에 적는다. 이 저장소가 머지되기 전에는 원격 설치를 실행하지 않는다.
- 확인한 명령과 결과를 PR 본문 초안에 쓸 수 있게 `/Users/nhn/personal/fos-graphrag/.orch/evidence/plan019-codex-plugin.md` 에 적는다(저장소 밖이라 커밋하지 않는다).

### 4. 안내 문서

- `plugin/README.md`: 비개발자용. Claude Code 설치(두 줄), 처음 쓰기(「가치투자 온톨로지 연결해 줘」 → 브라우저 → Google 로그인 → 「연결 허용」 → 앱으로 돌아옴), Codex 설치(3 의 결과), 연결 끊기(웹의 더보기 → 연동 → 연결된 앱), 막혔을 때(브라우저가 안 열림, 「접근 권한이 없습니다」 는 관리자에게 Gmail 추가를 부탁). 화면 단계마다 한 줄씩 쓴다.
- 루트 `README.md`: 「구성」 표에 `plugin/`, `.claude-plugin/marketplace.json` 줄. 「실행」 아래에 Claude Code·Codex 로 쓰는 짧은 안내와 `plugin/README.md` 링크. 「저장소는 공개라서 운영 주소 … 적지 않는다」 문장에 공개 주소의 예외(`scripts/deploy-prod.sh`, `plugin/.mcp.json`)를 덧붙인다. Hermes 문단의 「연동 토큰」 메뉴 이름을 「연동」 으로 고친다.

### 5. 이 phase 를 검증하는 `scripts/tests/test_plugin.py`

Python 표준 라이브러리만 쓴다. 저장소 루트를 스크립트 위치로 찾는다. 실패하면 이유를 한 줄씩 찍고 종료 코드 1.

- 마켓플레이스와 두 플러그인 정보, `.mcp.json` 이 JSON 으로 읽힌다.
- 마켓플레이스의 각 `source` 가 저장소 안의 디렉터리이고 그 안에 `.claude-plugin/plugin.json` 이 있으며 `name` 이 마켓플레이스 항목의 `name` 과 같다. `.codex-plugin/plugin.json` 의 `name` 도 같다.
- `.codex-plugin/plugin.json` 의 `skills` 의 각 경로에 `SKILL.md` 가 있고, `plugin/skills/*/` 의 모든 디렉터리가 `skills` 에 있다.
- 각 `SKILL.md` 의 머리말에 `name`(디렉터리 이름과 같다)과 비지 않은 `description` 이 있다.
- `.mcp.json` 의 각 서버가 `type == "http"` 이고 `url` 이 `https://` 로 시작해 `/mcp` 로 끝난다. 그 origin 이 `scripts/deploy-prod.sh` 의 `HEALTH_URL` origin 과 같다.
- 스킬 본문에 나오는 백틱 안의 도구 이름 꼴(`get_`, `search_`, `trace_`, `lookup_`, `list_`, `record_`, `submit_` 로 시작하는 snake_case)이 모두 `docs/api-contract.md` 「원격 MCP(`/mcp`)」 절의 도구 표 첫 칸에 있다. 표의 개수를 상수로 적지 않는다.
- 일부러 틀린 값을 넣은 임시 복사본으로 검사가 실패하는지 한 번 확인하는 `--self-test` 옵션을 둔다(임시 디렉터리에 `plugin/` 을 복사해 `.mcp.json` 의 `type` 을 바꾸고 검사가 1 을 내는지 본다).
- `scripts/tests/test_scripts.sh` 의 끝에 `python3 scripts/tests/test_plugin.py` 와 `python3 scripts/tests/test_plugin.py --self-test` 를 더해, 저장소의 스크립트 검사 명령 하나로 함께 돈다. 실패하면 그 스크립트도 실패해야 한다(그 파일의 실패 처리 방식을 따른다).

## 검증

```bash
python3 scripts/tests/test_plugin.py
python3 scripts/tests/test_plugin.py --self-test
bash scripts/tests/test_scripts.sh
claude plugin validate .
claude plugin validate plugin
```

기대값: 모두 종료 코드 0. `claude plugin validate` 가 경고만 내면 그 내용을 PR 본문에 적는다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.claude-plugin/marketplace.json` | 신규 |
| `plugin/.claude-plugin/plugin.json` | 신규 |
| `plugin/.codex-plugin/plugin.json` | 신규 |
| `plugin/.mcp.json` | 신규 |
| `plugin/skills/ontology-start/SKILL.md` | 신규 |
| `plugin/skills/ontology-explore/SKILL.md` | 신규 |
| `plugin/skills/ontology-record/SKILL.md` | 신규 |
| `plugin/README.md` | 신규 |
| `README.md` | 수정 |
| `scripts/tests/test_plugin.py` | 신규 |
| `scripts/tests/test_scripts.sh` | 수정 |
