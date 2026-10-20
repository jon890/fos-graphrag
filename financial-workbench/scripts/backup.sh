#!/usr/bin/env bash
# Neo4j Community 오프라인 덤프. 덤프하는 동안 neo4j 와 app 을 멈춘다.
# 결과: backups/neo4j-YYYYMMDD-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."

compose=(docker compose -f "${COMPOSE_FILE_PATH:-compose.yml}")
stamp="$(date +%Y%m%d-%H%M%S)"
work="backups/tmp-$stamp"
mkdir -p "$work"
chmod 777 "$work"

restart() {
  "${compose[@]}" start neo4j app >/dev/null
  "${compose[@]}" up -d --wait neo4j app >/dev/null
}

echo "app 과 neo4j 를 멈춘다"
"${compose[@]}" stop app neo4j
trap restart EXIT

"${compose[@]}" run --rm --no-deps -v "$PWD/$work:/backups" neo4j \
  neo4j-admin database dump neo4j --to-path=/backups

mv "$work/neo4j.dump" "backups/neo4j-$stamp.dump"
rmdir "$work"
echo "백업: backups/neo4j-$stamp.dump"
echo "neo4j 와 app 을 다시 시작한다"
