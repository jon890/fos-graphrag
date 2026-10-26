# orch 오버레이: fos-valuation-ontology

코어(`fos-skills` 의 `orch` 스킬)에 없는 이 저장소의 값과 절차만 적는다.

## 기준 브랜치와 지시서

- PR 의 base 는 `main` 이다. 머지 방식은 merge commit 이다.
- 공통 지시서는 `.orch/specs/spec-common.md`, 개별 지시서와 지시서 폴더(`--specs-dir`)는 `.orch/specs/` 다.
- 머지 뒤 마무리와 머지 큐 기본값은 `.orch/config.json` 이다. Run id 가 바뀌면 그 파일의 `finish.run` 을 고친다.

## 검증 명령

코드(`api/`, `web/`, `scripts/`, `ontology/`, Compose, Dockerfile, workflow)를 고친 PR 은 아래를 모두 통과해야 머지한다. 오래 걸리므로 백그라운드로 돌린다.

- 서버: `cd api && ./gradlew test --rerun`(Gradle 이 이전 결과를 재사용하지 않게 `--rerun` 을 붙인다)
- 웹: `cd web && npm run typecheck && npm test && npm run build`
- 스크립트: `bash scripts/tests/test_scripts.sh`(저장소 루트에서)
- 브라우저: `COMPOSE_PROJECT_NAME=<작업 이름>-verify NEO4J_PASSWORD=e2e-local-password COMPOSE_FILE=compose.yml:compose.e2e.yml` 로 `docker compose up -d --build --wait` 한 뒤 `cd web && WORKBENCH_URL=http://127.0.0.1:8081 E2E_ADMIN_NAME=관리자 npm run test:e2e -- e2e/workbench.spec.ts e2e/mobile.spec.ts --project=chromium --project=mobile`, 끝나면 그 스택만 `docker compose down -v`. 스크린샷은 `web/test-results/screenshots/` 에 있고 직접 열어 본다.

## 배포

**머지한 뒤에는 묻지 않고 운영에 배포한다(사용자 지시 2026-10-23).**
머지 큐(`merge-with-finish.py`)가 `.orch/config.json` 의 `queue.after_merged` 로 `scripts/deploy-prod.sh` 를 부른다. 문서만 머지했으면(`docs_glob`) 배포하지 않는다.
머지 큐를 쓰지 않고 머지했으면 그 스크립트를 직접 부른다. 배포 결과(이미지 실행 id, health)는 사용자에게 알린다.

- API 를 다시 띄우면 로그인 세션이 사라져 사용자는 다시 로그인해야 한다. 배포한 뒤 알릴 때 함께 적는다.
- 운영 데이터 백업은 `ssh homeserver 'cd /home/bifos/apps/fos-home-infra && scripts/db/backup-financial-workbench.sh'` 다. 데이터 구조를 바꾸는 배포 앞에서 받을지는 그 작업의 계획에서 정한다.
- 운영 데이터는 지우지 않는다. 잘못 만든 것은 보관한다.
