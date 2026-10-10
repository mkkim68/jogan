import type { Stage3 } from '@jogan/core'
import type { BriefCandidate } from '@jogan/db'
import { describe, expect, it } from 'vitest'
import { briefLimits, fitsConstraints, rankCandidates, stage3Mean, trustScore } from './rank'

const score = (value: number | null) => ({ value, reason: 'r' })
const s3 = (v: number | null): Stage3 => ({
  reproducibility: score(v), design: score(v), statistics: score(v),
  claimVsEvidence: score(v), limitations: score(v), preregistered: null, studyDesign: null,
})

const cand = (over: Partial<BriefCandidate> & { paperId: string }): BriefCandidate => ({
  interestId: 'i1', relevance: 0.5, title: 'T', abstract: 'A', arxivId: '2609.00001',
  track: 'notable', stage3: null, evidence: [], caveats: [], ...over,
})

describe('stage3Mean', () => {
  it('null이 아닌 항목만 평균한다', () => {
    const s = { ...s3(0.8), statistics: score(null) }
    expect(stage3Mean(s)).toBeCloseTo(0.8)
  })

  it('③단계가 없거나 전부 null이면 null', () => {
    expect(stage3Mean(null)).toBeNull()
    expect(stage3Mean(s3(null))).toBeNull()
  })
})

describe('trustScore', () => {
  it('트랙 가중 × ③ 평균', () => {
    expect(trustScore({ track: 'verified', stage3: s3(0.8) })).toBeCloseTo(0.8)
    expect(trustScore({ track: 'notable', stage3: s3(0.8) })).toBeCloseTo(0.56)
  })

  it('③단계가 없으면 평균 자리에 0.3', () => {
    expect(trustScore({ track: 'notable', stage3: null })).toBeCloseTo(0.21)
  })
})

describe('rankCandidates', () => {
  it('③단계를 받은 논문이 받지 못한 논문보다 항상 앞선다 (관련성이 훨씬 높아도)', () => {
    const noS3 = cand({ paperId: 'no', relevance: 0.9, stage3: null })
    const withS3 = cand({ paperId: 'yes', relevance: 0.31, stage3: s3(0.4) })
    expect(rankCandidates([noS3, withS3]).map((c) => c.paperId)).toEqual(['yes', 'no'])
  })

  it('같은 그룹 안에서는 관련성 × 신뢰도 내림차순', () => {
    const a = cand({ paperId: 'a', relevance: 0.5, stage3: s3(0.9) })
    const b = cand({ paperId: 'b', relevance: 0.6, stage3: s3(0.5) })
    expect(rankCandidates([b, a]).map((c) => c.paperId)).toEqual(['a', 'b'])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const input = [cand({ paperId: 'x', relevance: 0.1 }), cand({ paperId: 'y', relevance: 0.9 })]
    rankCandidates(input)
    expect(input.map((c) => c.paperId)).toEqual(['x', 'y'])
  })
})

describe('fitsConstraints', () => {
  it('4편이 차면 더 받지 않는다', () => {
    const four = ['a', 'b', 'c', 'd'].map((id, i) => cand({ paperId: id, track: 'verified', interestId: `i${i}` }))
    expect(fitsConstraints(four, cand({ paperId: 'e', track: 'verified', interestId: 'i9' }))).toBe(false)
  })

  it('프리프린트(notable)는 2편까지 — 절대 규칙 3', () => {
    const two = [cand({ paperId: 'a', interestId: 'i1' }), cand({ paperId: 'b', interestId: 'i2' })]
    expect(fitsConstraints(two, cand({ paperId: 'c', interestId: 'i3' }))).toBe(false)
    expect(fitsConstraints(two, cand({ paperId: 'c', interestId: 'i3', track: 'verified' }))).toBe(true)
  })

  it('한 관심사는 2편까지', () => {
    const two = [
      cand({ paperId: 'a', interestId: 'i1', track: 'verified' }),
      cand({ paperId: 'b', interestId: 'i1', track: 'verified' }),
    ]
    expect(fitsConstraints(two, cand({ paperId: 'c', interestId: 'i1', track: 'verified' }))).toBe(false)
    expect(fitsConstraints(two, cand({ paperId: 'c', interestId: 'i2', track: 'verified' }))).toBe(true)
  })

  it('notable만 5편이면 순서대로 2편만 들어간다', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'].map((id, i) => cand({ paperId: id, interestId: `i${i}` }))
    const accepted: BriefCandidate[] = []
    for (const c of pool) if (fitsConstraints(accepted, c)) accepted.push(c)
    expect(accepted.map((c) => c.paperId)).toEqual(['a', 'b'])
  })
})

describe('briefLimits — 사용자 설정을 지면 제약으로', () => {
  it('설정이 없으면 기본값: 4편, 프리프린트 2편', () => {
    expect(briefLimits(null)).toEqual({ size: 4, maxPreprints: 2 })
  })

  it('하루 편수는 BRIEF_SIZE(4)를 넘지 않는다', () => {
    expect(briefLimits({ papersPerDay: 2, includePreprints: true }).size).toBe(2)
    expect(briefLimits({ papersPerDay: 5, includePreprints: true }).size).toBe(4)
  })

  it('프리프린트를 끄면 notable은 0편 — 켜도 절대 규칙 3의 2편을 넘지 않는다', () => {
    expect(briefLimits({ papersPerDay: 4, includePreprints: false }).maxPreprints).toBe(0)
    expect(briefLimits({ papersPerDay: 1, includePreprints: true })).toEqual({ size: 1, maxPreprints: 1 })
  })
})

describe('fitsConstraints — limits 주입', () => {
  it('size 1이면 한 편만 받는다', () => {
    const one = [cand({ paperId: 'a', track: 'verified' })]
    expect(fitsConstraints(one, cand({ paperId: 'b', track: 'verified', interestId: 'i2' }), { size: 1, maxPreprints: 1 })).toBe(false)
  })

  it('maxPreprints 0이면 notable을 받지 않는다', () => {
    expect(fitsConstraints([], cand({ paperId: 'a' }), { size: 4, maxPreprints: 0 })).toBe(false)
    expect(fitsConstraints([], cand({ paperId: 'a', track: 'verified' }), { size: 4, maxPreprints: 0 })).toBe(true)
  })
})
