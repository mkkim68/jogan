import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { jsonBodyOf, type Evidence } from '@jogan/core'
import { z } from 'zod'

export type LlmFn = (prompt: string, input: string) => Promise<string>
export type SummaryInput = { title: string; abstract: string; body: string | null; evidence: Evidence[]; caveats: string[] }
export type ParseFailure = { kind: 'json' | 'schema'; detail: string; raw: string }

const PROMPT_PATH = join(import.meta.dirname, '..', 'prompts', 'summary.md')

/** 프롬프트는 파일로 둔다 (CLAUDE.md) */
export function loadSummaryPrompt(): string {
  return readFileSync(PROMPT_PATH, 'utf8')
}

const Terms = z.array(z.string()).default([])
const Sentence = z.object({ text: z.string().min(1), terms: Terms })

export const SummaryDraft = z.object({
  oneLine: Sentence,
  whyItMatters: Sentence,
  method: z.array(Sentence).default([]),
  results: z.array(z.object({ label: z.string().min(1), value: z.string().min(1), terms: Terms })).default([]),
  limitations: z.array(z.object({ bySource: z.enum(['author', 'ai']), text: z.string().min(1), terms: Terms })).default([]),
  quotes: z.array(z.object({ text: z.string().min(1), locator: z.string() })).default([]),
})
export type SummaryDraft = z.infer<typeof SummaryDraft>

function renderInput(input: SummaryInput): string {
  const observed = [
    ...input.evidence.filter((e) => e.verdict === 'caution').map((e) => `- ${e.text}`),
    ...input.caveats.map((c) => `- ${c}`),
  ]
  const source =
    input.body === null
      ? `(본문을 받지 못했다. 초록만 주어진다.)\n\n${input.abstract}`
      : input.body
  return [
    `# ${input.title}`,
    '',
    '## 평가 단계의 관찰 (limitations의 "ai" 항목은 여기 있는 것만 쓴다)',
    observed.length > 0 ? observed.join('\n') : '- (없음)',
    '',
    '## 원문',
    source,
  ].join('\n')
}

/**
 * 논문 하나를 요약 초안으로 만든다. 검증은 하지 않는다 — `verifySummary`의 몫이다.
 * 응답을 못 읽으면 null이고, 왜 못 읽었는지(json/schema)를 응답 원문과 함께 `onFailure`로 알린다.
 * LLM 호출이 던지면 그대로 올린다(호출자가 그 논문만 건너뛴다).
 */
export async function summarizePaper(
  llm: LlmFn,
  input: SummaryInput,
  onFailure?: (failure: ParseFailure) => void,
): Promise<SummaryDraft | null> {
  const raw = await llm(loadSummaryPrompt(), renderInput(input))
  let json: unknown
  try {
    json = JSON.parse(jsonBodyOf(raw))
  } catch (err) {
    onFailure?.({ kind: 'json', detail: String(err), raw })
    return null
  }
  const parsed = SummaryDraft.safeParse(json)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    onFailure?.({ kind: 'schema', detail, raw })
    return null
  }
  return parsed.data
}
