import type { HttpClient } from '@jogan/core'

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}

/** 이 태그들의 내용은 통째로 들어낸다 — 결과 텍스트에 조금도 남으면 안 된다 */
const SKIP_CONTENT_TAGS = new Set(['script', 'style', 'head'])

/**
 * `<`로 시작하는 태그가 실제로 끝나는 위치(마지막 `>` 다음 인덱스)를 찾는다.
 * 따옴표로 감싼 속성값 안의 `>`나 `/>`는 태그 종료로 보지 않는다 —
 * `<script data-x="foo/>bar">`에서 `foo/>`는 속성값 문자일 뿐, self-closing
 * 표시가 아니다. 못 찾으면(끝까지 닫는 `>`가 없으면) -1.
 */
function findTagEnd(html: string, start: number): number {
  let i = start + 1
  let quote: string | null = null
  while (i < html.length) {
    const ch = html[i]
    if (quote !== null) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      return i + 1
    }
    i++
  }
  return -1
}

/**
 * 주석 내용 중 실제 종료 시퀀스 `-->`가 시작하는 인덱스를 찾는다.
 * `="` 또는 `='` 바로 뒤에 이어지는 구간은 속성값처럼 보호해서, 그 안에 박힌
 * `-->`는 종료로 보지 않는다 — 그렇지 않으면 `<a href="-->fake.html">`처럼
 * 주석 속에 끼워넣은 가짜 태그가 주석을 조기 종료시켜, 뒤에 숨겨야 할 텍스트가
 * 새어나온다. 반대로 `=` 없이 그냥 나온 따옴표(`don't`의 어포스트로피 같은 것)는
 * 보호 구간으로 취급하지 않는다 — 그렇게 하면 평범한 문장 하나가 뒤 전체를
 * 집어삼켜버린다. 못 찾으면(끝까지 `-->`가 없으면) -1.
 */
function findCommentEnd(html: string, contentStart: number): number {
  let i = contentStart
  let quote: string | null = null
  while (i < html.length) {
    const ch = html[i]
    if (quote !== null) {
      if (ch === quote) quote = null
      i++
      continue
    }
    if ((ch === '"' || ch === "'") && html[i - 1] === '=') {
      quote = ch
      i++
      continue
    }
    if (html.startsWith('-->', i)) return i
    i++
  }
  return -1
}

/** `<div ...>`, `</script>` 같은 태그 텍스트에서 태그 이름만 소문자로 뽑는다 */
function tagNameOf(tagText: string): string | null {
  const m = /^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(tagText)
  const name = m?.[1]
  return name === undefined ? null : name.toLowerCase()
}

/**
 * HTML을 한 번 훑으면서 주석, `<script>`/`<style>`/`<head>` 내용, 태그를 걸러내고
 * 그 바깥의 텍스트만 남긴다. 정규식을 이어 붙이는 대신 상태를 유지하는 스캐너로
 * 짠 이유: self-closing 태그·속성값 속 `>`·주석 속 가짜 종료 시퀀스가 서로 얽혀
 * 있어서, 정규식을 하나씩 땜질하면 하나를 고칠 때마다 다른 하나가 깨진다.
 *
 * 문서가 망가져서(닫히지 않은 주석·`<script>`) 어디서 끝나는지 알 수 없으면,
 * 그 뒤는 전부 버린다. 지워야 할 스크립트 원문이나 주석 내용이 새어나가는 쪽이
 * 본문 뒷부분이 잘려서 조금 짧게 나오는 쪽보다 훨씬 나쁘다.
 */
function extractText(html: string): string {
  let out = ''
  let i = 0
  const n = html.length
  while (i < n) {
    if (html.startsWith('<!--', i)) {
      const end = findCommentEnd(html, i + 4)
      if (end === -1) return out
      i = end + 3
      // 지운 자리에 공백 하나를 남긴다 — 그렇지 않으면 "<p>a</p><!--x--><p>b</p>"가
      // "a"와 "b" 사이 경계 없이 "ab"로 붙어버린다.
      out += ' '
      continue
    }
    if (html[i] === '<') {
      const tagEnd = findTagEnd(html, i)
      if (tagEnd === -1) return out
      const tagText = html.slice(i, tagEnd)
      const isClosing = tagText.startsWith('</')
      const isSelfClosing = tagText.length >= 2 && tagText[tagText.length - 2] === '/'
      const name = tagNameOf(tagText)
      i = tagEnd
      if (!isClosing && !isSelfClosing && name !== null && SKIP_CONTENT_TAGS.has(name)) {
        const closeRelative = html.slice(i).search(new RegExp(`</${name}\\b`, 'i'))
        if (closeRelative === -1) return out
        const closeStart = i + closeRelative
        const closeTagEnd = html.indexOf('>', closeStart)
        if (closeTagEnd === -1) return out
        i = closeTagEnd + 1
      }
      out += ' '
      continue
    }
    out += html[i]
    i++
  }
  return out
}

/** arXiv HTML에서 읽을 수 있는 텍스트만 남긴다 */
export function htmlToText(html: string): string {
  const stripped = extractText(html)
  const decoded = stripped.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
  return decoded.replace(/\s+/g, ' ').trim()
}

/**
 * arXiv HTML 본문. 없으면 null이고, 그건 실패가 아니다 —
 * 호출자는 초록만으로 평가하되 본문을 봐야 답할 수 있는 항목을 null로 남긴다.
 *
 * **받아온 본문은 메모리에서만 쓴다. DB에 저장하지 않는다** (CLAUDE.md 절대 규칙 4).
 */
export async function fetchFullText(client: HttpClient, arxivId: string): Promise<string | null> {
  try {
    const res = await client.request(`https://arxiv.org/html/${arxivId}`)
    if (!res.ok) return null
    const text = htmlToText(await res.text())
    return text.length === 0 ? null : text
  } catch {
    return null
  }
}
