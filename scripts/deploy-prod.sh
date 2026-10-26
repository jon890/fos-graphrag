#!/usr/bin/env bash
# 워크벤치를 운영에 배포한다. 머지 큐의 머지 뒤 명령(`.orch/config.json` 의 queue.after_merged)이 부른다.
# 1) main 의 이미지 workflow 를 돌리고 성공을 기다린다 2) 홈서버에서 새 이미지를 받아 배포한다 3) 공개 주소의 health 를 본다.
# 머지 큐가 넘긴 CODE_PRS 가 비어 있으면(문서만 머지했으면) 배포하지 않는다. 직접 부를 때는 CODE_PRS 없이 부르면 배포한다.
# 배포 절차와 확인은 docs/deployment.md 와 .orch/overlay.md 의 「배포」 다.
set -euo pipefail

REPO=jon890/fos-valuation-ontology
WORKFLOW=workbench-image.yml
HEALTH_URL=https://graph.fosworld.co.kr/api/health

if [ "${MERGED_PRS+set}" = set ] && [ -z "${CODE_PRS:-}" ]; then
  echo "deploy-prod: 문서만 머지했다(머지 ${MERGED_PRS:-없음}). 배포하지 않는다"
  exit 0
fi

git fetch -q origin main
target=$(git rev-parse origin/main)
echo "deploy-prod: main ${target:0:7} 의 이미지를 만든다"
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
gh workflow run "$WORKFLOW" -R "$REPO" --ref main

run_id=""
for _ in $(seq 1 30); do
  run_id=$(gh run list -R "$REPO" --workflow "$WORKFLOW" --branch main --event workflow_dispatch -L 10 \
    --json databaseId,headSha,createdAt \
    --jq "[.[] | select(.headSha == \"$target\" and .createdAt >= \"$since\")][0].databaseId // empty")
  [ -n "$run_id" ] && break
  sleep 4
done
[ -n "$run_id" ] || { echo "deploy-prod: 방금 시작한 workflow 실행을 찾지 못했다" >&2; exit 1; }

echo "deploy-prod: workflow 실행 $run_id 을 기다린다"
gh run watch "$run_id" -R "$REPO" --exit-status > /dev/null

echo "deploy-prod: 홈서버에 배포한다"
ssh homeserver 'cd /home/bifos/apps/fos-home-infra && DOCKER_CONFIG=/home/bifos/.config/jenkins-deploy-docker docker pull -q ghcr.io/jon890/fos-valuation-ontology:latest && scripts/deploy/host-deploy-service.sh financial-workbench' \
  | grep -E '^(check_result|exit_code)='

for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null "$HEALTH_URL"; then
    echo "deploy-prod: 배포 끝(main ${target:0:7}, health 200)"
    exit 0
  fi
  sleep 3
done
echo "deploy-prod: 배포 뒤 health 가 200 이 아니다" >&2
exit 1
