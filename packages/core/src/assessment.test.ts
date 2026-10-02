import { describe, expect, it } from 'vitest'
import { Assessment, EVALUATOR_LOCK_KEY, TRIAGE_DEEP_CUT } from './index'

const base = {
  paperId: '00000000-0000-4000-8000-000000000001',
  track: 'notable',
  field: 'cs',
  stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
  stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0.2 },
  evidence: [{ stage: 1, verdict: 'pass', text: '철회 기록이 없다' }],
  caveats: [],
  assessedAt: new Date('2026-09-29T00:00:00Z'),
}

describe('Assessment', () => {
  it('stage3·stage4가 null이어도 통과한다 (평가하지 않은 단계)', () => {
    const parsed = Assessment.parse({ ...base, stage3: null, stage4: null })
    expect(parsed.stage3).toBeNull()
    expect(parsed.stage4).toBeNull()
  })

  it('stage3에 값이 있으면 그대로 검증한다', () => {
    const stage3 = {
      reproducibility: { value: 0.8, reason: '코드 저장소가 논문에 명시돼 있다' },
      design: { value: null, reason: '본문을 확인하지 못했다' },
      statistics: { value: 0.5, reason: '신뢰구간을 보고하지 않았다' },
      claimVsEvidence: { value: 0.7, reason: '초록의 주장이 결과 범위 안이다' },
      limitations: { value: 0.6, reason: '한계 섹션이 있다' },
      preregistered: null,
      studyDesign: null,
    }
    const parsed = Assessment.parse({ ...base, stage3, stage4: null })
    expect(parsed.stage3?.design.value).toBeNull()
  })

  it('근거 문장이 하나도 없으면 거부한다 (절대 규칙 2)', () => {
    expect(Assessment.safeParse({ ...base, stage3: null, stage4: null, evidence: [] }).success).toBe(false)
  })
})

describe('상수', () => {
  it('평가 상수가 제정신인 범위다', () => {
    expect(TRIAGE_DEEP_CUT).toBeGreaterThan(0)
    expect(TRIAGE_DEEP_CUT).toBeLessThan(50)
  })

  it('evaluator 잠금 키가 collector와 다르다', () => {
    expect(EVALUATOR_LOCK_KEY).not.toBe(610_927)
  })
})
