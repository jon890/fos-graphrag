# Phase 06. Google 로그인, 역할 권한, 공개 배포 대비

**Execution profile**: deep
**Status**: completed

## 목표

비밀번호 로그인을 Google OpenID Connect 와 허용 사용자 목록으로 바꾸고 `VIEWER`, `EDITOR`, `ADMIN` 역할을 서버에서 집행한다.
TLS 를 끝내는 reverse proxy 뒤 공개 HTTPS 경로에 둘 수 있게 보안 헤더, 쿠키, 컨테이너 설정, 이미지 workflow 를 더한다.

**범위 외**: 실제 홈서버 배포, 실제 Google client 로 로그인 확인, workflow 실행.

## 컨텍스트

- 계약은 `financial-workbench/docs/api-contract.md` 의 「인증과 CSRF」, 「역할」, 「사용자 관리」 절이다.
- 사용자 모델은 `financial-workbench/docs/data-schema.md` 의 「사용자」 절이다.
- 배포 규칙은 `financial-workbench/docs/deployment.md` 다.

**근거 문서**: `financial-workbench/docs/adr/006-google-oidc-allowlist-roles.md`, `financial-workbench/docs/flow.md` 의 「로그인」 절

## 의도 메모

- 가짜 OIDC 공급자는 `mockoidc` 프로필과 `compose.e2e.yml`, `compose.dev.yml` 에만 둔다. 운영 Compose 와 `prod` 프로필에는 없다.
- 역할은 세션에 고정하지 않고 요청마다 Neo4j 에서 다시 읽는다. 비활성화가 바로 반영된다.
- Neo4j 의 `cap_drop` 뒤에는 `KILL` 을 되살린다. 없으면 깨끗한 종료가 안 되어 오프라인 dump 가 거부된다.

## 작업 항목

### 1. 인증과 역할

`auth/AllowlistOidcUserService.kt`, `auth/CurrentUserFilter.kt`, `auth/BootstrapAdmin.kt`, `users/UserAdminService.kt`, `config/SecurityConfig.kt`.

### 2. 테스트 (실제 Neo4j 와 가짜 OIDC 컨테이너)

- `api/src/test/kotlin/dev/fos/workbench/AuthIntegrationTest.kt`: 허용 목록 밖, 확인되지 않은 이메일, 다른 sub 거절. 보안 헤더. 오류 형식.
- `api/src/test/kotlin/dev/fos/workbench/RoleAndUserAdminIntegrationTest.kt`: 역할별 허용과 거절, 비활성화 즉시 차단, 마지막 ADMIN 보호.

### 3. 배포

`financial-workbench/compose.yml`, `financial-workbench/compose.e2e.yml`, `financial-workbench/scripts/check-compose.sh`, `.github/workflows/workbench-image.yml`.

## 검증

```bash
cd financial-workbench/api && ./gradlew test
cd financial-workbench/web && npm ci && npm run typecheck && npm test && npm run build
bash financial-workbench/scripts/tests/test_scripts.sh
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/auth/AllowlistOidcUserService.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/auth/CurrentUserFilter.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/auth/BootstrapAdmin.kt` | 신규 |
| `financial-workbench/api/src/main/kotlin/dev/fos/workbench/users/UserAdminService.kt` | 신규 |
| `financial-workbench/api/src/test/kotlin/dev/fos/workbench/RoleAndUserAdminIntegrationTest.kt` | 신규 |
| `financial-workbench/compose.e2e.yml` | 신규 |
| `.github/workflows/workbench-image.yml` | 신규 |
