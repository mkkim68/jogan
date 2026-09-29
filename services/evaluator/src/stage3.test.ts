import { describe, expect, it } from 'vitest'
import { deepEval, loadPrompt, triage } from './stage3'

const paper = { title: 'A Study', abstract: 'We evaluate on 12 datasets.' }
const source = 'We evaluate on 12 datasets with 3 seeds.'

const deepJson = JSON.stringify({
  reproducibility: { value: 0.8, reason: '코드 저장소가 명시돼 있다' },
  design: { value: 0.6, reason: '12개 데이터셋에서 평가했다' },
  statistics: { value: null, reason: '신뢰구간 보고를 찾지 못했다' },
  claimVsEvidence: { value: 0.7, reason: '주장이 결과 범위 안이다' },
  limitations: { value: 0.5, reason: '한계 섹션이 짧다' },
  caveats: ['재현 환경이 명시되지 않았다'],
  evidence: [
    { verdict: 'pass', text: '12개 데이터셋에서 검증했다' },
    { verdict: 'pass', text: '40개 데이터셋에서 검증했다' },
  ],
})

describe('loadPrompt', () => {
  it('프롬프트를 파일에서 읽는다 (코드에 인라인하지 않는다)', () => {
    expect(loadPrompt('triage').length).toBeGreaterThan(100)
    expect(loadPrompt('deep-eval')).toContain('reproducibility')
  })
})

describe('triage', () => {
  it('점수를 뽑는다', async () => {
    const llm = async () => '{"score": 0.72, "reason": "구체적이다"}'
    expect(await triage(llm, paper)).toBe(0.72)
  })

  it('코드블록으로 감싸 와도 파싱한다', async () => {
    const llm = async () => '```json\n{"score": 0.4, "reason": "막연하다"}\n```'
    expect(await triage(llm, paper)).toBe(0.4)
  })

  it('score가 null이면 null이다', async () => {
    const llm = async () => '{"score": null, "reason": "판단 불가"}'
    expect(await triage(llm, paper)).toBeNull()
  })

  it('JSON이 아니면 null이다 (그 논문만 건너뛴다)', async () => {
    const llm = async () => '미안하지만 판단할 수 없습니다'
    expect(await triage(llm, paper)).toBeNull()
  })

  it('범위를 벗어난 점수는 null이다', async () => {
    const llm = async () => '{"score": 1.5, "reason": "x"}'
    expect(await triage(llm, paper)).toBeNull()
  })
})

describe('deepEval', () => {
  it('루브릭 5항목을 채운다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, paper, source)
    expect(r?.stage3.reproducibility.value).toBe(0.8)
    expect(r?.stage3.statistics.value).toBeNull()
  })

  // 절대 규칙 1
  it('원문에 없는 수치가 든 근거 문장을 버린다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, paper, source)
    expect(r?.evidence.map((e) => e.text)).toEqual(['12개 데이터셋에서 검증했다'])
  })

  it('버려진 문장은 caveat으로 남긴다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, paper, source)
    expect(r?.caveats.join(' ')).toContain('원문과 대조')
  })

  it('근거 문장이 전부 버려지면 stage3 점수를 전부 null로 떨어뜨린다', async () => {
    const llm = async () =>
      JSON.stringify({
        ...JSON.parse(deepJson),
        evidence: [{ verdict: 'pass', text: '99개 데이터셋에서 검증했다' }],
      })
    const r = await deepEval(llm, paper, source)
    expect(r?.stage3.reproducibility.value).toBeNull()
    expect(r?.evidence).toEqual([])
  })

  it('본문이 없으면 그 사실을 caveat에 남긴다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, paper, null)
    expect(r?.caveats.join(' ')).toContain('본문')
  })

  it('본문이 없으면 초록을 대조 원문으로 쓴다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, { ...paper, abstract: 'We evaluate on 12 datasets.' }, null)
    expect(r?.evidence.map((e) => e.text)).toEqual(['12개 데이터셋에서 검증했다'])
  })

  it('스키마에 맞지 않으면 null이다 (그 논문만 건너뛴다)', async () => {
    const llm = async () => '{"reproducibility": "높음"}'
    expect(await deepEval(llm, paper, source)).toBeNull()
  })

  it('LLM이 던지면 그대로 올린다 (호출자가 논문 단위로 건너뛴다)', async () => {
    const llm = async () => { throw new Error('rate limit') }
    await expect(deepEval(llm, paper, source)).rejects.toThrow('rate limit')
  })
})
