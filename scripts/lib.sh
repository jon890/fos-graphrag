# backup.sh 와 restore.sh 가 함께 쓰는 함수. 직접 실행하지 않는다.
# Compose 파일은 docker compose 표준 환경변수 COMPOSE_FILE 로 고른다(여러 개면 콜론으로 잇는다). 비우면 compose.yml 이다.

# 종료 처리. backup.sh 와 restore.sh 는 서비스를 멈추기 전에 `trap on_exit EXIT` 와 `trap 'exit 130' INT TERM` 을 건다.
# - PARTIAL_FILE 이 남아 있으면 지운다. Ctrl-C 로 끝나도 반쯤 쓴 덤프가 남지 않는다.
# - RESTART_ON_EXIT 가 1 이면 neo4j 와 app 을 다시 올린다. load 가 실패한 뒤처럼 DB 상태를 믿을 수 없으면 0 으로 두고 멈춘 채 끝낸다.
PARTIAL_FILE=""
RESTART_ON_EXIT=0

on_exit() {
  local code=$?
  if [ -n "$PARTIAL_FILE" ] && [ -e "$PARTIAL_FILE" ]; then
    rm -f "$PARTIAL_FILE"
    echo "중단된 덤프 파일을 지웠다: $PARTIAL_FILE" >&2
  fi
  if [ "$RESTART_ON_EXIT" = "1" ]; then
    echo "neo4j 와 app 을 다시 시작한다"
    start_services || code=1
  fi
  exit "$code"
}

# 서비스를 다시 만들지 않고 시작만 한다. 설정이 달라져 컨테이너가 바뀌는 일을 막는다
start_services() {
  docker compose start neo4j app >/dev/null
  wait_healthy neo4j
  wait_healthy app
}

wait_healthy() {
  local service="$1" id status i
  id="$(docker compose ps -q "$service")"
  for i in $(seq 1 60); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null || echo missing)"
    [ "$status" = "healthy" ] && return 0
    sleep 2
  done
  echo "$service 가 healthy 가 되지 않았다: $status" >&2
  return 1
}

stop_services() {
  echo "app 과 neo4j 를 멈춘다. 이 동안 /api/health 는 응답하지 않고 쓰기는 모두 실패한다"
  docker compose stop app
  # Neo4j 가 깨끗하게 종료해야 dump 가 받아들인다. 강제 종료되면 "Active logical log detected" 로 실패한다
  docker compose stop -t 120 neo4j
}

# 백업 디렉터리와 파일은 실행한 사용자만 읽고 쓴다(디렉터리 700, 파일 600)
prepare_backup_dir() {
  umask 077
  mkdir -p backups
  chmod 700 backups
}

# 덤프를 컨테이너의 표준 출력으로 받아 호스트 파일에 쓴다. 호스트 디렉터리를 컨테이너에 마운트하지 않으므로
# neo4j uid 에 쓰기 권한을 열어 줄 필요가 없다. neo4j 가 멈춘 상태에서만 부른다
dump_to_file() {
  local file="$1" tmp="$1.partial"
  PARTIAL_FILE="$tmp"
  if ! docker compose run --rm --no-deps -T neo4j neo4j-admin database dump neo4j --to-stdout >"$tmp"; then
    rm -f "$tmp"
    PARTIAL_FILE=""
    return 1
  fi
  check_dump "$tmp" || { PARTIAL_FILE=""; return 1; }
  mv "$tmp" "$file"
  PARTIAL_FILE=""
}

# 덤프 파일을 표준 입력으로 넘겨 불러온다. neo4j 가 멈춘 상태에서만 부른다
load_from_file() {
  docker compose run --rm --no-deps -T neo4j \
    neo4j-admin database load neo4j --from-stdin --overwrite-destination=true <"$1"
}

# Neo4j 5 의 덤프는 "DZV1" 로 시작한다. 크기와 머리말로 덤프인지 확인한다.
# 시작 스크립트의 안내문이 섞였거나 다른 파일이면 실패한다
is_dump() {
  local size
  size="$(wc -c <"$1" | tr -d ' ')"
  [ "$size" -ge 1024 ] && [ "$(head -c 4 "$1")" = "DZV1" ]
}

check_dump() {
  if ! is_dump "$1"; then
    echo "Neo4j 덤프 형식이 아니다(크기가 1KiB 미만이거나 DZV1 머리말이 없음). 백업을 중단한다" >&2
    rm -f "$1"
    return 1
  fi
}
