## ADR-004: 세션 로그인과 쿠키 CSRF 토큰을 쓰고 웹과 API 를 같은 origin 으로 제공한다

- **status**: `superseded`
- **대체된 부분**: 비밀번호 로그인, BCrypt 저장, `user-add` 명령은 [ADR-006](006-google-oidc-allowlist-roles.md) 이 Google OpenID Connect 와 허용 사용자 목록으로 대체했다. 서버 세션, 쿠키 CSRF, 같은 origin 제공은 그대로 유효하다.
- **결정**: (당시의 맥락이다) Spring Security 서버 세션으로 로그인한다. CSRF 는 `XSRF-TOKEN` 쿠키와 `X-XSRF-TOKEN` 헤더로 확인한다. 사용자는 Neo4j `:User` 노드에 BCrypt 해시로 저장하고 `user-add` 명령으로만 만든다. 운영에서는 API 컨테이너가 빌드된 웹 파일을 함께 제공하고, 개발에서는 Vite proxy 로 같은 origin 을 흉내 낸다.
- **맥락**: 사용자는 두 명이고 VPN 안에서 접속한다. 별도 인증 서버나 RDB 를 두지 않는다. 같은 origin 이면 CORS 설정이 필요 없고 SameSite 쿠키로 다른 사이트에서 오는 요청을 막는다.
- **대안 기각**:
  - JWT 를 브라우저 저장소에 보관: XSS 한 번에 토큰이 새고, 로그아웃과 만료 관리를 직접 해야 한다.
  - HTTP Basic: 브라우저가 자격증명을 기억해 로그아웃이 어렵고 CSRF 방어가 따로 필요하다.
  - Nginx reverse proxy 컨테이너 추가: 같은 origin 을 만들 수 있지만 두 사람 규모에서 컨테이너 하나를 더 운영할 이유가 없다.
- **결과**:
  - 얻는 것: 토큰 저장 코드가 없다. CORS 설정이 없다.
  - 감당할 것: 세션이 API 프로세스 메모리에 있어 API 를 재시작하면 다시 로그인해야 한다. 여러 인스턴스로 늘리면 세션 저장소가 필요하다. FOS 도구가 API 를 부를 때는 세션 대신 별도 인증을 정해야 한다.
