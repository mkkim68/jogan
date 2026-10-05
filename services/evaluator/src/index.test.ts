import { describe, expect, it } from 'vitest'
import { evaluate } from './index'

const paper = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  arxivId: `2609.0000${id}`,
  doi: null,
  title: `Paper ${id}`,
  abstract: 'We evaluate on 12 datasets. '.repeat(20),
  authors: [{ name: 'Jane Doe' }],
  categories: ['cs.LG'],
  ...overrides,
})

const deepJson = JSON.stringify({
  reproducibility: { value: 0.8, reason: '코드가 있다' },
  design: { value: 0.6, reason: '12개 데이터셋' },
  statistics: { value: 0.5, reason: '신뢰구간 없음' },
  claimVsEvidence: { value: 0.7, reason: '적절하다' },
  limitations: { value: 0.5, reason: '짧다' },
  caveats: [],
  evidence: [{ verdict: 'pass', text: '12개 데이터셋에서 검증했다' }],
})

function deps(over: Partial<Parameters<typeof evaluate>[0]> = {}) {
  const saved: { paperId: string; [k: string]: unknown }[] = []
  return {
    saved,
    value: {
      listPapers: async () => [paper('1'), paper('2')],
      saveAssessment: async (row: { paperId: string }) => { saved.push(row) },
      fetchWork: async () => null,
      fetchBody: async () => 'We evaluate on 12 datasets with 3 seeds.',
      llm: async (prompt: string) => (prompt.includes('reproducibility') ? deepJson : '{"score": 0.7, "reason": "ok"}'),
      lock: async () => true,
      mailto: 'a@b.com',
      ...over,
    },
  }
}

describe('evaluate', () => {
  it('후보 전부에 판정을 남긴다', async () => {
    const d = deps()
    const r = await evaluate(d.value)
    expect(r.assessed).toBe(2)
    expect(d.saved).toHaveLength(2)
  })

  it('①단계에서 탈락하면 뒤 단계를 돌리지 않는다', async () => {
    let llmCalls = 0
    const d = deps({
      listPapers: async () => [paper('1', { authors: [] })],
      llm: async () => { llmCalls++; return '{"score": 0.5, "reason": "x"}' },
    })
    const r = await evaluate(d.value)
    expect(llmCalls).toBe(0)
    expect(r.assessed).toBe(1)
    const [row] = d.saved
    if (row === undefined) throw new Error('저장된 판정이 없다')
    expect(row.stage1).toMatchObject({ passed: false })
    expect(row.stage3).toBeNull()
  })

  it('한 논문이 실패해도 나머지는 계속한다', async () => {
    let n = 0
    const d = deps({
      llm: async (prompt: string) => {
        n++
        if (n === 1) throw new Error('rate limit')
        return prompt.includes('reproducibility') ? deepJson : '{"score": 0.7, "reason": "ok"}'
      },
    })
    const r = await evaluate(d.value)
    expect(r.failed).toBe(1)
    expect(r.assessed).toBe(1)
  })

  it('본문 정밀 평가는 상한만큼만 돌린다', async () => {
    let deepCalls = 0
    const many = Array.from({ length: 20 }, (_, i) => paper(String(i)))
    const d = deps({
      listPapers: async () => many,
      llm: async (prompt: string) => {
        if (prompt.includes('reproducibility')) { deepCalls++; return deepJson }
        return '{"score": 0.7, "reason": "ok"}'
      },
    })
    const r = await evaluate(d.value)
    expect(deepCalls).toBeLessThanOrEqual(6)
    expect(r.deep).toBe(deepCalls)
    expect(r.assessed).toBe(20)
  })

  it('잠금을 잡지 못하면 아무것도 하지 않는다', async () => {
    const d = deps({ lock: async () => false })
    const r = await evaluate(d.value)
    expect(r.assessed).toBe(0)
    expect(d.saved).toHaveLength(0)
  })

  it('평가할 논문이 없으면 조용히 끝난다', async () => {
    const d = deps({ listPapers: async () => [] })
    const r = await evaluate(d.value)
    expect(r.assessed).toBe(0)
  })

  it('저널 게재가 확인되면 검증 트랙으로 저장한다', async () => {
    const d = deps({
      listPapers: async () => [paper('1')],
      fetchWork: async () => ({
        cited_by_count: 5,
        primary_location: { source: { display_name: 'Nature', type: 'journal' } },
        authorships: [{ author: { display_name: 'Jane Doe' } }],
      }),
    })
    await evaluate(d.value)
    const [row] = d.saved
    if (row === undefined) throw new Error('저장된 판정이 없다')
    expect(row.track).toBe('verified')
  })
})
