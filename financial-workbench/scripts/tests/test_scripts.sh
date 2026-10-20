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

exit $failed
