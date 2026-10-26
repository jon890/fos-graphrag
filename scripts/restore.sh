#!/usr/bin/env bash
# 덤프 파일로 Neo4j 를 복원한다. 서비스를 한 번만 멈추고, 그 상태에서 현재 데이터를 먼저 덤프한 뒤 덮어쓴다.
# 사용: scripts/restore.sh [--skip-safety-dump] <덤프 파일>   (어느 디렉터리에서 실행해도 된다)
#
# 실패했을 때:
# - 덤프 파일 형식이 틀리면 서비스를 멈추기 전에 끝낸다.
# - 안전 덤프가 실패하면 아무것도 덮어쓰지 않았으므로 서비스를 다시 올린다.
# - load 가 실패하면 기존 DB 가 이미 지워졌거나 반쯤 바뀌었을 수 있어 neo4j 와 app 을 멈춘 채 둔다.
#   안전 덤프 경로와 되돌리는 명령을 출력한다. 되돌릴 때는 지울 DB 가 없을 수 있어 --skip-safety-dump 를 붙인다.
set -euo pipefail

skip_safety=0
if [ "${1:-}" = "--skip-safety-dump" ]; then
  skip_safety=1
  shift
fi
if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "사용법: $0 [--skip-safety-dump] <덤프 파일>" >&2
  exit 2
fi
# cd 하기 전에 인자를 절대 경로로 바꾼다
source_dump="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")/.."
here="$PWD"
source scripts/lib.sh

if ! is_dump "$source_dump"; then
  echo "Neo4j 5 덤프 형식이 아니다(DZV1 머리말이 없거나 1KiB 미만): $1. 서비스를 멈추지 않고 끝낸다" >&2
  exit 2
fi

prepare_backup_dir
safety="backups/neo4j-before-restore-$(date +%Y%m%d-%H%M%S).dump"
[ "$skip_safety" = 1 ] || echo "안전 덤프 경로: $here/$safety"

trap on_exit EXIT
trap 'exit 130' INT TERM
RESTART_ON_EXIT=1
stop_services

if [ "$skip_safety" = 1 ]; then
  echo "안전 덤프를 건너뛴다(--skip-safety-dump). 현재 DB 는 되돌릴 수 없다"
else
  echo "덮어쓰기 전에 현재 상태를 덤프한다"
  if ! dump_to_file "$safety"; then
    echo "안전 덤프에 실패했다. 아무것도 덮어쓰지 않았다" >&2
    exit 1
  fi
fi

if ! load_from_file "$source_dump"; then
  RESTART_ON_EXIT=0
  if [ "$skip_safety" = 1 ]; then
    echo "복원(load)에 실패했다. neo4j 와 app 을 멈춘 채 둔다. 다른 덤프로 다시 복원한다" >&2
  else
    cat >&2 <<MSG
복원(load)에 실패했다. 기존 DB 가 지워졌거나 반쯤 바뀌었을 수 있어 neo4j 와 app 을 멈춘 채 둔다.
복원 전 상태: $here/$safety
되돌리려면:   $here/scripts/restore.sh --skip-safety-dump $here/$safety
MSG
  fi
  exit 1
fi
[ "$skip_safety" = 1 ] || echo "복원 전 상태: $here/$safety"
echo "복원: $1"
