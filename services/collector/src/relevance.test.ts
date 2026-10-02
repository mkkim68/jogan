import { describe, expect, it } from 'vitest'
import { judgeRelevance, loadRelevancePrompt, promptHash, relevanceJudgeVersion, type JudgeFailure } from './relevance'

const paper = { title: 'Sleep spindles and memory', abstract: 'We record sleep spindles in 40 adults.' }

describe('loadRelevancePrompt', () => {
  it('프롬프트를 파일에서 읽는다 (코드에 인라인하지 않는다)', () => {
    const p = loadRelevancePrompt()
    expect(p).toContain('relevant')
    expect(p.length).toBeGreaterThan(200)
  })
})

describe('판정 버전', () => {
  it('프롬프트 내용이 같으면 해시가 같고, 한 글자만 달라도 바뀐다', () => {
    expect(promptHash('기준 A')).toBe(promptHash('기준 A'))
    expect(promptHash('기준 A')).not.toBe(promptHash('기준 B'))
    expect(promptHash('기준 A')).toMatch(/^[0-9a-f]{12}$/)
  })

  it('현재 버전은 판정 모델과 프롬프트 파일의 해시다', () => {
    expect(relevanceJudgeVersion()).toEqual({
      model: 'claude-haiku-4-5-20251001',
      promptHash: promptHash(loadRelevancePrompt()),
    })
  })
})

describe('judgeRelevance', () => {
  it('정상 JSON을 판정으로 돌려준다', async () => {
    const llm = async () => '{"relevant": true, "reason": "수면 중 기억 공고화를 직접 다룬다"}'
    expect(await judgeRelevance(llm, '수면과 기억 공고화', paper)).toEqual({
      relevant: true,
      reason: '수면 중 기억 공고화를 직접 다룬다',
    })
  })

  it('JSON 앞에 문장이 붙어 와도 읽는다', async () => {
    const llm = async () => '판정하겠습니다.\n{"relevant": false, "reason": "단어만 겹친다"}'
    expect(await judgeRelevance(llm, '수면과 기억 공고화', paper)).toEqual({ relevant: false, reason: '단어만 겹친다' })
  })

  it('코드블록으로 감싼 JSON도 벗겨서 읽는다', async () => {
    const llm = async () => '```json\n{"relevant": false, "reason": "단어만 겹친다"}\n```'
    expect(await judgeRelevance(llm, '수면과 기억 공고화', paper)).toEqual({ relevant: false, reason: '단어만 겹친다' })
  })

  it('필드가 빠지면 null이다', async () => {
    expect(await judgeRelevance(async () => '{"relevant": true}', 'x', paper)).toBeNull()
  })

  it('reason이 빈 문자열이면 null이다', async () => {
    expect(await judgeRelevance(async () => '{"relevant": true, "reason": ""}', 'x', paper)).toBeNull()
  })

  it('JSON이 아니면 null이다', async () => {
    expect(await judgeRelevance(async () => '관련 있어 보입니다', 'x', paper)).toBeNull()
  })

  it('llm이 던지면 null이다 (호출자가 보류로 처리한다)', async () => {
    const llm = async (): Promise<string> => {
      throw new Error('529 overloaded')
    }
    expect(await judgeRelevance(llm, 'x', paper)).toBeNull()
  })

  it('입력에 관심사 라벨·제목·초록이 모두 들어가고, 프롬프트는 파일 내용이다', async () => {
    let seenPrompt = ''
    let seenInput = ''
    const llm = async (prompt: string, input: string) => {
      seenPrompt = prompt
      seenInput = input
      return '{"relevant": true, "reason": "r"}'
    }
    await judgeRelevance(llm, '수면과 기억 공고화', paper)
    expect(seenPrompt).toBe(loadRelevancePrompt())
    expect(seenInput).toContain('수면과 기억 공고화')
    expect(seenInput).toContain(paper.title)
    expect(seenInput).toContain(paper.abstract)
  })
})

describe('judgeRelevance — failure callbacks', () => {
  it('llm이 던지면 onFailure(llm)을 호출한다', async () => {
    let failure: JudgeFailure | null = null
    const llm = async (): Promise<string> => {
      throw new Error('529 overloaded')
    }
    await judgeRelevance(llm, 'x', paper, (f) => {
      failure = f
    })
    expect(failure).not.toBeNull()
    expect(failure!.kind).toBe('llm')
    expect(failure!.detail).toContain('529 overloaded')
  })

  it('JSON 파싱이 실패하면 onFailure(json)을 호출한다', async () => {
    let failure: JudgeFailure | null = null
    const llm = async () => '{{ invalid json'
    await judgeRelevance(llm, 'x', paper, (f) => {
      failure = f
    })
    expect(failure).not.toBeNull()
    expect(failure!.kind).toBe('json')
    expect(failure!.detail).toContain('JSON')
    expect(failure!.raw).toBe('{{ invalid json')
  })

  it('스키마 검증이 실패하면 onFailure(schema)를 호출한다', async () => {
    let failure: JudgeFailure | null = null
    const llm = async () => '{"relevant": true}'
    await judgeRelevance(llm, 'x', paper, (f) => {
      failure = f
    })
    expect(failure).not.toBeNull()
    expect(failure!.kind).toBe('schema')
    expect(failure!.detail).toContain('reason')
    expect(failure!.raw).toBe('{"relevant": true}')
  })

  it('onFailure 콜백이 선택사항이다', async () => {
    const llm = async () => '{"relevant": true, "reason": "r"}'
    expect(await judgeRelevance(llm, 'x', paper)).toEqual({ relevant: true, reason: 'r' })
  })
})
