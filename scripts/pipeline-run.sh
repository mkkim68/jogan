#!/usr/bin/env bash
# 새벽 배치와 같은 전체 파이프라인 (ADR 0003).
# 앞 단계가 실패해도 뒤 단계는 DB에 있는 것으로 돈다 — arXiv 429 같은 외부 장애가 그날 브리핑을
# 통째로 지우지 않게. 하나라도 실패했으면 셋 다 돈 뒤에 exit 1로 알린다.
set -u

failed=()
for step in collect evaluate brief; do
  echo "[pipeline] ${step} 시작"
  if ! pnpm "pipeline:${step}"; then
    failed+=("${step}")
    echo "[pipeline] ${step} 실패 — 다음 단계는 계속한다"
  fi
done

if [ "${#failed[@]}" -gt 0 ]; then
  echo "[pipeline] 실패한 단계: ${failed[*]}"
  exit 1
fi
echo "[pipeline] 전 단계 성공"
