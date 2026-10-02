import type { Evidence } from './assessment'
import { describe, expect, it } from 'vitest'
import { extractLatinTerms, findQuoteInSource, hasKoreanNumeral, keepVerifiedEvidence, verifyAgainstSource, verifyQuote, verifySentence, verifyTerms } from './verify'

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

describe('고유명사 경계·유니코드 (검증 우회 방지)', () => {
  it('BERT는 RoBERTa 안의 부분 문자열로 통과하지 못한다', () => {
    expect(verifyTerms('BERT를 능가했다', [], 'We beat RoBERTa on tasks.')).toBe(false)
  })

  it('GPT-4는 GPT-4o로 통과하지 못한다', () => {
    expect(verifyTerms('GPT-4를 능가했다', [], 'We beat GPT-4o.')).toBe(false)
  })

  it('문장 끝 마침표는 토큰의 일부가 아니다', () => {
    expect(verifyTerms('GPT-4 사용', ['GPT-4'], 'We use GPT-4.')).toBe(true)
  })

  it('쉼표가 붙어도 통과', () => {
    expect(verifyTerms('ImageNet 결과', ['ImageNet'], 'on ImageNet, we')).toBe(true)
  })

  it('여러 번 나오면 하나라도 경계가 맞으면 통과', () => {
    expect(verifyTerms('BERT 사용', ['BERT'], 'RoBERTa and BERT.')).toBe(true)
  })

  it('악센트 있는 이름을 추출한다', () => {
    expect(extractLatinTerms('Müller 등이 제안한')).toEqual(['Müller'])
    expect(extractLatinTerms('Łukasz Kaiser')).toEqual(['Łukasz', 'Kaiser'])
  })

  it('원문에 없는 악센트 이름은 실패', () => {
    expect(verifyTerms('Müller 등이 제안한', [], 'Proposed by Smith.')).toBe(false)
  })

  it('밑줄로 이어진 이름을 한 덩어리로 본다', () => {
    expect(extractLatinTerms('Llama_3 모델')).toEqual(['Llama_3'])
  })

  it('원문의 비분리 하이픈(U+2011)도 같은 하이픈으로 본다', () => {
    expect(verifyTerms('GPT-4 사용', ['GPT-4'], 'We use GPT\u20114.')).toBe(true)
  })
})

describe('한글 수량어 (F2)', () => {
  it('수량어가 든 문장은 닫힌 쪽으로 실패한다', () => {
    expect(verifyAgainstSource('정확도가 두 배로 올랐다', 'Accuracy doubled, 2 times.')).toBe(false)
    expect(verifyAgainstSource('다섯 개 벤치마크에서 평가했다', 'We use 5 benchmarks.')).toBe(false)
    expect(verifyAgainstSource('비용을 절반으로 줄였다', 'Cost halved.')).toBe(false)
    expect(verifyAgainstSource('3분의 1로 줄였다', 'one third')).toBe(false)
  })

  it('수량어가 없는 문장은 통과한다', () => {
    expect(verifyAgainstSource('한계 서술이 성실하다', 'Limitations are honest.')).toBe(true)
  })

  it('hasKoreanNumeral', () => {
    expect(hasKoreanNumeral('수십 배 빨라졌다')).toBe(true)
    expect(hasKoreanNumeral('세 가지 방법')).toBe(true)
    expect(hasKoreanNumeral('한계 서술이 성실하다')).toBe(false)
    expect(hasKoreanNumeral('세계 최초')).toBe(false)
  })
})

describe('숫자로 시작하는 라틴 토큰 (F5)', () => {
  it('3D, 5G를 고유명사 후보로 뽑되 순수 숫자는 뽑지 않는다', () => {
    expect(extractLatinTerms('3D 재구성과 5G')).toEqual(['3D', '5G'])
    expect(extractLatinTerms('2023년')).toEqual([])
  })

  it('원문에 있으면 통과, 없으면 실패', () => {
    expect(verifyTerms('3D 재구성', [], 'We do 3D reconstruction.')).toBe(true)
    expect(verifyTerms('3D 재구성', [], 'We do 2D work.')).toBe(false)
  })
})

describe('findQuoteInSource (F4)', () => {
  const sentence = 'We do not improve robustness at all here today.'

  it('짧은 조각(6단어 미만)은 의미를 뒤집을 수 있어 거부한다', () => {
    expect(findQuoteInSource('improve robustness', sentence)).toBeNull()
    expect(findQuoteInSource('e', sentence)).toBeNull()
  })

  it('6단어 이상 정확 인용은 원문의 표기로 돌려준다', () => {
    expect(findQuoteInSource('we do not improve robustness at all', sentence)).toBe('We do not improve robustness at all')
  })

  it('단어 중간에서 시작하는 인용은 거부한다', () => {
    expect(findQuoteInSource('e do not improve robustness at all here', sentence)).toBeNull()
  })

  it('verifyQuote는 findQuoteInSource가 null이 아닌지와 같다', () => {
    expect(verifyQuote('improve robustness', sentence)).toBe(false)
    expect(verifyQuote('We do not improve robustness at all', sentence)).toBe(true)
  })
})

describe('한글 수량어 오탐 (일반 단어)', () => {
  it.each(['3분의 1', '３분의 1', '삼분의 일', '백분의 일', '백분의', '삼 분의 일', '한 편의 논문', '두 편', '세 종', '두 배', '두배', '다섯 개', '세 가지 방법', '수십 배 빨라졌다', '절반으로 줄였다', '열 번', '두 단계', '다섯 분의 일', '여섯분의 일', '만 분의 일', '이분의 일', '두편', '한 편'])(
    '수량어: %s',
    (t) => expect(hasKoreanNumeral(t)).toBe(true),
  )

  it.each(['대부분의 벤치마크에서', '부분의', '성분의', '구분의', '한편, 이 방법은', '세종', '세계', '한국', '두께', '열정', '네트워크', '한계', '세부', '열쇠', '대부분', '한편으로는'])(
    '일반 단어: %s',
    (t) => expect(hasKoreanNumeral(t)).toBe(false),
  )

  it('일반 단어가 든 요약 문장은 통과한다', () => {
    expect(verifyAgainstSource('대부분의 벤치마크에서 기존 방법보다 낫다', 'Most benchmarks improved.')).toBe(true)
  })
})
