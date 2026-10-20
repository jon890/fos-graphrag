#!/usr/bin/env bash
# 덤프 파일로 Neo4j 를 복원한다. 현재 데이터를 덮어쓰므로 먼저 현재 상태를 한 번 더 덤프한다.
# 사용: scripts/restore.sh backups/neo4j-YYYYMMDD-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "사용법: $0 <덤프 파일>" >&2
  exit 2
fi
source_dump="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"

echo "덮어쓰기 전에 현재 상태를 백업한다"
"$(dirname "$0")/backup.sh"

compose=(docker compose -f "${COMPOSE_FILE_PATH:-compose.yml}")
stage="backups/restore"
mkdir -p "$stage"
chmod 777 "$stage"
# load 는 디렉터리에서 <데이터베이스 이름>.dump 를 찾는다
cp "$source_dump" "$stage/neo4j.dump"
chmod 644 "$stage/neo4j.dump"

restart() {
  "${compose[@]}" start neo4j app >/dev/null
  "${compose[@]}" up -d --wait neo4j app >/dev/null
}

echo "app 과 neo4j 를 멈춘다"
"${compose[@]}" stop app neo4j
trap restart EXIT

"${compose[@]}" run --rm --no-deps -v "$PWD/$stage:/backups" neo4j \
  neo4j-admin database load neo4j --from-path=/backups --overwrite-destination=true

rm -f "$stage/neo4j.dump"
echo "복원: $1"
echo "neo4j 와 app 을 다시 시작한다"
