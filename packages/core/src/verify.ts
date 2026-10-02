import type { Evidence } from './assessment'

/** 3, 87.5, 1,234 같은 것. 퍼센트 기호와 단위는 뗀 숫자만 본다 */
const NUMBER = /\d[\d,]*(?:\.\d+)?/g

/** 전각 숫자(U+FF10~U+FF19, "０"~"９")를 ASCII로 되돌린다.
 *  \d는 ASCII 전용이라 정규화하지 않으면 전각 숫자로 적힌 수치는 "숫자가 없는
 *  문장"으로 오인되어 검사 없이 통과해버린다 — 이 검사에서는 실패가 열린 쪽(fail
 *  open)이면 안 된다. */
function normalizeFullWidthDigits(text: string): string {
  return text.replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
}

/** 표기 차이(쉼표) 하나만 지우고, 그 외 문자열은 그대로 둔다 — 87.5와 87.50은 여전히 다르다 */
function normalizeNumber(n: string): string {
  return n.replace(/,/g, '')
}

function numbersIn(text: string): string[] {
  const matches = normalizeFullWidthDigits(text).match(NUMBER)
  return matches === null ? [] : matches.map(normalizeNumber)
}

/**
 * 근거 문장에 나온 수치가 원문에 실제로 있는지 대조한다 (CLAUDE.md 절대 규칙 1).
 *
 * 원문에서도 같은 방식으로 숫자 토큰 집합을 뽑고, 문장의 각 숫자가 그 집합의
 * 원소와 **문자열이 정확히 같은지**(부분 문자열 포함이 아니라)를 검사한다.
 * `normalizedSource.includes(n)` 같은 부분 문자열 검사는 "12"를 "120"이나
 * "2012" 안에서 찾아버려 조작된 숫자를 통과시킨다 — 실제 논문 본문은 연도·표본
 * 수·퍼센트로 가득해서 이건 예외적인 경우가 아니라 흔한 경우다.
 *
 * 이 검사가 하는 일은 딱 하나뿐이다: 원문 어디에도 등장하지 않는 숫자 문자열을
 * 잡아낸다. 숫자가 문맥에 맞게 쓰였는지는 보지 않고, 숫자가 없는 조작된 주장
 * (예: 근거 없는 한계·의의 서술)에는 아무 의견도 없다. 수치가 없는 문장
 * ("한계 섹션이 성실하다")은 이 검사로 거를 수 없으므로 통과시킨다 — 그건 판단
 * 이지 사실 주장이 아니다.
 *
 * 표기가 다르면 막는다(87.5 vs 87.50). 느슨하게 맞추면 검사의 의미가 없다.
 *
 * **알려진 한계**: ASCII 숫자와 전각 숫자(０~９)만 정규화한다. 아랍-인도 숫자
 * (예: ٤٠)나 데바나가리 숫자(예: ४०) 같은 다른 문자 체계의 숫자는 감지하지
 * 못하고, 그런 숫자가 든 문장은 "수치가 없는 문장"으로 오인되어 무검증으로
 * 통과한다. 지금은 고치지 않고 알려진 구멍으로 남겨둔다.
 */
export function verifyAgainstSource(sentence: string, source: string): boolean {
  const sentenceNumbers = numbersIn(sentence)
  if (sentenceNumbers.length === 0) return true
  const sourceNumbers = new Set(numbersIn(source))
  return sentenceNumbers.every((n) => sourceNumbers.has(n))
}

/** 검증에 실패한 문장은 버린다. 남은 게 없으면 빈 배열이고, 호출자가 점수를 null로 떨어뜨린다 */
export function keepVerifiedEvidence(items: Evidence[], source: string): Evidence[] {
  return items.filter((e) => verifyAgainstSource(e.text, source))
}
