#!/usr/bin/env bash
# Neo4j Community 오프라인 덤프. Community 의 neo4j-admin database dump 는 데이터베이스가 멈춰 있어야 한다.
# 멈추고, 덤프하고, 다시 올리는 순서를 이 스크립트 하나로 한다. 결과: backups/neo4j-YYYYMMDD-HHMMSS.dump
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh

stamp="$(date +%Y%m%d-%H%M%S)"
work="$PWD/backups/tmp-$stamp"

stop_services
trap 'echo "neo4j 와 app 을 다시 시작한다"; start_services' EXIT
dump_to "$work"
mv "$work/neo4j.dump" "backups/neo4j-$stamp.dump"
rmdir "$work"
echo "백업: backups/neo4j-$stamp.dump"
