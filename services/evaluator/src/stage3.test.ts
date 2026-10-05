import { describe, expect, it } from 'vitest'
import { deepEval, loadPrompt, triage } from './stage3'

const paper = { title: 'A Study', abstract: 'We evaluate on 12 datasets.' }
const source = 'We evaluate on 12 datasets with 3 seeds.'

const deepPayload = {
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
}
const deepJson = JSON.stringify(deepPayload)

/**
 * "전부 버려지면 전부 null" 테스트 전용 픽스처.
 * `deepPayload`는 statistics.value가 이미 null이라, statistics 필드만 가드를
 * 빼먹는 회귀는 값 비교로 잡히지 않는다(null과 null이 우연히 같아진다).
 * 다섯 필드 모두를 값 있는 상태로 채워서, 다섯 필드 각각의 가드가 실제로
 * 동작하는지 빠짐없이 검증한다.
 */
const allScoredPayload = {
  ...deepPayload,
  statistics: { value: 0.3, reason: '신뢰구간을 일부 보고했다' },
}

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

  // fix round 2 — dropped(0 - 0)는 0이라 "대조 실패" caveat이 안 뜬다. "안 냈다"와
  // "냈는데 걸러졌다"는 다른 상황이므로 다른 문구로 남겨야 한다
  it('근거 문장을 아예 안 내면, 걸러졌다는 caveat이 아니라 안 냈다는 caveat을 남긴다', async () => {
    const llm = async () => JSON.stringify({ ...deepPayload, evidence: [] })
    const r = await deepEval(llm, paper, source)
    const joined = r?.caveats.join(' ') ?? ''
    expect(joined).toContain('제시되지 않아')
    expect(joined).not.toContain('대조에 실패')
    expect(r?.stage3.reproducibility.value).toBeNull()
    expect(r?.stage3.reproducibility.reason).not.toContain('통과하지 못해')
  })

  it('근거 문장이 전부 버려지면 stage3 점수를 전부 null로 떨어뜨린다', async () => {
    const llm = async () =>
      JSON.stringify({
        ...allScoredPayload,
        evidence: [{ verdict: 'pass', text: '99개 데이터셋에서 검증했다' }],
      })
    const r = await deepEval(llm, paper, source)
    expect(r?.stage3.reproducibility.value).toBeNull()
    expect(r?.stage3.design.value).toBeNull()
    expect(r?.stage3.statistics.value).toBeNull()
    expect(r?.stage3.claimVsEvidence.value).toBeNull()
    expect(r?.stage3.limitations.value).toBeNull()
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

  // fix round 2 — 절대 규칙 2. 근거 문장 하나가 초록 대조를 통과해도(kept.length > 0),
  // 본문을 못 읽었다는 사실 자체가 채점을 막아야 한다. "검증 통과"가 "본문을 읽었다"를
  // 대신할 수 없다 — 안 그러면 모델이 준 5개 점수가 프롬프트 지시(요청일 뿐 보장이 아님)에만
  // 기대어 그대로 새어나간다.
  it('본문이 없으면 근거 문장이 검증을 통과해도 점수는 전부 null이다', async () => {
    const llm = async () =>
      JSON.stringify({
        ...allScoredPayload,
        evidence: [{ verdict: 'pass', text: '12개 데이터셋에서 검증했다' }],
      })
    const r = await deepEval(llm, paper, null)
    expect(r?.stage3.reproducibility.value).toBeNull()
    expect(r?.stage3.design.value).toBeNull()
    expect(r?.stage3.statistics.value).toBeNull()
    expect(r?.stage3.claimVsEvidence.value).toBeNull()
    expect(r?.stage3.limitations.value).toBeNull()
    expect(r?.stage3.reproducibility.reason).toContain('본문')
    expect(r?.caveats.join(' ')).toContain('본문')
    // 근거 문장 자체(초록 대비 검증된 사실 문장)는 여전히 정직하므로 살아남는다
    expect(r?.evidence.map((e) => e.text)).toEqual(['12개 데이터셋에서 검증했다'])
  })

  it('JSON 앞에 문장이 붙어 와도 본문을 읽는다 (2026-10-01 실측: "평가를 진행하겠습니다.")', async () => {
    const llm = async () => `평가를 진행하겠습니다.\n\n${deepJson}`
    const r = await deepEval(llm, paper, source)
    expect(r).not.toBeNull()
    expect(r?.stage3.reproducibility.value).toBe(0.8)
  })

  it('JSON이 닫히지 않은 잘린 응답은 여전히 json 실패다', async () => {
    const kinds: string[] = []
    const r = await deepEval(async () => `앞말\n${deepJson.slice(0, 40)}`, paper, source, (f) => kinds.push(f.kind))
    expect(r).toBeNull()
    expect(kinds).toEqual(['json'])
  })

  it('스키마에 맞지 않으면 null이다 (그 논문만 건너뛴다)', async () => {
    const llm = async () => '{"reproducibility": "높음"}'
    expect(await deepEval(llm, paper, source)).toBeNull()
  })

  it('JSON 문법이 깨지면 원문과 함께 "json" 실패를 알린다', async () => {
    const raw = '{"reproducibility": {"value": 0.5, "reason": "끝이 잘'
    const seen: { raw: string; kind: string; detail: string }[] = []
    expect(await deepEval(async () => raw, paper, source, (f) => seen.push(f))).toBeNull()
    expect(seen).toHaveLength(1)
    expect(seen[0]?.kind).toBe('json')
    expect(seen[0]?.raw).toBe(raw)
  })

  it('JSON은 맞는데 스키마가 다르면 어느 필드인지 "schema" 실패로 알린다', async () => {
    const llm = async () => JSON.stringify({ ...deepPayload, evidence: [{ verdict: 'fail', text: 'x' }] })
    const seen: { kind: string; detail: string }[] = []
    expect(await deepEval(llm, paper, source, (f) => seen.push(f))).toBeNull()
    expect(seen[0]?.kind).toBe('schema')
    expect(seen[0]?.detail).toContain('evidence.0.verdict')
  })

  it('LLM이 던지면 그대로 올린다 (호출자가 논문 단위로 건너뛴다)', async () => {
    const llm = async () => { throw new Error('rate limit') }
    await expect(deepEval(llm, paper, source)).rejects.toThrow('rate limit')
  })
})
