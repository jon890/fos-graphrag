# 원격 검증

| 선행 조건 | 시점 | 실행 위치 | 명령 | 기대값 |
|---|---|---|---|---|
| push | PR 뒤 | GitHub Actions | `gh pr checks <PR 번호> --watch` | 테스트 workflow 의 `api`, `web`, `scripts` job 이 통과한다(workflow 를 두기로 했을 때) |
| 배포 | PR 뒤 | 로컬, 운영 공개 주소에 읽기 요청만 | `node scripts/smoke-prod.ts https://<공개 origin>` | 종료 코드 0, 다섯 검사 모두 `통과:` |
