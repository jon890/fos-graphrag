#!/usr/bin/env bash
# 배포 스크립트의 문법과 Compose 설정 규칙을 검사한다. 실패가 하나라도 있으면 종료 코드 1 이다.
set -uo pipefail
cd "$(dirname "$0")/../.."

failed=0
for f in scripts/*.sh; do
  if bash -n "$f"; then echo "문법 통과: $f"; else echo "문법 오류: $f"; failed=1; fi
done

if bash scripts/check-compose.sh; then :; else failed=1; fi

# 비밀번호가 비어 있으면 운영 Compose 설정이 렌더링되지 않아야 한다
if NEO4J_PASSWORD= docker compose -f compose.yml config --quiet 2>/dev/null; then
  echo "위반: NEO4J_PASSWORD 가 비어도 운영 Compose 가 렌더링된다"
  failed=1
else
  echo "통과: NEO4J_PASSWORD 없이 운영 Compose 가 실패한다"
fi

# 공급망과 권한 규칙. 위반이면 실패로 센다
check() {
  local message="$1"; shift
  if "$@"; then echo "통과: $message"; else echo "위반: $message"; failed=1; fi
}
check "백업 스크립트가 chmod 777 을 쓰지 않는다" bash -c '! grep -rn "chmod 777" scripts/*.sh'
check "Dockerfile 의 모든 FROM 이 digest 로 고정됐다" bash -c '! grep -E "^FROM " Dockerfile | grep -v "@sha256:"'
check "Gradle Wrapper 가 배포본 sha256 을 확인한다" grep -q '^distributionSha256Sum=[0-9a-f]\{64\}$' api/gradle/wrapper/gradle-wrapper.properties
check "이미지 workflow 는 main 에서만 publish 한다" grep -q "if: github.ref == 'refs/heads/main'" .github/workflows/workbench-image.yml
check "이미지에 제목과 설명 라벨이 있다" bash -c 'grep -q "org.opencontainers.image.title=" .github/workflows/workbench-image.yml && grep -q "org.opencontainers.image.description=" .github/workflows/workbench-image.yml'
check "e2e override 는 prod 프로필을 켜지 않는다" bash -c '! grep -E "SPRING_PROFILES_ACTIVE:.*prod" compose.e2e.yml'
check "운영 Neo4j 에 트랜잭션과 잠금 대기 상한이 있다" bash -c 'grep -q NEO4J_db_transaction_timeout compose.yml && grep -q NEO4J_db_lock_acquisition_timeout compose.yml'

# 백업과 복원의 실패 경로(중단, load 실패)를 가짜 docker 로 검사한다
if bash scripts/tests/test_backup_failures.sh; then :; else failed=1; fi

# 플러그인 파일 형식과, 틀린 값을 검사가 잡는지
if python3 scripts/tests/test_plugin.py; then :; else failed=1; fi
if python3 scripts/tests/test_plugin.py --self-test; then :; else failed=1; fi

exit $failed
