import type { Evidence } from '@jogan/core'
import { describe, expect, it } from 'vitest'
import { keepVerifiedEvidence, verifyAgainstSource } from './verify'

const source = 'We evaluate on 12 datasets with 3 seeds. Accuracy reaches 87.5% on ImageNet.'

describe('verifyAgainstSource', () => {
  it('원문에 있는 수치는 통과한다', () => {
    expect(verifyAgainstSource('12개 데이터셋에서 평가했다', source)).toBe(true)
    expect(verifyAgainstSource('정확도 87.5%에 도달했다', source)).toBe(true)
  })

  it('원문에 없는 수치는 막는다', () => {
    expect(verifyAgainstSource('40개 데이터셋에서 평가했다', source)).toBe(false)
    expect(verifyAgainstSource('정확도 92.1%에 도달했다', source)).toBe(false)
  })

  it('수치가 없는 문장은 통과한다', () => {
    expect(verifyAgainstSource('한계 섹션이 성실하다', source)).toBe(true)
  })

  it('여러 수치 중 하나라도 원문에 없으면 막는다', () => {
    expect(verifyAgainstSource('12개 데이터셋에서 92% 정확도', source)).toBe(false)
  })

  it('원문이 비어 있으면 수치가 든 문장을 전부 막는다', () => {
    expect(verifyAgainstSource('12개 데이터셋', '')).toBe(false)
    expect(verifyAgainstSource('한계가 성실하다', '')).toBe(true)
  })

  it('소수점 표기가 같아야 한다', () => {
    expect(verifyAgainstSource('87.50%를 기록했다', source)).toBe(false)
  })
})

describe('keepVerifiedEvidence', () => {
  it('검증 실패한 문장만 버린다', () => {
    const items: Evidence[] = [
      { stage: 3, verdict: 'pass', text: '12개 데이터셋에서 평가했다' },
      { stage: 3, verdict: 'pass', text: '40개 데이터셋에서 평가했다' },
      { stage: 3, verdict: 'caution', text: '한계를 적지 않았다' },
    ]
    const kept = keepVerifiedEvidence(items, source)
    expect(kept.map((e) => e.text)).toEqual(['12개 데이터셋에서 평가했다', '한계를 적지 않았다'])
  })

  it('전부 실패하면 빈 배열이다', () => {
    const items: Evidence[] = [{ stage: 3, verdict: 'pass', text: '99개를 썼다' }]
    expect(keepVerifiedEvidence(items, source)).toEqual([])
  })
})
