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

stamp="$(date +%Y%m%d-%H%M%S)"
safety="$PWD/backups/tmp-before-restore-$stamp"
stage="$PWD/backups/restore"

stop_services
trap 'echo "neo4j 와 app 을 다시 시작한다"; start_services' EXIT

echo "덮어쓰기 전에 현재 상태를 덤프한다"
dump_to "$safety"
mv "$safety/neo4j.dump" "backups/neo4j-before-restore-$stamp.dump"
rmdir "$safety"

mkdir -p "$stage"
chmod 777 "$stage"
# load 는 디렉터리에서 <데이터베이스 이름>.dump 를 찾는다
cp "$source_dump" "$stage/neo4j.dump"
chmod 644 "$stage/neo4j.dump"
docker compose run --rm --no-deps -v "$stage:/backups" neo4j \
  neo4j-admin database load neo4j --from-path=/backups --overwrite-destination=true
rm -f "$stage/neo4j.dump"
echo "복원 전 상태: backups/neo4j-before-restore-$stamp.dump"
echo "복원: $1"
