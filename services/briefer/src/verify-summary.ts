import { findQuoteInSource, verifySentence, type BriefItem } from '@jogan/core'
import type { SummaryDraft } from './summarize'

/** ASCII 또는 전각 숫자 */
const HAS_DIGIT = /[0-9\uFF10-\uFF19]/

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
 * `results.value`에 숫자가 없으면("대폭 향상") 결과 수치가 아니므로 버린다. 인용은 원문의 표기로 저장한다.
 * 숫자(정확 일치)와 고유명사(모델의 terms + 라틴 토큰 정규식)를 본다. 인용은 원문 그대로여야 한다.
 */
export function verifySummary(draft: SummaryDraft, source: string, locatorFallback: string = '본문'): VerifiedSummary | null {
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
  const results = keep(draft.results, (r) => HAS_DIGIT.test(r.value) && verifySentence(`${r.label} ${r.value}`, r.terms, source))
  const limitations = keep(draft.limitations, (l) => verifySentence(l.text, l.terms, source))

  // 인용은 text 검증이 필수이고 원문의 표기로 저장한다. locator는 검증 실패 시 locatorFallback으로 대체한다 (절대 규칙 1)
  const quotes: BriefItem['quotes'] = []
  for (const q of draft.quotes) {
    const span = findQuoteInSource(q.text, source)
    if (span === null) {
      dropped++
      continue
    }
    const locatorOk = verifySentence(q.locator, [], source)
    if (!locatorOk) dropped++
    quotes.push({ text: span, locator: locatorOk ? q.locator : locatorFallback })
  }

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
