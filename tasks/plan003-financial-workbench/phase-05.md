# Phase 05. Compose, 백업, 브라우저 검증, 문서

**Execution profile**: standard

## 목표

운영 Compose 와 개발 Compose, 이미지, 백업과 복원과 사용자 생성 스크립트, README 를 만든다.
운영 Compose 스택을 상대로 브라우저 테스트와 재시작, 백업과 복원을 실제로 실행한다.

**범위 외**: 실제 홈서버 배포.

## 컨텍스트

- 배포 절차와 변수는 `financial-workbench/docs/deployment.md` 다.
- `python-graphrag/compose.yml` 은 7475, 7688 을 쓴다. 개발 Compose 는 7476, 7689 를 쓴다.
- 운영 Compose 의 프로젝트 이름은 `fos-workbench`, 개발은 `fos-workbench-dev` 다.

**근거 문서**: `financial-workbench/docs/deployment.md`, `financial-workbench/docs/adr/004-session-csrf-same-origin.md`

## 의도 메모

- `docker compose down -v` 를 쓰지 않는다. 재시작 검증은 `down` 과 `up` 이다.
- 운영 Compose 에서 neo4j 서비스에 `ports` 를 두지 않는다. `docker compose config` 출력으로 확인한다.
- 백업은 neo4j 를 멈춘 뒤 `neo4j-admin database dump` 로 한다.

## 작업 항목

### 1. 이미지와 Compose

`financial-workbench/Dockerfile`, `.dockerignore`, `compose.yml`, `compose.dev.yml`, `.env.example`, `.gitignore`.

### 2. 스크립트

`scripts/backup.sh`, `scripts/restore.sh`, `scripts/user-add.sh`, `financial-workbench/scripts/check-compose.sh`(운영 Compose 의 neo4j 에 `ports` 가 없고, 개발 Compose 의 포트가 `127.0.0.1` 로 시작하는지 `docker compose config` 로 검사, 위반이면 종료 코드 1).

### 3. 스크립트 테스트

`financial-workbench/scripts/tests/test_scripts.sh`: 모든 스크립트를 `bash -n` 으로 문법 검사하고, `check-compose.sh` 를 실행해 종료 코드 0 을 확인한다. `NEO4J_PASSWORD` 가 빈 운영 Compose 설정이 실패하는지도 확인한다.

### 4. 문서

`financial-workbench/README.md`, 저장소 루트 `README.md` 의 프로젝트 목록과 검증 절.

### 5. 실행 검증

운영 스택을 올리고 사용자 둘을 만든 뒤 Playwright 흐름 1~6, `down` 과 `up` 뒤 데이터 유지, 백업과 복원을 실행한다.

## 검증

```bash
bash financial-workbench/scripts/check-compose.sh
bash financial-workbench/scripts/tests/test_scripts.sh
cd financial-workbench/api && ./gradlew test
cd financial-workbench/web && npm test
```

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `financial-workbench/Dockerfile` | 신규 |
| `financial-workbench/.dockerignore` | 신규 |
| `financial-workbench/compose.yml` | 신규 |
| `financial-workbench/compose.dev.yml` | 신규 |
| `financial-workbench/.env.example` | 신규 |
| `financial-workbench/.gitignore` | 신규 |
| `financial-workbench/scripts/backup.sh` | 신규 |
| `financial-workbench/scripts/restore.sh` | 신규 |
| `financial-workbench/scripts/user-add.sh` | 신규 |
| `financial-workbench/scripts/check-compose.sh` | 신규 |
| `financial-workbench/scripts/tests/test_scripts.sh` | 신규 |
| `financial-workbench/README.md` | 신규 |
| `README.md` | 수정 |
| `financial-workbench/docs/*.md` | 수정 |
