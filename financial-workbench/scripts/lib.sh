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

# $1 디렉터리에 neo4j.dump 를 만든다. neo4j 가 멈춘 상태에서만 부른다
dump_to() {
  local dir="$1"
  mkdir -p "$dir"
  chmod 777 "$dir"
  docker compose run --rm --no-deps -v "$dir:/backups" neo4j \
    neo4j-admin database dump neo4j --to-path=/backups --overwrite-destination=true
}
