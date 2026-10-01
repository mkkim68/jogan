import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export type LlmFn = (prompt: string, input: string) => Promise<string>
export type Judgment = { relevant: boolean; reason: string }
export type LlmUsage = { calls: number; input: number; output: number }

/** 예/아니오 판정이라 가장 싼 모델로 충분하다. relevance_judgments.model에 그대로 저장된다 */
export const RELEVANCE_MODEL = 'claude-haiku-4-5-20251001'

const PROMPT_PATH = join(import.meta.dirname, '..', 'prompts', 'relevance.md')

/** 프롬프트는 파일로 둔다 (CLAUDE.md). 변경이 diff로 보여야 한다 */
export function loadRelevancePrompt(): string {
  return readFileSync(PROMPT_PATH, 'utf8')
}

const Out = z.object({ relevant: z.boolean(), reason: z.string().min(1) })

/** LLM이 코드블록으로 감싸는 일이 흔하다 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  try {
    return JSON.parse((fenced?.[1] ?? raw).trim())
  } catch {
    return null
  }
}

/**
 * 논문이 관심사의 연구 주제 자체를 다루는지 판정한다 (ADR 0001).
 * 응답을 못 읽거나 호출이 던지면 null — 호출자는 이 쌍을 **보류**한다(후보에도 캐시에도 넣지 않는다).
 */
export async function judgeRelevance(
  llm: LlmFn,
  interestLabel: string,
  paper: { title: string; abstract: string },
): Promise<Judgment | null> {
  let raw: string
  try {
    raw = await llm(loadRelevancePrompt(), `관심사: ${interestLabel}\n\n# ${paper.title}\n\n${paper.abstract}`)
  } catch {
    return null
  }
  const parsed = Out.safeParse(extractJson(raw))
  return parsed.success ? parsed.data : null
}

/**
 * 실제 Anthropic 호출. 재시도는 SDK(maxRetries 2)에 맡기고 순차로만 부른다.
 * 토큰 누계는 `usage`에 더한다 — 비용을 HISTORY.md에 남기기 위해서다.
 */
export function createRelevanceLlm(apiKey: string, usage: LlmUsage, onTruncated?: () => void): LlmFn {
  const client = new Anthropic({ apiKey, maxRetries: 2 })
  return async (system, input) => {
    const res = await client.messages.create({
      model: RELEVANCE_MODEL,
      max_tokens: 256,
      system,
      messages: [{ role: 'user', content: input }],
    })
    usage.calls++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    if (res.stop_reason === 'max_tokens') onTruncated?.()
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  }
}
