/**
 * LLM 응답에서 JSON 본문을 꺼낸다. 파싱은 호출자가 한다(json/schema 실패를 구분해 로그로 남기려고).
 * 모델은 "JSON만 출력"하라는 지시를 어기고 코드블록으로 감싸거나 앞에 문장을 붙인다 — 둘 다 실측했다.
 * 잘려서 닫히지 않은 응답은 손대지 않고 돌려줘서 JSON 파싱 실패로 남긴다.
 */
export function jsonBodyOf(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1] !== undefined) return fenced[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  return start !== -1 && end > start ? raw.slice(start, end + 1) : raw.trim()
}
