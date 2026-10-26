# 원격 검증

| 선행 조건 | 시점 | 실행 위치 | 명령 | 기대값 |
|---|---|---|---|---|
| 없음 | PR 전 | 로컬 e2e Compose 스택(`127.0.0.1:8081`, 가짜 OIDC) | `claude mcp add --transport http valuation-ontology-local http://127.0.0.1:8081/mcp` 뒤 `/mcp` 에서 로그인해 가짜 OIDC 와 동의 화면을 거친 다음 `get_connection` 을 부른다. 끝나면 `claude mcp remove valuation-ontology-local` | OAuth 동의 뒤 도구 결과에 `connection.kind == "OAUTH"` 가 나온다. 안 되면 원인을 PR 본문에 적는다 |
| 없음 | PR 전 | 로컬 e2e Compose 스택, 임시 `CODEX_HOME` | `codex mcp add valuation-ontology-local --url http://127.0.0.1:8081/mcp` 와 `codex mcp login valuation-ontology-local` 뒤 Codex 에서 `get_connection` 을 부른다 | 로그인 뒤 도구 결과가 나온다. 안 되면 원인을 PR 본문에 적는다 |
| 머지 | PR 뒤 | 운영 공개 주소, 읽기 전용 | `docs/deployment.md` 「원격 MCP 확인」 의 세 `curl` | 메타데이터의 `resource`, `issuer` 가 `https://` 공개 origin 이고, 토큰 없는 `POST /mcp` 가 `401` 과 `WWW-Authenticate` 다 |
| 배포 | PR 뒤 | 사용자의 Claude Code | `/plugin marketplace add jon890/fos-valuation-ontology`, `/plugin install valuation-ontology@fos-valuation-ontology` 뒤 「가치투자 온톨로지 연결 확인해 줘」 | 브라우저 로그인과 「연결 허용」(조회만) 뒤 연결 확인 결과가 나온다. 확인 뒤 웹의 「연결된 앱」 에서 끊는다 |
