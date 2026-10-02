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

/** 라틴 문자 토큰. 하이픈·점으로 이어진 이름(GPT-4, Mann-Whitney, v1.2, Llama_3)을 유니코드로(Müller, Łukasz)을 한 덩어리로 본다 */
const LATIN_TOKEN = /\p{Script=Latin}[\p{Script=Latin}\p{N}]*(?:[-._][\p{Script=Latin}\p{N}]+)*/gu

/**
 * 문장에서 고유명사 후보를 뽑는다 — 대문자나 숫자가 섞인 라틴 토큰(BERT, ImageNet, GPT-4).
 * 소문자만인 토큰(baseline, robust)은 일반 단어로 보고 뺀다.
 * ADR 0002 D1의 **보조** 장치다: 요약 모델이 고유명사 목록에서 빠뜨린 것을 잡는다.
 * 한글로 음차한 고유명사는 못 잡는다 — ADR 0002 「결과」의 알려진 한계.
 */
export function extractLatinTerms(text: string): string[] {
  const found = new Set<string>()
  for (const token of text.match(LATIN_TOKEN) ?? []) {
    if (/[\p{Lu}\p{N}]/u.test(token)) found.add(token)
  }
  return [...found]
}

/** 대소문자·공백·하이픈 변형만 정규화한다 — 철자가 다르면 다른 이름이다. arXiv HTML은 비분리 하이픈(U+2011)을 쓴다 */
function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ')
}

const TOKEN_CHAR = /^[\p{Script=Latin}\p{N}]/u
const CONNECTOR_THEN_TOKEN = /^[-._][\p{Script=Latin}\p{N}]/u

/**
 * 원문에서 토큰 경계를 지켜 term이 나오는지. "BERT"가 "RoBERTa"에, "GPT-4"가 "GPT-4o"에
 * 부분 일치로 통과하면 지어낸 이름이 검증을 빠져나간다. 여러 번 나오면 하나라도 경계가 맞으면 통과.
 */
function containsToken(normalizedSource: string, normalizedTerm: string): boolean {
  let from = 0
  for (;;) {
    const at = normalizedSource.indexOf(normalizedTerm, from)
    if (at === -1) return false
    const before = at === 0 ? '' : [...normalizedSource.slice(Math.max(0, at - 2), at)].pop() ?? ''
    const rest = normalizedSource.slice(at + normalizedTerm.length)
    const beforeOk = before === '' || !TOKEN_CHAR.test(before)
    const afterOk = rest === '' || !(TOKEN_CHAR.test(rest) || CONNECTOR_THEN_TOKEN.test(rest))
    if (beforeOk && afterOk) return true
    from = at + 1
  }
}

/**
 * 고유명사 대조 (CLAUDE.md 절대 규칙 1, ADR 0002 D1).
 * 모델이 낸 `terms`와 문장에서 정규식으로 뽑은 라틴 토큰이 **전부** 원문에 있어야 한다.
 * 판단(무엇이 고유명사인가)은 모델에 맡기되 대조 자체는 기계적이다.
 */
export function verifyTerms(sentence: string, terms: string[], source: string): boolean {
  const normalizedSource = normalizeForMatch(source)
  const all = new Set([...terms.map((t) => t.trim()).filter((t) => t.length > 0), ...extractLatinTerms(sentence)])
  return [...all].every((t) => containsToken(normalizedSource, normalizeForMatch(t)))
}

/** 인용은 원문에 그대로 있어야 한다. 공백·대소문자 차이만 허용한다 */
export function verifyQuote(quote: string, source: string): boolean {
  const q = normalizeForMatch(quote).trim()
  return q.length > 0 && normalizeForMatch(source).includes(q)
}

/** 요약 문장 하나의 검증: 숫자(정확 일치) && 고유명사 */
export function verifySentence(sentence: string, terms: string[], source: string): boolean {
  return verifyAgainstSource(sentence, source) && verifyTerms(sentence, terms, source)
}
