#!/usr/bin/env bash
# Compose 설정 규칙을 docker compose config 출력으로 검사한다. 위반이 있으면 종료 코드 1 이다.
# - 운영: neo4j 호스트 포트 없음, app 은 모든 주소에 열리지 않음, 컨테이너마다 cap_drop ALL 과 no-new-privileges,
#   docker.sock 마운트 없음, neo4j 이미지 digest 고정, 가짜 OIDC 공급자 없음
# - 개발과 e2e override: 호스트 포트는 127.0.0.1 에만 묶인다
set -euo pipefail
cd "$(dirname "$0")/.."

# config 렌더링에만 쓰는 값이다. 실제 비밀번호를 읽지 않는다
export NEO4J_PASSWORD="${NEO4J_PASSWORD:-config-check-only}"
export COMPOSE_FILE=

prod_json="$(docker compose --env-file /dev/null -f compose.yml config --format json)"
dev_json="$(docker compose --env-file /dev/null -f compose.dev.yml config --format json)"
e2e_json="$(docker compose --env-file /dev/null -f compose.yml -f compose.e2e.yml config --format json)"

python3 - "$prod_json" "$dev_json" "$e2e_json" <<'PY'
import json, sys
prod, dev, e2e = (json.loads(a) for a in sys.argv[1:4])
errors = []
services = prod["services"]
if services["neo4j"].get("ports"):
    errors.append("운영 compose.yml 의 neo4j 가 호스트 포트를 연다")
if "@sha256:" not in services["neo4j"]["image"]:
    errors.append("운영 neo4j 이미지가 digest 로 고정되지 않았다")
if any("oidc" in name for name in services):
    errors.append("운영 compose.yml 에 가짜 OIDC 공급자가 있다")
for p in services["app"].get("ports", []):
    if p.get("host_ip") in (None, "", "0.0.0.0", "::"):
        errors.append(f"운영 app 포트가 모든 주소에 열린다: {p}")
for name, svc in services.items():
    if "ALL" not in svc.get("cap_drop", []):
        errors.append(f"운영 {name} 에 cap_drop ALL 이 없다")
    if "no-new-privileges:true" not in svc.get("security_opt", []):
        errors.append(f"운영 {name} 에 no-new-privileges 가 없다")
    if not str(svc.get("mem_limit", "")):
        errors.append(f"운영 {name} 에 mem_limit 이 없다")
    for v in svc.get("volumes", []):
        if "docker.sock" in str(v.get("source", "")):
            errors.append(f"운영 {name} 이 docker.sock 을 마운트한다")
for label, cfg in (("개발", dev), ("e2e", e2e)):
    for name, svc in cfg["services"].items():
        for p in svc.get("ports", []):
            if p.get("host_ip") != "127.0.0.1":
                errors.append(f"{label} {name} 포트가 127.0.0.1 이 아닌 곳에 묶인다: {p}")
if e2e["services"]["neo4j"].get("ports"):
    errors.append("e2e override 가 neo4j 포트를 연다")
for e in errors:
    print("위반:", e)
if errors:
    sys.exit(1)
print("통과: 운영 neo4j 포트 비공개, digest 고정, cap_drop, no-new-privileges, mem_limit, 개발과 e2e 포트 loopback 전용")
PY
