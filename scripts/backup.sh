#!/usr/bin/env bash
# Neo4j Community 오프라인 덤프. Community 의 neo4j-admin database dump 는 데이터베이스가 깨끗하게 멈춰 있어야 한다.
# 멈추고, 덤프하고, 다시 올리는 순서를 이 스크립트 하나로 한다. 결과: backups/neo4j-YYYYMMDD-HHMMSS.dump (권한 600)
# 덤프가 실패해도 데이터는 바뀌지 않았으므로 서비스를 다시 올린다.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib.sh

prepare_backup_dir
file="backups/neo4j-$(date +%Y%m%d-%H%M%S).dump"

trap on_exit EXIT
trap 'exit 130' INT TERM
RESTART_ON_EXIT=1
stop_services
dump_to_file "$file"
echo "백업: $file"
