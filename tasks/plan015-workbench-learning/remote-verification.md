# 원격 검증

| 선행 조건 | 시점 | 실행 위치 | 명령 | 기대값 |
|---|---|---|---|---|
| 배포 | PR 뒤 | 운영 홈서버, 사람이 확인 | `docker compose logs app` 에서 시작 로그 확인 | `초기 데이터 learning-concepts-2026-10 를 적용하지 못했다` 와 `USES_CONCEPT` 가 저장소 YAML 에만 있다는 `warn` 이 남는다 |
| 배포 | PR 뒤 | 운영 화면, ADMIN | 더보기 「온톨로지 상세」 의 「YAML 로 편집」 에 저장소 YAML 의 `USES_CONCEPT` 정의를 더하고 「저장 전에 확인」 뒤 저장 | 바뀐 점이 `relationshipTypes.USES_CONCEPT` 더함 하나이고 영향 목록이 비며 새 버전이 저장된다 |
| 배포 | PR 뒤 | 운영 홈서버, 사람이 실행 | `docker compose restart app` 뒤 `docker compose logs app` | `초기 데이터 적용: 1개 파일` 이 남고 health 가 `UP` 이다. 로그인 세션이 사라진다 |
| 배포 | PR 뒤 | 운영 화면 | 개념 지도와 「FLNC 간이 DCF (Valley AI 화면)」 상세, 「FLNC 첫 매수」 의 근거 따라가기, 공부 탭 | 개념 개수가 0 이 아니고, 상세에 개념 칩 「DCF」 가 보이고, 근거 따라가기가 변화까지 단계를 보이며, 공부 탭이 열린다 |
