import { describe, expect, it } from 'vitest'
import type { SummaryDraft } from './summarize'
import { verifySummary } from './verify-summary'

const source = 'We propose X-Net. On ImageNet we reach 87.5 accuracy with 3 seeds. Our method improves accuracy by a wide margin.'

const good: SummaryDraft = {
  oneLine: { text: 'X-Net을 제안했다', terms: ['X-Net'] },
  whyItMatters: { text: 'ImageNet에서 87.5를 냈다', terms: ['ImageNet'] },
  method: [
    { text: '시드 3개로 평가했다', terms: [] },
    { text: '시드 5개로 반복했다', terms: [] },
  ],
  results: [
    { label: '정확도', value: '87.5', terms: [] },
    { label: '정확도', value: '91.2', terms: [] },
  ],
  limitations: [
    { bySource: 'author', text: 'ImageNet 하나로만 평가했다', terms: ['ImageNet'] },
    { bySource: 'ai', text: 'COCO 결과가 없다', terms: ['COCO'] },
  ],
  quotes: [
    { text: 'Our method improves accuracy by a wide margin.', locator: '초록' },
    { text: 'Our method doubles accuracy.', locator: '초록' },
  ],
}

describe('verifySummary', () => {
  it('원문과 맞지 않는 문장·항목만 버리고 버린 수를 센다', () => {
    const r = verifySummary(good, source)
    expect(r).not.toBeNull()
    expect(r?.oneLine).toBe('X-Net을 제안했다')
    expect(r?.method).toBe('시드 3개로 평가했다')           // "5개"는 원문에 없다
    expect(r?.results).toEqual([{ label: '정확도', value: '87.5' }]) // 91.2는 원문에 없다
    expect(r?.limitations).toEqual([{ bySource: 'author', text: 'ImageNet 하나로만 평가했다' }]) // COCO는 원문에 없다
    expect(r?.quotes).toEqual([{ text: 'Our method improves accuracy by a wide margin.', locator: '초록' }])
    expect(r?.dropped).toBe(4)
  })

  it('한 줄 요약이 검증에 실패하면 그 논문은 배달하지 않는다 (null)', () => {
    expect(verifySummary({ ...good, oneLine: { text: 'Y-Net을 제안했다', terms: ['Y-Net'] } }, source)).toBeNull()
  })

  it('"그래서 뭐?"가 검증에 실패해도 null', () => {
    expect(verifySummary({ ...good, whyItMatters: { text: '정확도 99.9를 냈다', terms: [] } }, source)).toBeNull()
  })

  it('terms에 빠뜨린 라틴 고유명사도 잡는다', () => {
    const r = verifySummary({ ...good, method: [{ text: 'MMLU로도 평가했다', terms: [] }] }, source)
    expect(r?.method).toBe('')
  })

  it('결과의 label에 든 숫자·고유명사도 대조한다', () => {
    const r = verifySummary({ ...good, results: [{ label: 'CIFAR 정확도', value: '87.5', terms: [] }] }, source)
    expect(r?.results).toEqual([])
  })
})
