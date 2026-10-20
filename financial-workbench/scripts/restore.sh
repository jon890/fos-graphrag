#!/usr/bin/env bash
# 덤프 파일로 Neo4j 를 복원한다. 서비스를 한 번만 멈추고, 그 상태에서 현재 데이터를 먼저 덤프한 뒤 덮어쓴다.
# 사용: scripts/restore.sh <덤프 파일>   (어느 디렉터리에서 실행해도 된다)
set -euo pipefail

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "사용법: $0 <덤프 파일>" >&2
  exit 2
fi
# cd 하기 전에 인자를 절대 경로로 바꾼다
source_dump="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$(dirname "$0")/.."
source scripts/lib.sh

prepare_backup_dir
safety="backups/neo4j-before-restore-$(date +%Y%m%d-%H%M%S).dump"

stop_services
trap 'echo "neo4j 와 app 을 다시 시작한다"; start_services' EXIT

echo "덮어쓰기 전에 현재 상태를 덤프한다"
dump_to_file "$safety"
load_from_file "$source_dump"
echo "복원 전 상태: $safety"
echo "복원: $1"
