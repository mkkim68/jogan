import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, Score, Stage3 } from '@jogan/core'
import { z } from 'zod'
import { keepVerifiedEvidence } from './verify'

export type LlmFn = (prompt: string, input: string) => Promise<string>

const PROMPT_DIR = join(import.meta.dirname, '..', 'prompts')

/** 프롬프트는 파일로 둔다 (CLAUDE.md). 변경이 diff로 보여야 한다 */
export function loadPrompt(name: 'triage' | 'deep-eval'): string {
  return readFileSync(join(PROMPT_DIR, `${name}.md`), 'utf8')
}

/** LLM이 코드블록으로 감싸는 일이 흔하다 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? raw).trim()
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const TriageOut = z.object({ score: z.number().min(0).max(1).nullable() })

export async function triage(llm: LlmFn, paper: { title: string; abstract: string }): Promise<number | null> {
  const raw = await llm(loadPrompt('triage'), `# ${paper.title}\n\n${paper.abstract}`)
  const parsed = TriageOut.safeParse(extractJson(raw))
  return parsed.success ? parsed.data.score : null
}

const ScoreOut = z.object({ value: z.number().min(0).max(1).nullable(), reason: z.string().min(1) })
const DeepOut = z.object({
  reproducibility: ScoreOut,
  design: ScoreOut,
  statistics: ScoreOut,
  claimVsEvidence: ScoreOut,
  limitations: ScoreOut,
  caveats: z.array(z.string()).default([]),
  evidence: z.array(z.object({ verdict: z.enum(['pass', 'caution']), text: z.string().min(1) })).default([]),
})

export type DeepResult = { stage3: Stage3; evidence: Evidence[]; caveats: string[] }

const BLANK: Score = { value: null, reason: '근거 문장이 원문 대조를 통과하지 못해 점수를 남기지 않는다' }

/**
 * 본문(없으면 초록)을 근거로 루브릭 5항목을 채운다.
 *
 * 절대 규칙 1: LLM이 돌려준 근거 문장의 수치를 원문과 대조하고, 실패한 문장은 버린다.
 * 문장이 전부 버려지면 그 논문의 ③단계 점수를 신뢰할 수 없으므로 **전부 null로 떨어뜨린다** —
 * 검증되지 않은 근거 위에 점수만 남기는 것이 절대 규칙 2가 금지하는 바로 그것이다.
 */
export async function deepEval(
  llm: LlmFn,
  paper: { title: string; abstract: string },
  fullText: string | null,
): Promise<DeepResult | null> {
  const body = fullText ?? paper.abstract
  const header = fullText === null ? '(본문을 받지 못했다. 초록만 주어진다.)\n\n' : ''
  const raw = await llm(loadPrompt('deep-eval'), `${header}# ${paper.title}\n\n${body}`)
  const parsed = DeepOut.safeParse(extractJson(raw))
  if (!parsed.success) return null
  const d = parsed.data

  const proposed: Evidence[] = d.evidence.map((e) => ({ stage: 3, verdict: e.verdict, text: e.text }))
  const kept = keepVerifiedEvidence(proposed, body)
  const dropped = proposed.length - kept.length

  const caveats = [...d.caveats]
  if (dropped > 0) caveats.push(`근거 문장 ${dropped}개가 원문과 대조에 실패해 버렸다`)
  if (fullText === null) caveats.push('본문을 받지 못해 초록만으로 평가했다')

  const verified = kept.length > 0
  const stage3: Stage3 = {
    reproducibility: verified ? d.reproducibility : BLANK,
    design: verified ? d.design : BLANK,
    statistics: verified ? d.statistics : BLANK,
    claimVsEvidence: verified ? d.claimVsEvidence : BLANK,
    limitations: verified ? d.limitations : BLANK,
    preregistered: null,
    studyDesign: null,
  }

  return { stage3, evidence: kept, caveats }
}
