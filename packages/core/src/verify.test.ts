import type { Evidence } from './assessment'
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

  it('조작된 숫자가 원문의 더 큰 숫자에 부분 문자열로 들어있어도 막는다', () => {
    const bigSource = 'We collected 120 samples, released in 2012. Accuracy reaches 87.5%.'
    expect(verifyAgainstSource('12개를 수집했다', bigSource)).toBe(false)
    expect(verifyAgainstSource('87개를 수집했다', bigSource)).toBe(false)
    // 원문에 실제로 있는 숫자는 여전히 통과해야 한다 — 부분 문자열만 막는 것이지
    // 전부 막는 게 아니다.
    expect(verifyAgainstSource('2012년 논문이다', bigSource)).toBe(true)
    expect(verifyAgainstSource('120개를 수집했다', bigSource)).toBe(true)
  })

  it('퍼센트 문장의 숫자가 원문 소수의 일부여도 막는다', () => {
    expect(verifyAgainstSource('유의수준 5%였다', 'The p-value was 0.05.')).toBe(false)
  })

  it('쉼표 표기가 달라도 같은 숫자면 통과한다', () => {
    expect(verifyAgainstSource('1,234명을 대상으로 했다', '1234 participants were included.')).toBe(true)
  })

  it('전각 숫자도 검사한다 — 그냥 통과시키지 않는다', () => {
    // ４０ = 전각 40. \d는 ASCII 전용이라 정규화하지 않으면 수치가 없는 문장으로
    // 취급되어 무검증으로 통과한다.
    expect(verifyAgainstSource('４０개 데이터셋에서 평가했다', source)).toBe(false)
    expect(verifyAgainstSource('１２개 데이터셋에서 평가했다', source)).toBe(true)
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
