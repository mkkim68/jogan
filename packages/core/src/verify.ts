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

// 한/세 + 편/종은 공백이 있어야 수량어다("한편"·"세종"은 일반 단어). "분의"는 앞이 숫자·수사일 때만
// (대부분의·부분의·성분의 제외). 수사 '구'는 "구분의"(區分)와 겹쳐 뺀다.
const KOREAN_NUMERAL = new RegExp(
  [
    '(?<![가-힣])(?:한|세)\\s*(?:배|개|가지|번|명|차례|단계)',
    '(?<![가-힣])(?:한|세)\\s+(?:편|종)',
    '(?<![가-힣])(?:두|네|다섯|여섯|일곱|여덟|아홉|열|수십|수백|수천)\\s*(?:배|개|가지|번|명|편|차례|단계|종)',
    '절반',
    '(?:[0-9０-９]|(?<![가-힣])(?:[일이삼사오육칠팔십백천한두세네]+|다섯|여섯|일곱|여덟|아홉|열|만))\\s*분의',
  ].join('|'),
  'u',
)

/**
 * 한글 수량어("두 배", "다섯 개", "절반", "3분의 1")가 있는지. 이런 표현은 ASCII 숫자 대조를
 * 피해 가므로(F2), 요약은 원문의 숫자 표기를 그대로 써야 하고 수량어가 든 문장은 검증에서 실패한다.
 */
export function hasKoreanNumeral(text: string): boolean {
  return KOREAN_NUMERAL.test(text)
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
  // 한글 수량어(두 배, 다섯 개, 절반)는 원문 숫자와 대조할 수 없다 — 닫힌 쪽으로 실패시킨다
  if (hasKoreanNumeral(sentence)) return false
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
const LATIN_TOKEN = /[\p{N}]*\p{Script=Latin}[\p{Script=Latin}\p{N}]*(?:[-._][\p{Script=Latin}\p{N}]+)*/gu

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

const QUOTE_MIN_WORDS = 6

/**
 * 인용을 원문에서 찾아 **원문 자신의 표기**(대소문자·문자 그대로, 공백만 한 칸)로 돌려준다. 없으면 null.
 * 대소문자·공백·하이픈 차이만 허용하고, 시작과 끝이 라틴 토큰 경계에 맞아야 하며 6단어 이상이어야 한다 —
 * "We do not improve robustness"에서 "improve robustness"만 떼면 뜻이 뒤집히기 때문이다 (F4).
 */
export function findQuoteInSource(quote: string, source: string): string | null {
  const q = normalizeForMatch(quote).trim()
  if (q.length === 0 || q.split(' ').length < QUOTE_MIN_WORDS) return null

  // 정규화한 원문과 원본 인덱스의 대응을 만든다 (normalizeForMatch와 같은 규칙을 글자 단위로)
  let norm = ''
  const origIndex: number[] = []
  let prevSpace = false
  for (let i = 0; i < source.length; ) {
    const cp = source.codePointAt(i) ?? 0
    const ch = String.fromCodePoint(cp)
    let out = ch.toLowerCase()
    if (/\s/.test(ch)) {
      if (prevSpace) {
        i += ch.length
        continue
      }
      out = ' '
      prevSpace = true
    } else {
      prevSpace = false
      if (/[\u2010-\u2015\u2212]/.test(ch)) out = '-'
    }
    for (let k = 0; k < out.length; k++) origIndex.push(i)
    norm += out
    i += ch.length
  }

  let from = 0
  for (;;) {
    const at = norm.indexOf(q, from)
    if (at === -1) return null
    const before = at === 0 ? '' : ([...norm.slice(Math.max(0, at - 2), at)].pop() ?? '')
    const rest = norm.slice(at + q.length)
    const beforeOk = before === '' || !TOKEN_CHAR.test(before) || !TOKEN_CHAR.test(q)
    const afterOk = rest === '' || !(TOKEN_CHAR.test(rest) || CONNECTOR_THEN_TOKEN.test(rest))
    if (beforeOk && afterOk) {
      const start = origIndex[at] ?? 0
      const lastNorm = at + q.length - 1
      const lastOrig = origIndex[lastNorm] ?? source.length - 1
      const lastCp = source.codePointAt(lastOrig) ?? 0
      const end = lastOrig + String.fromCodePoint(lastCp).length
      return source.slice(start, end).replace(/\s+/g, ' ')
    }
    from = at + 1
  }
}

/** 인용은 원문에 그대로 있어야 한다 — `findQuoteInSource` 참고 */
export function verifyQuote(quote: string, source: string): boolean {
  return findQuoteInSource(quote, source) !== null
}

/** 요약 문장 하나의 검증: 숫자(정확 일치) && 고유명사 */
export function verifySentence(sentence: string, terms: string[], source: string): boolean {
  return verifyAgainstSource(sentence, source) && verifyTerms(sentence, terms, source)
}

/**
 * `verifySentence`가 왜 실패하는지 — 걸린 수량어·숫자·이름을 하나씩. 통과하면 빈 배열.
 * 판정은 `verifySentence`와 같다. 제외 사유를 로그와 DB에 남겨 필터 기준을 관측으로 조정하기 위한 것이다.
 */
export function sentenceProblems(sentence: string, terms: string[], source: string): string[] {
  const problems: string[] = []
  const numeral = sentence.match(KOREAN_NUMERAL)
  if (numeral !== null) problems.push(`한글 수량어 "${numeral[0]}"`)
  // 한글 수량어가 있으면 verifyAgainstSource는 숫자를 보지 않고 실패한다. 사유로는 숫자도 함께 짚는다
  const sourceNumbers = new Set(numbersIn(source))
  for (const n of new Set(numbersIn(sentence))) {
    if (!sourceNumbers.has(n)) problems.push(`원문에 없는 숫자 ${n}`)
  }
  const normalizedSource = normalizeForMatch(source)
  const all = new Set([...terms.map((t) => t.trim()).filter((t) => t.length > 0), ...extractLatinTerms(sentence)])
  for (const t of all) {
    if (!containsToken(normalizedSource, normalizeForMatch(t))) problems.push(`원문에 없는 이름 ${t}`)
  }
  return problems
}
