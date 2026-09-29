import type { Evidence } from '@jogan/core'

/** 3, 87.5, 1,234 같은 것. 퍼센트 기호와 단위는 뗀 숫자만 본다 */
const NUMBER = /\d[\d,]*(?:\.\d+)?/g

/**
 * 근거 문장에 나온 수치가 원문에 실제로 있는지 대조한다 (CLAUDE.md 절대 규칙 1).
 *
 * LLM이 만들어낸 숫자를 막는 게 목적이다. 수치가 없는 문장("한계 섹션이 성실하다")은
 * 이 검사로 거를 수 없으므로 통과시킨다 — 그건 판단이지 사실 주장이 아니다.
 *
 * 표기가 다르면 막는다(87.5 vs 87.50). 느슨하게 맞추면 검사의 의미가 없다.
 */
export function verifyAgainstSource(sentence: string, source: string): boolean {
  const numbers = sentence.match(NUMBER)
  if (numbers === null) return true
  const normalizedSource = source.replace(/,/g, '')
  return numbers.every((n) => normalizedSource.includes(n.replace(/,/g, '')))
}

/** 검증에 실패한 문장은 버린다. 남은 게 없으면 빈 배열이고, 호출자가 점수를 null로 떨어뜨린다 */
export function keepVerifiedEvidence(items: Evidence[], source: string): Evidence[] {
  return items.filter((e) => verifyAgainstSource(e.text, source))
}
