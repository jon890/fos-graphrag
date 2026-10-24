# 원격 검증

머지하면 머지 큐가 `financial-workbench/scripts/deploy-prod.sh` 로 운영에 배포한다. 배포한 이미지는 DB 에 이미 온톨로지 버전이 있어 새 저장소 YAML 의 타입을 쓰지 않고, 새 초기 데이터도 `warn` 과 함께 건너뛴다. 그래서 배포 직후 운영 데이터를 사용자 계정만 남기고 비운다(사용자 지시 2026-10-24. `.claude/orch-overlay.md` 의 「운영 데이터는 지우지 않는다」 의 예외). 백업은 받지 않는다. 같은 날 05:25 UTC 정기 백업 덤프가 `/opt/data/backup/financial-workbench/20261024T052505Z/` 에 있다.

| 선행 조건 | 시점 | 실행 위치 | 명령 | 기대값 |
|---|---|---|---|---|
| 배포 | PR 뒤 | 홈서버, 운영 데이터 삭제 | `ssh homeserver 'cd /home/bifos/apps/fos-home-infra/services/financial-workbench && docker compose stop financial-workbench && docker compose exec -T neo4j sh -c "cypher-shell -u neo4j -p \"\${NEO4J_AUTH#*/}\" \"MATCH (n) WHERE NOT n:User DETACH DELETE n\"" && docker compose start financial-workbench'` | 종료 코드 0 |
| 배포 | PR 뒤 | 공개 주소, 읽기 전용 | `curl -fsS https://graph.fosworld.co.kr/api/health` | `{"status":"UP"}` |
| 배포 | PR 뒤 | 홈서버, 읽기 전용 | `ssh homeserver 'docker exec financial-workbench-neo4j sh -c "cypher-shell -u neo4j -p \"\${NEO4J_AUTH#*/}\" --format plain \"MATCH (v:OntologyVersion) RETURN count(v) AS versions; MATCH (s:SeedRun) RETURN collect(s.key) AS seeds; MATCH (u:User) RETURN count(u) AS users; MATCH (d:Knowledge:Decision) RETURN count(d) AS decisions\""'` | `versions` 1, `seeds` 는 `investment-logic-2026-10` 하나, `users` 3, `decisions` 4 |
| 배포 | PR 뒤 | 홈서버, 읽기 전용 | `ssh homeserver 'docker logs --since 10m financial-workbench 2>&1 | grep "초기 데이터"'` | `초기 데이터 적용: 1개 파일` 이 있고 `적용하지 못했다`, `건너뛴다` 가 없다 |
| 배포 | PR 뒤 | 브라우저(사람) | `https://graph.fosworld.co.kr` 에 다시 로그인해 「FLNC 첫 매수」 를 열고 그래프의 이웃 확장을 두 번 누른다 | 종목, 기업, 병목 「데이터센터 전력 접속과 ESS 공급」, 변화가 차례로 보인다 |
