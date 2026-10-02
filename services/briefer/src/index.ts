import { pathToFileURL } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import {
  BRIEFER_LOCK_KEY,
  BRIEF_MAX_SUMMARY_ATTEMPTS,
  READ_CHARS_PER_MINUTE,
  createHttpClient,
  fetchFullText,
} from '@jogan/core'
import type { BriefCandidate, NewBriefItemRow } from '@jogan/db'
import { config } from 'dotenv'
import { fitsConstraints, rankCandidates } from './rank'
import { summarizePaper, type LlmFn, type SummaryDraft, type SummaryInput } from './summarize'
import { verifySummary } from './verify-summary'

config({ path: ['.env', '../../.env'], quiet: true })

function log(stage: string, msg: string): void {
  console.log(`[briefer:${stage}] ${msg}`)
}

// @jogan/db는 import 시점에 DATABASE_URL을 요구한다 — 주입만 쓰는 테스트가 DB를 밟지 않게 호출 시점에 불러온다
const loadDb = () => import('@jogan/db')

/** 비용을 HISTORY.md에 남기기 위한 누계 */
const usage = { calls: 0, input: 0, output: 0 }

function anthropicLlm(): LlmFn {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY가 없다. 요약(briefer)에 필요하다.')
  const client = new Anthropic({ apiKey: key })
  return async (prompt, input) => {
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      // 상한일 뿐 요금은 실제 출력만큼이다. 2048에서 evaluator 응답이 잘렸다(HISTORY 2026-10-01)
      max_tokens: 16000,
      system: prompt,
      messages: [{ role: 'user', content: input }],
    })
    usage.calls++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    if (res.stop_reason === 'max_tokens') log('llm', `max_tokens에서 잘렸다 (출력 ${res.usage.output_tokens} 토큰)`)
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  }
}

export type BriefDeps = {
  listUserIds?: () => Promise<string[]>
  /** KST 기준 브리핑 날짜. 주입하지 않으면 todayInSeoul() */
  today?: string
  hasBrief?: (userId: string, date: string) => Promise<boolean>
  listCandidates?: (userId: string) => Promise<BriefCandidate[]>
  fetchBody?: (arxivId: string) => Promise<string | null>
  summarize?: (input: SummaryInput) => Promise<SummaryDraft | null>
  nextIssue?: (userId: string) => Promise<number>
  saveBrief?: (
    brief: { userId: string; date: string; issueNumber: number; readMinutes: number },
    items: NewBriefItemRow[],
  ) => Promise<string>
}

/** 요약 글자 수 ÷ 500, 올림, 최소 1 (ADR 0002 D7) */
export function readMinutesOf(items: NewBriefItemRow[]): number {
  const chars = items.reduce(
    (sum, i) =>
      sum +
      i.oneLine.length +
      i.whyItMatters.length +
      i.method.length +
      i.results.reduce((s, r) => s + r.label.length + r.value.length, 0) +
      i.limitations.reduce((s, l) => s + l.text.length, 0) +
      i.quotes.reduce((s, q) => s + q.text.length, 0),
    0,
  )
  return Math.max(1, Math.ceil(chars / READ_CHARS_PER_MINUTE))
}

/**
 * 사용자마다 오늘 브리핑을 만든다 (ADR 0002).
 * 순위대로 후보를 보며 지면 제약(편수·프리프린트·관심사)에 맞는 것만 요약하고, 사실 검증에서
 * 한 줄 요약이나 "그래서 뭐?"가 떨어지면 그 논문을 빼고 다음 순위로 자리를 채운다.
 * 사용자 단위·논문 단위로 격리한다. 요약을 시도했는데 응답이 하나도 없으면 단계 장애로 보고 던진다.
 */
export async function buildBriefs(
  deps: BriefDeps = {},
): Promise<{ built: number; skipped: number; empty: number; failedUsers: number }> {
  const listUserIds = deps.listUserIds ?? (async () => (await loadDb()).listUserIds())
  const today = deps.today ?? (await loadDb()).todayInSeoul()
  const hasBrief = deps.hasBrief ?? (async (u: string, d: string) => (await loadDb()).hasBriefForDate(u, d))
  const listCandidates = deps.listCandidates ?? (async (u: string) => (await loadDb()).listBriefCandidates(u))
  const nextIssue = deps.nextIssue ?? (async (u: string) => (await loadDb()).nextIssueNumber(u))
  const saveBrief =
    deps.saveBrief ??
    (async (b: Parameters<NonNullable<BriefDeps['saveBrief']>>[0], items: NewBriefItemRow[]) =>
      (await loadDb()).insertBrief(b, items))
  let fetchBody = deps.fetchBody
  if (!fetchBody) {
    const arxiv = createHttpClient({ minIntervalMs: 3000, maxRetries: 2, timeoutMs: 90_000 }, {})
    fetchBody = (id: string) => fetchFullText(arxiv, id)
  }
  let summarize = deps.summarize
  if (!summarize) {
    const llm = anthropicLlm()
    summarize = (input) =>
      summarizePaper(llm, input, (f) =>
        log('summary', `응답 ${f.kind} 실패 (${input.title.slice(0, 60)}): ${f.detail}\n--- 응답 원문 ---\n${f.raw.slice(0, 1000)}\n---`),
      )
  }

  let built = 0
  let skipped = 0
  let empty = 0
  let failedUsers = 0
  let attempted = 0
  let answered = 0

  for (const userId of await listUserIds()) {
    try {
      if (await hasBrief(userId, today)) {
        skipped++
        log('brief', `사용자 ${userId}: ${today} 브리핑이 이미 있어 건너뜀`)
        continue
      }
      const ranked = rankCandidates(await listCandidates(userId))
      const accepted: BriefCandidate[] = []
      const items: NewBriefItemRow[] = []
      let dropped = 0
      let userAttempts = 0
      for (const c of ranked) {
        if (!fitsConstraints(accepted, c)) continue
        if (userAttempts >= BRIEF_MAX_SUMMARY_ATTEMPTS) {
          log('brief', `사용자 ${userId}: 요약 시도 상한 ${BRIEF_MAX_SUMMARY_ATTEMPTS}회에 도달해 멈춘다`)
          break
        }
        userAttempts++
        const body = c.arxivId === null ? null : await fetchBody(c.arxivId).catch(() => null)
        attempted++
        let draft: SummaryDraft | null
        try {
          draft = await summarize({ title: c.title, abstract: c.abstract, body, evidence: c.evidence, caveats: c.caveats })
        } catch (err) {
          log('summary', `요약 호출 실패로 건너뜀 ${c.paperId}: ${String(err)}`)
          continue
        }
        if (draft === null) continue
        answered++
        // 본문을 못 받았으면 초록이 원문이다. 모델은 제목도 보므로 제목에만 있는 이름도 검증 대상 원문이다
        const verified = verifySummary(draft, `${c.title}\n\n${body ?? c.abstract}`, body === null ? '초록' : '본문')
        if (verified === null) {
          log('verify', `한 줄 요약 또는 "그래서 뭐?"가 원문과 맞지 않아 제외 ${c.paperId}`)
          continue
        }
        dropped += verified.dropped
        accepted.push(c)
        items.push({
          position: items.length,
          paperId: c.paperId,
          interestId: c.interestId,
          oneLine: verified.oneLine,
          whyItMatters: verified.whyItMatters,
          method: verified.method,
          results: verified.results,
          limitations: verified.limitations,
          quotes: verified.quotes,
          isSerendipity: false,
        })
      }

      if (items.length === 0) {
        empty++
        log('brief', `사용자 ${userId}: 배달할 논문이 없어 브리핑을 만들지 않는다 (후보 ${ranked.length}편)`)
        continue
      }
      const issueNumber = await nextIssue(userId)
      await saveBrief({ userId, date: today, issueNumber, readMinutes: readMinutesOf(items) }, items)
      built++
      log('brief', `사용자 ${userId}: 제${issueNumber}호 ${items.length}편 (후보 ${ranked.length}편, 검증으로 버린 문장·항목 ${dropped}개)`)
    } catch (err) {
      failedUsers++
      log('brief', `사용자 ${userId} 처리 실패로 건너뜀: ${String(err)}`)
    }
  }

  if (attempted > 0 && answered === 0) {
    throw new Error(`요약이 전량 실패했다 (${attempted}건 시도, 응답 0건). Anthropic 키/크레딧/네트워크를 확인할 것.`)
  }
  return { built, skipped, empty, failedUsers }
}

async function main(): Promise<void> {
  const started = Date.now()
  if (!(await (await loadDb()).tryAdvisoryLock(BRIEFER_LOCK_KEY))) {
    log('lock', '다른 briefer 실행이 돌고 있다 — 이번 실행은 비켜준다')
    return
  }
  const r = await buildBriefs()
  log(
    'done',
    `브리핑 ${r.built}부 · 건너뜀 ${r.skipped} · 빈 날 ${r.empty} · 실패 사용자 ${r.failedUsers} · ` +
      `${((Date.now() - started) / 1000).toFixed(1)}초 · LLM ${usage.calls}회 · 입력 ${usage.input} · 출력 ${usage.output} 토큰`,
  )
  if (r.failedUsers > 0) throw new Error(`사용자 ${r.failedUsers}명의 브리핑을 만들지 못했다 (위 로그 참고)`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // DB 풀이 이벤트 루프를 붙잡는다 — 명시적으로 끝낸다
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err)
      process.exit(1)
    })
}
