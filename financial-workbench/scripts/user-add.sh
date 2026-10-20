#!/usr/bin/env bash
# 워크벤치 계정을 만든다. 비밀번호는 WORKBENCH_USER_PASSWORD 환경변수로 넘긴다(12자 이상).
# 사용: WORKBENCH_USER_PASSWORD=... scripts/user-add.sh <username> <displayName> [compose 파일]
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -lt 2 ]; then
  echo "사용법: WORKBENCH_USER_PASSWORD=... $0 <username> <displayName> [compose 파일]" >&2
  exit 2
fi
: "${WORKBENCH_USER_PASSWORD:?WORKBENCH_USER_PASSWORD 를 설정한다}"
export WORKBENCH_USER_PASSWORD
docker compose -f "${3:-compose.yml}" run --rm --no-deps -e WORKBENCH_USER_PASSWORD app user-add "$1" "$2"
