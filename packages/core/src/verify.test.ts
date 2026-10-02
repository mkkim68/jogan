import type { Evidence } from './assessment'
import { describe, expect, it } from 'vitest'
import { extractLatinTerms, keepVerifiedEvidence, verifyAgainstSource, verifyQuote, verifySentence, verifyTerms } from './verify'

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

describe('extractLatinTerms', () => {
  it('대문자나 숫자가 섞인 라틴 토큰만 고유명사 후보로 뽑는다', () => {
    expect(extractLatinTerms('GPT-4와 ImageNet에서 baseline보다 높다')).toEqual(['GPT-4', 'ImageNet'])
  })

  it('같은 토큰은 한 번만', () => {
    expect(extractLatinTerms('BERT와 BERT')).toEqual(['BERT'])
  })

  it('소문자 단어와 한글만 있으면 빈 배열', () => {
    expect(extractLatinTerms('이 모델은 robust하다')).toEqual([])
  })
})

describe('verifyTerms', () => {
  const source = 'We evaluate on CodeJudgeBench and ImageNet using GPT-4.'

  it('모델이 낸 고유명사가 원문에 있으면 통과', () => {
    expect(verifyTerms('코드 판정 벤치마크에서 평가했다', ['CodeJudgeBench'], source)).toBe(true)
  })

  it('모델이 낸 고유명사가 원문에 없으면 실패', () => {
    expect(verifyTerms('가짜 벤치마크에서 평가했다', ['FakeBench'], source)).toBe(false)
  })

  it('terms에 빠뜨려도 문장 속 라틴 토큰이 원문에 없으면 실패한다 (보조 정규식, ADR 0002 D1)', () => {
    expect(verifyTerms('MMLU에서도 평가했다', [], source)).toBe(false)
  })

  it('대소문자·공백 차이는 같은 것으로 본다', () => {
    expect(verifyTerms('imagenet 결과', ['imagenet'], source)).toBe(true)
  })

  it('고유명사가 없는 문장은 통과', () => {
    expect(verifyTerms('한계 서술이 성실하다', [], source)).toBe(true)
  })

  it('빈 문자열 term은 무시한다', () => {
    expect(verifyTerms('평가했다', ['  '], source)).toBe(true)
  })
})

describe('verifyQuote', () => {
  const source = 'Our method   improves accuracy\nby a wide margin.'

  it('공백 차이만 있는 인용은 통과', () => {
    expect(verifyQuote('Our method improves accuracy by a wide margin.', source)).toBe(true)
  })

  it('단어가 하나라도 다르면 실패', () => {
    expect(verifyQuote('Our method doubles accuracy', source)).toBe(false)
  })

  it('빈 인용은 실패', () => {
    expect(verifyQuote('   ', source)).toBe(false)
  })
})

describe('verifySentence', () => {
  const source = 'On ImageNet we reach 87.5 accuracy.'

  it('숫자와 고유명사가 모두 원문에 있어야 통과', () => {
    expect(verifySentence('ImageNet에서 87.5를 달성했다', ['ImageNet'], source)).toBe(true)
  })

  it('숫자가 틀리면 실패', () => {
    expect(verifySentence('ImageNet에서 90.1을 달성했다', ['ImageNet'], source)).toBe(false)
  })

  it('고유명사가 틀리면 실패', () => {
    expect(verifySentence('CIFAR에서 87.5를 달성했다', ['CIFAR'], source)).toBe(false)
  })
})
