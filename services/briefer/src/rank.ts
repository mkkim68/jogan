import {
  BRIEF_MAX_PER_INTEREST,
  BRIEF_MAX_PREPRINTS,
  BRIEF_SIZE,
  TRUST_TRACK_WEIGHT,
  TRUST_WITHOUT_STAGE3,
  type Stage3,
} from '@jogan/core'
import type { BriefCandidate } from '@jogan/db'

const RUBRIC = ['reproducibility', 'design', 'statistics', 'claimVsEvidence', 'limitations'] as const

/** ③단계 5항목 중 값이 있는 것의 평균. 없거나 전부 null이면 null — "평가 안 함"과 "0점"은 다르다 */
export function stage3Mean(stage3: Stage3 | null): number | null {
  if (stage3 === null) return null
  const values = RUBRIC.map((k) => stage3[k].value).filter((v): v is number => v !== null)
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
}

/** 신뢰도 = 트랙 가중 × ③ 평균(없으면 0.3) — ADR 0002 D2 */
export function trustScore(c: Pick<BriefCandidate, 'track' | 'stage3'>): number {
  return TRUST_TRACK_WEIGHT[c.track] * (stage3Mean(c.stage3) ?? TRUST_WITHOUT_STAGE3)
}

/**
 * 브리핑 순위. ③단계를 받은 논문이 **항상** 앞선다(ADR 0002 D2) — 관련성 척도가 관심사마다 달라서
 * 곱셈만으로는 그게 보장되지 않는다. 그룹 안에서는 관련성 × 신뢰도 내림차순.
 */
export function rankCandidates(candidates: BriefCandidate[]): BriefCandidate[] {
  const key = (c: BriefCandidate) => ({ scored: stage3Mean(c.stage3) !== null, value: c.relevance * trustScore(c) })
  return [...candidates].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka.scored !== kb.scored) return ka.scored ? -1 : 1
    return kb.value - ka.value
  })
}

/** 이미 고른 것에 이 후보를 더해도 되는가 — 편수, 프리프린트 상한(절대 규칙 3), 관심사 상한(D3) */
export function fitsConstraints(accepted: BriefCandidate[], candidate: BriefCandidate): boolean {
  if (accepted.length >= BRIEF_SIZE) return false
  if (candidate.track === 'notable' && accepted.filter((a) => a.track === 'notable').length >= BRIEF_MAX_PREPRINTS) {
    return false
  }
  return accepted.filter((a) => a.interestId === candidate.interestId).length < BRIEF_MAX_PER_INTEREST
}
