import { describe, expect, it } from 'vitest'
import { loadSummaryPrompt, summarizePaper, type ParseFailure } from './summarize'

const input = {
  title: 'A Study',
  abstract: 'We evaluate on ImageNet.',
  body: 'Full body. We reach 87.5 on ImageNet.',
  evidence: [{ stage: 3 as const, verdict: 'caution' as const, text: '다중 비교 보정이 없다' }],
  caveats: ['재현 환경이 명시되지 않았다'],
}

const draft = {
  oneLine: { text: 'ImageNet에서 87.5를 달성했다', terms: ['ImageNet'] },
  whyItMatters: { text: '기존보다 단순한 방법이다', terms: [] },
  method: [{ text: '단일 모델을 썼다', terms: [] }],
  results: [{ label: '정확도', value: '87.5', terms: [] }],
  limitations: [{ bySource: 'ai', text: '재현 환경이 명시되지 않았다', terms: [] }],
  quotes: [{ text: 'We reach 87.5 on ImageNet.', locator: '본문' }],
}

describe('loadSummaryPrompt', () => {
  it('프롬프트를 파일에서 읽는다', () => {
    const p = loadSummaryPrompt()
    expect(p).toContain('whyItMatters')
    expect(p).toContain('terms')
  })
})

describe('summarizePaper', () => {
  it('정상 JSON을 초안으로 돌려준다', async () => {
    const r = await summarizePaper(async () => JSON.stringify(draft), input)
    expect(r?.oneLine.text).toBe('ImageNet에서 87.5를 달성했다')
    expect(r?.quotes).toHaveLength(1)
  })

  it('앞에 문장이 붙은 JSON도 읽는다', async () => {
    const r = await summarizePaper(async () => `요약하겠습니다.\n${JSON.stringify(draft)}`, input)
    expect(r).not.toBeNull()
  })

  it('선택 필드가 빠지면 빈 배열로 채운다', async () => {
    const minimal = { oneLine: draft.oneLine, whyItMatters: draft.whyItMatters }
    const r = await summarizePaper(async () => JSON.stringify(minimal), input)
    expect(r?.method).toEqual([])
    expect(r?.quotes).toEqual([])
  })

  it('JSON이 깨지면 null과 json 실패', async () => {
    const seen: ParseFailure[] = []
    const r = await summarizePaper(async () => '{"oneLine": {"text": "잘', input, (f) => seen.push(f))
    expect(r).toBeNull()
    expect(seen[0]?.kind).toBe('json')
    expect(seen[0]?.raw).toContain('잘')
  })

  it('필수 필드가 없으면 null과 어느 필드인지 schema 실패', async () => {
    const seen: ParseFailure[] = []
    const r = await summarizePaper(async () => JSON.stringify({ oneLine: draft.oneLine }), input, (f) => seen.push(f))
    expect(r).toBeNull()
    expect(seen[0]?.kind).toBe('schema')
    expect(seen[0]?.detail).toContain('whyItMatters')
  })

  it('LLM이 던지면 그대로 올린다 (호출자가 논문 단위로 건너뛴다)', async () => {
    await expect(summarizePaper(async () => { throw new Error('529') }, input)).rejects.toThrow('529')
  })

  it('입력에 제목·본문·평가 단계의 관찰이 들어가고, 프롬프트는 파일 내용이다', async () => {
    let seenPrompt = ''
    let seenInput = ''
    await summarizePaper(async (p, i) => { seenPrompt = p; seenInput = i; return JSON.stringify(draft) }, input)
    expect(seenPrompt).toBe(loadSummaryPrompt())
    expect(seenInput).toContain('A Study')
    expect(seenInput).toContain('Full body.')
    expect(seenInput).toContain('다중 비교 보정이 없다')
    expect(seenInput).toContain('재현 환경이 명시되지 않았다')
  })

  it('본문이 없으면 초록만 원문으로 주고 그렇다고 알린다', async () => {
    let seenInput = ''
    await summarizePaper(async (_p, i) => { seenInput = i; return JSON.stringify(draft) }, { ...input, body: null })
    expect(seenInput).toContain('We evaluate on ImageNet.')
    expect(seenInput).toContain('초록만')
    expect(seenInput).not.toContain('Full body.')
  })
})
