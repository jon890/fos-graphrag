#!/usr/bin/env bash
# 운영 Compose 의 neo4j 가 호스트 포트를 열지 않는지, 개발 Compose 의 포트가 127.0.0.1 에만 묶이는지
# docker compose config 출력으로 검사한다. 위반이 있으면 종료 코드 1 이다.
set -euo pipefail
cd "$(dirname "$0")/.."

# config 렌더링에만 쓰는 값이다. 실제 비밀번호를 읽지 않는다
export NEO4J_PASSWORD="${NEO4J_PASSWORD:-config-check-only}"

prod_json="$(docker compose -f compose.yml config --format json)"
dev_json="$(docker compose -f compose.dev.yml config --format json)"

python3 - "$prod_json" "$dev_json" <<'PY'
import json, sys
prod, dev = (json.loads(a) for a in sys.argv[1:3])
errors = []
if prod["services"]["neo4j"].get("ports"):
    errors.append("운영 compose.yml 의 neo4j 가 호스트 포트를 연다")
for p in prod["services"]["app"].get("ports", []):
    if p.get("host_ip") in (None, "", "0.0.0.0", "::"):
        errors.append(f"운영 app 포트가 모든 주소에 열린다: {p}")
for name, svc in dev["services"].items():
    for p in svc.get("ports", []):
        if p.get("host_ip") != "127.0.0.1":
            errors.append(f"개발 {name} 포트가 127.0.0.1 이 아닌 곳에 묶인다: {p}")
for e in errors:
    print("위반:", e)
if errors:
    sys.exit(1)
print("통과: 운영 neo4j 포트 비공개, 개발 포트 loopback 전용")
PY
