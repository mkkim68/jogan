import { describe, expect, it } from 'vitest'
import type { SummaryDraft } from './summarize'
import { verifySummary, type SummaryRejection } from './verify-summary'

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

  it('논문을 버릴 때 어느 문장이 왜 걸렸는지 알려준다', () => {
    const rejections: SummaryRejection[] = []
    const r = verifySummary(
      { ...good, whyItMatters: { text: 'COCO에서 정확도 99.9를 냈다', terms: [] } },
      source,
      '본문',
      (x) => rejections.push(x),
    )
    expect(r).toBeNull()
    expect(rejections).toEqual([
      {
        field: 'whyItMatters',
        sentence: 'COCO에서 정확도 99.9를 냈다',
        problems: ['원문에 없는 숫자 99.9', '원문에 없는 이름 COCO'],
      },
    ])
  })

  it('통과하면 알리지 않는다', () => {
    const rejections: SummaryRejection[] = []
    verifySummary(good, source, '본문', (x) => rejections.push(x))
    expect(rejections).toEqual([])
  })

  it('terms에 빠뜨린 라틴 고유명사도 잡는다', () => {
    const r = verifySummary({ ...good, method: [{ text: 'MMLU로도 평가했다', terms: [] }] }, source)
    expect(r?.method).toBe('')
  })

  it('결과의 label에 든 숫자·고유명사도 대조한다', () => {
    const r = verifySummary({ ...good, results: [{ label: 'CIFAR 정확도', value: '87.5', terms: [] }] }, source)
    expect(r?.results).toEqual([])
  })

  it('인용의 locator가 원문에 없으면 "본문"으로 대체하고 dropped를 센다', () => {
    const r = verifySummary({
      ...good,
      quotes: [{ text: 'Our method improves accuracy by a wide margin.', locator: 'Section 12' }],
    }, source)
    expect(r).not.toBeNull()
    expect(r?.quotes).toEqual([{ text: 'Our method improves accuracy by a wide margin.', locator: '본문' }])
    // dropped는 원래 3 (method "5개", results "91.2", limitations "COCO") + 1 (locator "Section 12") = 4
    expect(r?.dropped).toBe(4)
  })

  it('valid한 locator는 그대로 유지된다', () => {
    const r = verifySummary({
      ...good,
      quotes: [{ text: 'Our method improves accuracy by a wide margin.', locator: '초록' }],
    }, source)
    expect(r).not.toBeNull()
    expect(r?.quotes).toEqual([{ text: 'Our method improves accuracy by a wide margin.', locator: '초록' }])
    // dropped는 원래 3 (method "5개", results "91.2", limitations "COCO")
    expect(r?.dropped).toBe(3)
  })

  it('숫자가 없는 results.value는 버린다 (F2)', () => {
    const r = verifySummary({ ...good, results: [{ label: '정확도', value: '대폭 향상', terms: [] }] }, source)
    expect(r?.results).toEqual([])
  })

  it('인용은 원문의 표기로 저장한다 (F4)', () => {
    const r = verifySummary(
      { ...good, quotes: [{ text: 'our method improves accuracy by a wide margin.', locator: '초록' }] },
      source,
    )
    expect(r?.quotes[0]?.text).toBe('Our method improves accuracy by a wide margin.')
  })

  it('locator 검증 실패 시 대체값은 호출자가 정한다 (F7)', () => {
    const bad = { ...good, quotes: [{ text: 'Our method improves accuracy by a wide margin.', locator: '섹션 9' }] }
    expect(verifySummary(bad, source)?.quotes[0]?.locator).toBe('본문')
    expect(verifySummary(bad, source, '초록')?.quotes[0]?.locator).toBe('초록')
  })

  it('공백뿐인 문장은 스키마에서 거부한다 (F8)', async () => {
    const { SummaryDraft } = await import('./summarize')
    const base = { oneLine: { text: 'x' }, whyItMatters: { text: 'y' } }
    expect(SummaryDraft.safeParse(base).success).toBe(true)
    expect(SummaryDraft.safeParse({ ...base, oneLine: { text: '   ' } }).success).toBe(false)
    expect(SummaryDraft.safeParse({ ...base, results: [{ label: ' ', value: '1' }] }).success).toBe(false)
    expect(SummaryDraft.safeParse({ ...base, limitations: [{ bySource: 'ai', text: ' ' }] }).success).toBe(false)
    expect(SummaryDraft.safeParse({ ...base, quotes: [{ text: ' ', locator: '' }] }).success).toBe(false)
  })
})
