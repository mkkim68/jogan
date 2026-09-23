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

/**
 * "recall@5 0.81 (베이스라인 0.66)" → { main: "recall@5 0.81 ", paren: "(베이스라인 0.66)" }
 * 끝에 괄호가 없으면 paren은 null. 값 문자열을 그대로 두 부분으로 나눌 뿐, 새 텍스트를 만들지 않는다.
 */
export function splitParenthetical(value: string): { main: string; paren: string | null } {
  const match = value.match(/^(.*?)\s*(\([^)]*\))\s*$/)
  if (!match) return { main: value, paren: null }
  return { main: match[1] ?? value, paren: match[2] ?? null }
}
