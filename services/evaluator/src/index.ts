import { pathToFileURL } from 'node:url'
import {
  EVALUATOR_LOCK_KEY,
  EVAL_MAX_PER_RUN,
  OPENALEX_MIN_INTERVAL_MS,
  TRIAGE_DEEP_CUT,
  createHttpClient,
  fetchFullText,
  type Evidence,
} from '@jogan/core'
import type { NewAssessment, UnassessedPaper } from '@jogan/db'
import Anthropic from '@anthropic-ai/sdk'
import { config } from 'dotenv'
import { runStage1 } from './stage1'
import { fetchOpenAlexByArxivId, fieldFromCategories, parseOpenAlexWork, toStage2 } from './stage2'
import { deepEval, triage, type LlmFn } from './stage3'

config({ path: ['.env', '../../.env'], quiet: true })

function log(stage: string, msg: string): void {
  console.log(`[evaluator:${stage}] ${msg}`)
}

// @jogan/db는 import 시점에 DATABASE_URL을 요구한다. 정적으로 최상단에서 가져오면
// 의존성을 전부 주입받아 DB를 한 번도 건드리지 않는 순수 오케스트레이션 테스트까지
// DB 설정을 강요당한다(collector와 같은 이유). 그래서 실제 구현은 호출 시점에
// 동적으로 불러온다 — 주입된 의존성만 쓰는 테스트는 이 경로를 아예 밟지 않는다.
async function loadDb() {
  return import('@jogan/db')
}

export type EvaluateDeps = {
  listPapers?: (limit: number) => Promise<UnassessedPaper[]>
  saveAssessment?: (row: NewAssessment) => Promise<void>
  fetchWork?: (arxivId: string) => Promise<unknown | null>
  fetchBody?: (arxivId: string) => Promise<string | null>
  llm?: LlmFn
  lock?: () => Promise<boolean>
  mailto?: string
}

// 실제 비용을 HISTORY.md에 남기기 위한 누계. main이 끝날 때 한 번 찍는다
const usage = { calls: 0, input: 0, output: 0 }

function anthropicLlm(): LlmFn {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY가 없다. .env에 넣어라 (console.anthropic.com에서 발급)')
  const client = new Anthropic({ apiKey: key })
  return async (prompt, input) => {
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      // 상한일 뿐 요금은 실제 출력만큼이다. 2048에서는 한국어 근거가 긴 본문 평가가 JSON 중간에
      // 잘렸다(HISTORY 2026-10-01). 이 모델은 기본으로 thinking을 하고 그 토큰도 여기서 빠진다
      max_tokens: 16000,
      system: prompt,
      messages: [{ role: 'user', content: input }],
    })
    usage.calls++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    // 잘린 JSON은 파싱에 실패해 조용히 null이 된다 — 원인이 여기라는 걸 로그로 남긴다
    if (res.stop_reason === 'max_tokens') log('llm', `max_tokens에서 잘렸다 (출력 ${res.usage.output_tokens} 토큰)`)
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  }
}

/**
 * ①규칙 → ②OpenAlex → ③a 트리아지 → ③b 본문 정밀.
 * 논문 하나가 실패해도 나머지를 계속한다 (CLAUDE.md).
 */
export async function evaluate(deps: EvaluateDeps = {}): Promise<{ assessed: number; failed: number; deep: number }> {
  const lock = deps.lock ?? (async () => (await loadDb()).tryAdvisoryLock(EVALUATOR_LOCK_KEY))
  if (!(await lock())) {
    log('lock', '다른 평가 실행이 돌고 있다 — 이번 실행은 비켜준다')
    return { assessed: 0, failed: 0, deep: 0 }
  }

  const listPapers = deps.listPapers ?? (async (n: number) => (await loadDb()).listUnassessedCandidatePapers(n))
  const saveAssessment = deps.saveAssessment ?? (async (r: NewAssessment) => (await loadDb()).upsertAssessment(r))
  const mailto = deps.mailto ?? process.env.OPENALEX_MAILTO ?? ''

  const openalex = createHttpClient({ minIntervalMs: OPENALEX_MIN_INTERVAL_MS, maxRetries: 2, timeoutMs: 30_000 }, {})
  const arxiv = createHttpClient({ minIntervalMs: 3000, maxRetries: 2, timeoutMs: 90_000 }, {})
  const fetchWork = deps.fetchWork ?? ((id: string) => fetchOpenAlexByArxivId(openalex, id, mailto))
  const fetchBody = deps.fetchBody ?? ((id: string) => fetchFullText(arxiv, id))

  const papers = await listPapers(EVAL_MAX_PER_RUN)
  if (papers.length === 0) {
    log('done', '평가할 후보가 없다')
    return { assessed: 0, failed: 0, deep: 0 }
  }
  log('start', `후보 ${papers.length}편`)

  const llm = deps.llm ?? anthropicLlm()

  // ①②③a — 통과한 것만 모아 순위를 매긴다
  type Pending = {
    paper: UnassessedPaper
    row: NewAssessment
    evidence: Evidence[]
    caveats: string[]
    score: number
  }
  const pending: Pending[] = []
  let assessed = 0
  let failed = 0

  for (const p of papers) {
    try {
      const s1 = runStage1({ title: p.title, abstract: p.abstract, authors: p.authors, doi: p.doi })
      const field = fieldFromCategories(p.categories)

      if (!s1.stage1.passed) {
        await saveAssessment({
          paperId: p.id,
          track: 'notable',
          field,
          stage1: s1.stage1,
          stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
          stage3: null,
          stage4: null,
          evidence: s1.evidence,
          caveats: s1.caveats,
        })
        assessed++
        continue
      }

      const work = p.arxivId === null ? null : await fetchWork(p.arxivId).catch(() => null)
      const s2 = toStage2(parseOpenAlexWork(work))
      const score = (await triage(llm, p)) ?? 0

      pending.push({
        paper: p,
        row: {
          paperId: p.id,
          track: s2.track,
          field,
          stage1: s1.stage1,
          stage2: s2.stage2,
          stage3: null,
          stage4: null,
          evidence: [...s1.evidence, ...s2.evidence],
          caveats: [...s1.caveats, ...s2.caveats],
        },
        evidence: [...s1.evidence, ...s2.evidence],
        caveats: [...s1.caveats, ...s2.caveats],
        score,
      })
    } catch (err) {
      failed++
      log('stage', `평가 실패로 건너뜀 ${p.id}: ${String(err)}`)
    }
  }

  // ③b — 상위 몇 편만 본문을 읽는다
  const ranked = [...pending].sort((a, b) => b.score - a.score)
  const deepSet = new Set(ranked.slice(0, TRIAGE_DEEP_CUT).map((x) => x.paper.id))
  log('stage3', `본문 평가 대상: ${ranked.slice(0, TRIAGE_DEEP_CUT).map((x) => `${x.paper.arxivId ?? x.paper.id}(${x.score})`).join(', ')}`)
  let deep = 0

  for (const item of pending) {
    try {
      if (deepSet.has(item.paper.id)) {
        const body = item.paper.arxivId === null ? null : await fetchBody(item.paper.arxivId)
        const d = await deepEval(llm, item.paper, body, (f) =>
          log('stage3', `본문 평가 응답 ${f.kind} 실패 ${item.paper.id}: ${f.detail}\n--- 응답 원문 ---\n${f.raw}\n---`),
        )
        if (d === null) log('stage3', `본문 평가 응답을 쓰지 못해 ③단계 없이 저장 ${item.paper.id}`)
        if (d !== null) {
          item.row.stage3 = d.stage3
          item.row.evidence = [...item.evidence, ...d.evidence]
          item.row.caveats = [...item.caveats, ...d.caveats]
          deep++
        }
      }
      await saveAssessment(item.row)
      assessed++
    } catch (err) {
      failed++
      log('stage3', `정밀 평가 실패로 건너뜀 ${item.paper.id}: ${String(err)}`)
    }
  }

  log('done', `판정 ${assessed}편 · 본문 평가 ${deep}편 · 실패 ${failed}편`)
  return { assessed, failed, deep }
}

async function main(): Promise<void> {
  const started = Date.now()
  const r = await evaluate()
  log('done', `${((Date.now() - started) / 1000).toFixed(1)}초 · LLM ${usage.calls}회 · 입력 ${usage.input} · 출력 ${usage.output} 토큰`)
  if (r.assessed === 0 && r.failed > 0) throw new Error('전부 실패했다 — API 키나 연결을 확인해라')
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // DB 풀이 열린 채로 남아 이벤트 루프를 붙잡는다 — 명시적으로 끝내지 않으면 프로세스가 안 끝난다
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err)
      process.exit(1)
    })
}
