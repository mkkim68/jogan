import { describe, expect, it } from 'vitest'
import { plainMath } from './paper-format'

describe('plainMath — arXiv 초록의 인라인 LaTeX를 읽을 수 있는 글자로', () => {
  it('자주 쓰는 기호를 바꾼다', () => {
    expect(plainMath('consume on average 6.36$\\times$ as much')).toBe('consume on average 6.36× as much')
    expect(plainMath('36.85 $\\pm$ 1.68, $\\sim$3x, $\\geq$ 0.5, $\\leq$ 2, $\\approx$ 4')).toBe('36.85 ± 1.68, ~3x, ≥ 0.5, ≤ 2, ≈ 4')
  })

  it('남은 짧은 $…$는 기호만 벗긴다', () => {
    expect(plainMath('accuracy of $85\\%$ on $k$ tasks')).toBe('accuracy of 85% on k tasks')
  })

  it('수식이 없으면 그대로, 짝이 안 맞는 $도 그대로', () => {
    expect(plainMath('costs $5 per run')).toBe('costs $5 per run')
    expect(plainMath('plain text')).toBe('plain text')
    expect(plainMath('costs $5 and $10 per run')).toBe('costs $5 and $10 per run')
  })
})
