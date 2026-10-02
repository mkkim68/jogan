import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { jsonBodyOf } from '@jogan/core'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export type LlmFn = (prompt: string, input: string) => Promise<string>
export type Judgment = { relevant: boolean; reason: string }
export type LlmUsage = { calls: number; input: number; output: number }

/** 판정 실패 원인. 응답 원문을 함께 넘겨 원인을 사후에 볼 수 있게 한다 */
export type JudgeFailure = { kind: 'llm' | 'json' | 'schema'; detail: string; raw?: string }

/** 예/아니오 판정이라 가장 싼 모델로 충분하다. relevance_judgments.model에 그대로 저장된다 */
export const RELEVANCE_MODEL = 'claude-haiku-4-5-20251001'

const PROMPT_PATH = join(import.meta.dirname, '..', 'prompts', 'relevance.md')

/** 프롬프트는 파일로 둔다 (CLAUDE.md). 변경이 diff로 보여야 한다 */
export function loadRelevancePrompt(): string {
  return readFileSync(PROMPT_PATH, 'utf8')
}

/** 프롬프트 내용의 짧은 해시. 판정 캐시의 버전으로 쓴다(`relevance_judgments.prompt_hash`) */
export function promptHash(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 12)
}

/**
 * 지금 판정 기준의 정체 — 모델과 프롬프트. 캐시는 이게 같을 때만 재사용한다.
 * 프롬프트를 고치면(예: 2026-10-02 "인접 분야" 기준을 좁힘) 옛 판정은 자동으로 다시 묻는다.
 */
export function relevanceJudgeVersion(): { model: string; promptHash: string } {
  return { model: RELEVANCE_MODEL, promptHash: promptHash(loadRelevancePrompt()) }
}

const Out = z.object({ relevant: z.boolean(), reason: z.string().min(1) })

/**
 * 논문이 관심사의 연구 주제 자체를 다루는지 판정한다 (ADR 0001).
 * 응답을 못 읽거나 호출이 던지면 null — 호출자는 이 쌍을 **보류**한다(후보에도 캐시에도 넣지 않는다).
 */
export async function judgeRelevance(
  llm: LlmFn,
  interestLabel: string,
  paper: { title: string; abstract: string },
  onFailure?: (failure: JudgeFailure) => void,
): Promise<Judgment | null> {
  let raw: string
  try {
    raw = await llm(loadRelevancePrompt(), `관심사: ${interestLabel}\n\n# ${paper.title}\n\n${paper.abstract}`)
  } catch (err) {
    onFailure?.({ kind: 'llm', detail: String(err) })
    return null
  }

  let json: unknown
  try {
    json = JSON.parse(jsonBodyOf(raw))
  } catch (err) {
    onFailure?.({ kind: 'json', detail: String(err), raw })
    return null
  }

  const parsed = Out.safeParse(json)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    onFailure?.({ kind: 'schema', detail, raw })
    return null
  }

  return parsed.data
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
