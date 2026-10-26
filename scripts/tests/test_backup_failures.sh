#!/usr/bin/env bash
# backup.sh 와 restore.sh 의 실패 경로를 가짜 docker 명령으로 검사한다. 실제 컨테이너를 쓰지 않는다.
# 1. 덤프 도중 중단(Ctrl-C 와 같은 신호)되면 .partial 이 남지 않고 서비스를 다시 올린다
# 2. 덤프 형식이 아닌 파일은 서비스를 멈추기 전에 거절한다
# 3. load 가 실패하면 서비스를 멈춘 채 두고 안전 덤프 경로와 되돌리는 명령을 출력한다
set -uo pipefail
here="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/fw" "$work/bin"
cp -R "$here/scripts" "$work/fw/scripts"
log="$work/docker.log"

cat >"$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
# 가짜 docker. 받은 인자를 기록하고 덤프, load, 상태 확인을 흉내 낸다
echo "$*" >>"$FAKE_DOCKER_LOG"
case "$*" in
  *"--to-stdout"*)
    printf 'DZV1'; head -c 2048 /dev/urandom
    if [ "${FAKE_DUMP_SLEEP:-0}" = "1" ]; then exec sleep 30; fi ;;
  *"--from-stdin"*)
    cat >/dev/null
    [ "${FAKE_LOAD_FAIL:-0}" = "1" ] && exit 1 ;;
  *"compose ps -q"*) echo fake-id ;;
  *"inspect"*) echo healthy ;;
esac
exit 0
STUB
chmod +x "$work/bin/docker"
export PATH="$work/bin:$PATH" FAKE_DOCKER_LOG="$log"

failed=0
check() {
  local message="$1"; shift
  if "$@"; then echo "통과: $message"; else echo "위반: $message"; failed=1; fi
}

# 1. 덤프 중 중단
: >"$log"
FAKE_DUMP_SLEEP=1 bash "$work/fw/scripts/backup.sh" >"$work/backup.out" 2>&1 &
pid=$!
# 가짜 docker 가 덤프 도중의 sleep 에 닿을 때까지 기다린다. .partial 은 그보다 먼저 리다이렉션이 만든다.
# 부하가 높으면 서비스를 멈추고 덤프를 시작하기까지 5초를 넘긴 적이 있어 상한을 30초로 둔다
for _ in $(seq 1 300); do pgrep -P "$pid" -x sleep >/dev/null && break; sleep 0.1; done
check "덤프 중에는 .partial 이 생긴다" bash -c "ls '$work/fw/backups/'*.partial >/dev/null 2>&1"
# 터미널의 Ctrl-C 처럼 스크립트와 자식 프로세스에 함께 신호를 보낸다
pkill -TERM -P "$pid" sleep 2>/dev/null
kill -TERM "$pid" 2>/dev/null
wait "$pid"
code=$?
check "중단되면 0 이 아닌 코드로 끝난다(받은 코드 $code)" test "$code" -ne 0
check "중단되면 .partial 이 남지 않는다" bash -c "! ls '$work/fw/backups/'*.partial >/dev/null 2>&1"
check "덤프가 중단돼도 데이터는 그대로라 서비스를 다시 올린다" grep -q "compose start neo4j app" "$log"

# 2. 덤프 형식이 아닌 파일은 서비스를 멈추기 전에 거절한다
: >"$log"
head -c 2048 /dev/urandom >"$work/not-a-dump"
bash "$work/fw/scripts/restore.sh" "$work/not-a-dump" >"$work/invalid.out" 2>&1
code=$?
check "덤프 형식이 아니면 0 이 아닌 코드로 끝난다(받은 코드 $code)" test "$code" -ne 0
check "덤프 형식이 아니면 서비스를 멈추지 않는다" bash -c "! grep -q 'compose stop' '$log'"

# 3. load 실패
: >"$log"
{ printf 'DZV1'; head -c 2048 /dev/urandom; } >"$work/source.dump"
FAKE_LOAD_FAIL=1 bash "$work/fw/scripts/restore.sh" "$work/source.dump" >"$work/restore.out" 2>&1
code=$?
check "load 가 실패하면 0 이 아닌 코드로 끝난다(받은 코드 $code)" test "$code" -ne 0
check "load 가 실패하면 서비스를 다시 올리지 않는다" bash -c "! grep -q 'compose start' '$log'"
check "실패해도 안전 덤프 경로와 되돌리는 명령을 출력한다" bash -c "grep -q '복원 전 상태: .*neo4j-before-restore-' '$work/restore.out' && grep -q '되돌리려면: .*restore.sh --skip-safety-dump' '$work/restore.out'"
check "안전 덤프 파일이 남아 있다" bash -c "ls '$work/fw/backups/'neo4j-before-restore-*.dump >/dev/null 2>&1"
# GNU stat 의 -f 는 파일시스템 정보라 실패하지 않고 다른 값을 낸다. GNU 형식(-c)을 먼저 쓰고, 안 되면 BSD 형식(macOS)으로 읽는다
check "안전 덤프 파일은 실행한 사용자만 읽는다" bash -c "[ \"\$(stat -c %a '$work/fw/backups/'neo4j-before-restore-*.dump 2>/dev/null || stat -f %Lp '$work/fw/backups/'neo4j-before-restore-*.dump)\" = 600 ]"

[ "$failed" = 0 ] || { echo "--- backup 출력"; cat "$work/backup.out"; echo "--- restore 출력"; cat "$work/restore.out"; }
exit $failed
