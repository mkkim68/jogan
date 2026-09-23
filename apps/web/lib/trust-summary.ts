export type TrustEvidence = { stage: 1 | 2 | 3 | 4; verdict: 'pass' | 'caution' }

export type TrustSummary = { label: string; caution: boolean }

/**
 * 우 레일 "신뢰도 근거" 배지 문구.
 *
 * `evidence`는 4단계 모두를 보장하지 않는다 (`Evidence` 스키마는 `min(1)`일 뿐이고, 시드 데이터도
 * 이미 3단계까지만 평가된 논문들을 담고 있다). 그래서 분모는 "4단계 신뢰도 필터"라는 파이프라인
 * 상수가 아니라 `evidence`에 실제로 등장한 단계 수([...stagesPresent])에서 구한다.
 * evidence에 없는 단계를 "통과"로 크레딧하지 않는다 (CLAUDE.md 절대 규칙 2).
 */
export function summarizeTrust(evidence: TrustEvidence[]): TrustSummary | null {
  // 근거가 하나도 없으면 "0단계 통과"라는 초록 배지를 지어내지 않는다 — 배지 자체를 숨긴다
  // (CLAUDE.md 절대 규칙 2).
  if (evidence.length === 0) return null

  const stagesPresent = new Set(evidence.map((e) => e.stage))
  const cautionStages = new Set(evidence.filter((e) => e.verdict === 'caution').map((e) => e.stage))
  const passedStages = [...stagesPresent].filter((s) => !cautionStages.has(s))
  const cautionCount = evidence.filter((e) => e.verdict === 'caution').length

  if (cautionCount === 0) {
    return stagesPresent.size === 4
      ? { label: `${passedStages.length}단계 필터 전부 통과`, caution: false }
      : { label: `${passedStages.length}단계 통과`, caution: false }
  }
  return { label: `${passedStages.length}단계 통과 · ${cautionCount}건 유의`, caution: true }
}
