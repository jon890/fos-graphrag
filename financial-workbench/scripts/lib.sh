# backup.sh 와 restore.sh 가 함께 쓰는 함수. 직접 실행하지 않는다.
# Compose 파일은 docker compose 표준 환경변수 COMPOSE_FILE 로 고른다(여러 개면 콜론으로 잇는다). 비우면 compose.yml 이다.

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
  if ! docker compose run --rm --no-deps -T neo4j neo4j-admin database dump neo4j --to-stdout >"$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  check_dump "$tmp"
  mv "$tmp" "$file"
}

# 덤프 파일을 표준 입력으로 넘겨 불러온다. neo4j 가 멈춘 상태에서만 부른다
load_from_file() {
  docker compose run --rm --no-deps -T neo4j \
    neo4j-admin database load neo4j --from-stdin --overwrite-destination=true <"$1"
}

# 덤프는 Neo4j 형식 머리말로 시작한다. 시작 스크립트의 안내문이 섞이면 여기서 멈춘다
check_dump() {
  local size
  size="$(wc -c <"$1" | tr -d ' ')"
  if [ "$size" -lt 1024 ]; then
    echo "덤프가 너무 작다($size 바이트). 백업을 중단한다" >&2
    rm -f "$1"
    return 1
  fi
  if head -c 64 "$1" | LC_ALL=C grep -q 'Changed password\|Warning\|INFO'; then
    echo "덤프 앞에 텍스트가 섞였다. 백업을 중단한다" >&2
    rm -f "$1"
    return 1
  fi
}
