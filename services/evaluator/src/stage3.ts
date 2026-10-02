import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { keepVerifiedEvidence, type Evidence, type Score, type Stage3 } from '@jogan/core'
import { z } from 'zod'

export type LlmFn = (prompt: string, input: string) => Promise<string>

const PROMPT_DIR = join(import.meta.dirname, '..', 'prompts')

/** 프롬프트는 파일로 둔다 (CLAUDE.md). 변경이 diff로 보여야 한다 */
export function loadPrompt(name: 'triage' | 'deep-eval'): string {
  return readFileSync(join(PROMPT_DIR, `${name}.md`), 'utf8')
}

/** LLM이 코드블록으로 감싸는 일이 흔하다 */
function fencedBody(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1] !== undefined) return fenced[1].trim()
  // 코드블록 없이 앞뒤에 말을 붙이기도 한다("평가를 진행하겠습니다." — HISTORY 2026-10-01).
  // 첫 `{`부터 마지막 `}`까지만 본다. 잘려서 닫히지 않은 응답은 그대로 JSON 실패로 남는다
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  return start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim()
}

function extractJson(raw: string): unknown {
  try {
    return JSON.parse(fencedBody(raw))
  } catch {
    return null
  }
}

/** 본문 평가 응답을 쓰지 못한 이유. 응답 원문을 함께 넘겨 원인을 사후에 볼 수 있게 한다 */
export type ParseFailure = { kind: 'json' | 'schema'; detail: string; raw: string }

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

/** 본문을 받지 못해 애초에 검증할 원문이 초록뿐이다 — 모델이 뭐라고 답하든 채점하지 않는다 */
const BLANK_NO_BODY: Score = { value: null, reason: '본문을 확인하지 못해 점수를 남기지 않는다' }
/** 모델이 근거 문장을 하나도 내지 않았다 — "냈는데 실패"와는 다른 상황이라 이유도 다르게 적는다 */
const BLANK_NO_EVIDENCE: Score = { value: null, reason: '근거 문장이 제시되지 않아 점수를 남기지 않는다' }
/** 근거 문장을 냈지만 전부 원문 대조에서 걸러졌다 */
const BLANK_VERIFICATION_FAILED: Score = {
  value: null,
  reason: '근거 문장이 원문 대조를 통과하지 못해 점수를 남기지 않는다',
}

/**
 * 본문(없으면 초록)을 근거로 루브릭 5항목을 채운다.
 *
 * 절대 규칙 1: LLM이 돌려준 근거 문장의 수치를 원문과 대조하고, 실패한 문장은 버린다.
 * 문장이 전부 버려지면 그 논문의 ③단계 점수를 신뢰할 수 없으므로 **전부 null로 떨어뜨린다** —
 * 검증되지 않은 근거 위에 점수만 남기는 것이 절대 규칙 2가 금지하는 바로 그것이다.
 *
 * 절대 규칙 2 (본문 없음): 본문을 못 받았을 때 "초록만 봤다"고 프롬프트에 적어 보내는 것은
 * 모델에 대한 **요청**일 뿐 **보장**이 아니다. 근거 문장 하나가 (우연히) 검증을 통과하면
 * `verified`가 true가 되어 모델이 준 5개 점수가 그대로 새어나갈 수 있다 — 본문을 읽지 않고
 * 내린 판단을 "봤다"고 기록하는 셈이라 절대 규칙 2 위반이다. 그래서 본문이 없으면 근거
 * 문장의 검증 결과와 무관하게 무조건 5개 항목을 전부 null로 떨어뜨린다. 근거 문장 자체는
 * (초록을 원문 삼아) 검증을 거쳐 그대로 보여준다 — 그건 "검증된 사실 문장"으로서 여전히 정직하다.
 */
export async function deepEval(
  llm: LlmFn,
  paper: { title: string; abstract: string },
  fullText: string | null,
  onInvalid?: (failure: ParseFailure) => void,
): Promise<DeepResult | null> {
  const noBody = fullText === null
  const body = fullText ?? paper.abstract
  const header = noBody ? '(본문을 받지 못했다. 초록만 주어진다.)\n\n' : ''
  const raw = await llm(loadPrompt('deep-eval'), `${header}# ${paper.title}\n\n${body}`)
  let json: unknown
  try {
    json = JSON.parse(fencedBody(raw))
  } catch (err) {
    onInvalid?.({ kind: 'json', detail: String(err), raw })
    return null
  }
  const parsed = DeepOut.safeParse(json)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    onInvalid?.({ kind: 'schema', detail, raw })
    return null
  }
  const d = parsed.data

  const proposed: Evidence[] = d.evidence.map((e) => ({ stage: 3, verdict: e.verdict, text: e.text }))
  const kept = keepVerifiedEvidence(proposed, body)
  const dropped = proposed.length - kept.length

  const caveats = [...d.caveats]
  if (proposed.length === 0) {
    caveats.push('근거 문장이 제시되지 않아 점수를 매기지 않았다')
  } else if (dropped > 0) {
    caveats.push(`근거 문장 ${dropped}개가 원문과 대조에 실패해 버렸다`)
  }
  if (noBody) caveats.push('본문을 받지 못해 초록만으로 평가했다')

  // 본문이 없으면 근거 검증 결과와 무관하게 무조건 blank — "검증 통과"가 "본문을 읽었다"를
  // 대신할 수 없다. 본문이 있을 때만 검증 통과 여부(kept.length > 0)로 채점 여부를 가른다.
  const blank = noBody ? BLANK_NO_BODY : proposed.length === 0 ? BLANK_NO_EVIDENCE : BLANK_VERIFICATION_FAILED
  const scored = !noBody && kept.length > 0
  const stage3: Stage3 = {
    reproducibility: scored ? d.reproducibility : blank,
    design: scored ? d.design : blank,
    statistics: scored ? d.statistics : blank,
    claimVsEvidence: scored ? d.claimVsEvidence : blank,
    limitations: scored ? d.limitations : blank,
    preregistered: null,
    studyDesign: null,
  }

  return { stage3, evidence: kept, caveats }
}
