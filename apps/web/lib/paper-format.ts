import type { Author } from '@jogan/core'

/** "이름 (소속), 이름" — 소속이 없으면 이름만 */
export function formatAuthors(authors: Author[]): string {
  return authors.map((a) => (a.affiliation ? `${a.name} (${a.affiliation})` : a.name)).join(', ')
}

/** "2026년 9월 19일" (Asia/Seoul 기준) */
export function formatPublishedDate(date: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(date)
}

/** "9월 2일 저장" (Asia/Seoul 기준) — `/saved` 카드의 저장일 표시 */
export function formatSavedDate(date: Date): string {
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(date)
  return `${formatted} 저장`
}

/**
 * "recall@5 0.81 (베이스라인 0.66)" → { main: "recall@5 0.81 ", paren: "(베이스라인 0.66)" }
 * 끝에 괄호가 없으면 paren은 null. 값 문자열을 그대로 두 부분으로 나눌 뿐, 새 텍스트를 만들지 않는다.
 */
export function splitParenthetical(value: string): { main: string; paren: string | null } {
  const match = value.match(/^(.*?)\s*(\([^)]*\))\s*$/)
  if (!match) return { main: value, paren: null }
  return { main: match[1] ?? value, paren: match[2] ?? null }
}

const MATH_SYMBOLS: Record<string, string> = {
  times: '×',
  pm: '±',
  sim: '~',
  geq: '≥',
  ge: '≥',
  leq: '≤',
  le: '≤',
  approx: '≈',
  rightarrow: '→',
  to: '→',
  '%': '%',
}

/**
 * arXiv 초록의 인라인 LaTeX(`6.36$\times$`)를 화면용 글자(`6.36×`)로. 표시만 바꾼다 — DB의 초록과
 * 사실 검증 원문은 그대로다. 짧은 `$…$`만 건드리고, `$` 바로 안쪽이 공백이면 수식이 아니라 달러 금액으로 보고 둔다.
 */
export function plainMath(text: string): string {
  return text.replace(/\$(?=\S)([^$\n]{1,40}?)(?<=\S)\$/g, (_, inner: string) =>
    inner
      .replace(/\\([a-z]+|%)/gi, (m, name: string) => MATH_SYMBOLS[name] ?? m)
      .replace(/[{}]/g, '')
      .trim(),
  )
}
