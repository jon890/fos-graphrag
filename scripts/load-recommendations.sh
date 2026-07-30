#!/bin/sh

set -eu

DUMP_URL="https://raw.githubusercontent.com/neo4j-graph-examples/recommendations/f5a3f87b9fa73461750eef564ce8b81f304d940b/data/recommendations-5.26.dump"
DUMP_SHA256="0092330a0a72ad7bd9647471d4e0fc4b0a1c819302854b951b48fde67af4d71d"

if [ "$#" -ne 1 ] || [ "$1" != "--force" ]; then
  echo "기존 neo4j 데이터베이스를 교체하려면 --force를 지정하세요." >&2
  exit 2
fi

PROJECT_ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
IMPORT_DIR=$(mktemp -d "$PROJECT_ROOT/.recommendations-import.XXXXXX")
NEO4J_STOPPED=0

cleanup() {
  if [ "$NEO4J_STOPPED" -eq 1 ]; then
    docker compose up -d neo4j >/dev/null 2>&1 || true
  fi
  case "$IMPORT_DIR" in
    "$PROJECT_ROOT"/.recommendations-import.*) rm -rf -- "$IMPORT_DIR" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

cd "$PROJECT_ROOT"
docker compose config --quiet

echo "공식 영화 추천 데이터셋을 내려받습니다."
curl --fail --location --silent --show-error "$DUMP_URL" --output "$IMPORT_DIR/neo4j.dump"

ACTUAL_SHA256=$(shasum -a 256 "$IMPORT_DIR/neo4j.dump" | awk '{print $1}')
if [ "$ACTUAL_SHA256" != "$DUMP_SHA256" ]; then
  echo "덤프 SHA-256이 기대값과 다릅니다." >&2
  exit 1
fi

docker compose up -d --wait neo4j
NEO4J_CONTAINER=$(docker compose ps -q neo4j)
DATA_VOLUME=$(docker inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' \
  "$NEO4J_CONTAINER")
if [ -z "$DATA_VOLUME" ]; then
  echo "실행 중인 neo4j 서비스의 /data 볼륨을 찾지 못했습니다." >&2
  exit 1
fi
docker volume inspect "$DATA_VOLUME" >/dev/null
docker compose stop neo4j
NEO4J_STOPPED=1

if ! docker run --rm \
  -v "$DATA_VOLUME:/data" \
  -v "$IMPORT_DIR:/backups:ro" \
  neo4j:5.26 \
  neo4j-admin database load neo4j \
  --from-path=/backups \
  --overwrite-destination=true; then
  exit 1
fi

docker compose up -d --wait neo4j
NEO4J_STOPPED=0
uv run graphrag-check-movies
