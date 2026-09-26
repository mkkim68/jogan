import { describe, expect, it } from 'vitest'
import { planInterestAdd } from './interest'

describe('planInterestAdd', () => {
  it('3개 보유 + 2개 신규 제출 — 허용', () => {
    const result = planInterestAdd(['a', 'b', 'c'], ['d', 'e'], 5)
    expect(result).toEqual({ ok: true, newLabels: ['d', 'e'] })
  })

  it('3개 보유 + 3개 신규 제출 — 거부, 남은 자리 수는 정확히 2', () => {
    const result = planInterestAdd(['a', 'b', 'c'], ['d', 'e', 'f'], 5)
    expect(result).toEqual({ ok: false, reason: 'over-cap', remaining: 2 })
  })

  it('5개 보유(상한 도달) + 전부 중복 제출 — 허용, 새 라벨 0개', () => {
    const result = planInterestAdd(['a', 'b', 'c', 'd', 'e'], ['a', 'c'], 5)
    expect(result).toEqual({ ok: true, newLabels: [] })
  })

  it('중복이 섞인 제출 — 이미 가진 라벨과 제출 내 중복은 새 라벨에서 빠진다', () => {
    const result = planInterestAdd(['a'], ['a', 'b', 'b', 'c'], 5)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.newLabels).toEqual(['b', 'c'])
  })

  it('빈 제출 — 허용, 새 라벨 0개', () => {
    const result = planInterestAdd(['a', 'b'], [], 5)
    expect(result).toEqual({ ok: true, newLabels: [] })
  })
})
