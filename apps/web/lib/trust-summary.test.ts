import { describe, expect, it } from 'vitest'
import { summarizeTrust } from './trust-summary'

describe('summarizeTrust', () => {
  it('4단계 모두 존재하고 전부 통과하면 "전부 통과"라고 말한다', () => {
    const result = summarizeTrust([
      { stage: 1, verdict: 'pass' },
      { stage: 2, verdict: 'pass' },
      { stage: 3, verdict: 'pass' },
      { stage: 4, verdict: 'pass' },
    ])
    expect(result).toEqual({ label: '4단계 필터 전부 통과', caution: false })
  })

  it('3단계만 존재하고 전부 통과해도 "전부"라고 말하지 않는다', () => {
    const result = summarizeTrust([
      { stage: 1, verdict: 'pass' },
      { stage: 2, verdict: 'pass' },
      { stage: 3, verdict: 'pass' },
    ])
    expect(result).toEqual({ label: '3단계 통과', caution: false })
    expect(result?.label).not.toContain('전부')
  })

  it('한 단계에 통과와 유의 근거가 함께 있으면 그 단계는 통과로 세지 않는다', () => {
    const result = summarizeTrust([
      { stage: 1, verdict: 'pass' },
      { stage: 2, verdict: 'pass' },
      { stage: 2, verdict: 'caution' },
      { stage: 3, verdict: 'pass' },
    ])
    expect(result).toEqual({ label: '2단계 통과 · 1건 유의', caution: true })
  })

  it('근거가 비어 있으면 배지를 숨긴다(null)', () => {
    const result = summarizeTrust([])
    expect(result).toBeNull()
  })
})
