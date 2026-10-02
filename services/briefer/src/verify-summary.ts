import { verifyQuote, verifySentence, type BriefItem } from '@jogan/core'
import type { SummaryDraft } from './summarize'

export type VerifiedSummary = {
  oneLine: string
  whyItMatters: string
  method: string
  results: BriefItem['results']
  limitations: BriefItem['limitations']
  quotes: BriefItem['quotes']
  /** 검증에 실패해 버린 문장·항목 수 — HISTORY.md에 남길 관측 자료 */
  dropped: number
}

/**
 * 요약 초안의 모든 문장을 원문과 대조한다 (CLAUDE.md 절대 규칙 1, ADR 0002 D1).
 * - `oneLine`·`whyItMatters`가 실패하면 null — 그 논문은 배달하지 않는다
 * - `method`는 문장 단위, `results`·`limitations`·`quotes`는 항목 단위로 실패한 것만 버린다
 * 숫자(정확 일치)와 고유명사(모델의 terms + 라틴 토큰 정규식)를 본다. 인용은 원문 그대로여야 한다.
 */
export function verifySummary(draft: SummaryDraft, source: string): VerifiedSummary | null {
  if (!verifySentence(draft.oneLine.text, draft.oneLine.terms, source)) return null
  if (!verifySentence(draft.whyItMatters.text, draft.whyItMatters.terms, source)) return null

  let dropped = 0
  const keep = <T>(items: T[], ok: (item: T) => boolean): T[] =>
    items.filter((item) => {
      const pass = ok(item)
      if (!pass) dropped++
      return pass
    })

  const method = keep(draft.method, (s) => verifySentence(s.text, s.terms, source))
  const results = keep(draft.results, (r) => verifySentence(`${r.label} ${r.value}`, r.terms, source))
  const limitations = keep(draft.limitations, (l) => verifySentence(l.text, l.terms, source))
  const quotes = keep(draft.quotes, (q) => verifyQuote(q.text, source))

  return {
    oneLine: draft.oneLine.text,
    whyItMatters: draft.whyItMatters.text,
    method: method.map((s) => s.text).join(' '),
    results: results.map(({ label, value }) => ({ label, value })),
    limitations: limitations.map(({ bySource, text }) => ({ bySource, text })),
    quotes,
    dropped,
  }
}
