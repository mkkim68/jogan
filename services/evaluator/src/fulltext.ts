import type { HttpClient } from '@jogan/core'

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}

/** arXiv HTML에서 읽을 수 있는 텍스트만 남긴다 */
export function htmlToText(html: string): string {
  // 주석은 먼저, 통째로 지운다. 주석 안에 <p>나 수치 같은 마크업/텍스트가 있어도
  // 이건 의도적으로 지운 내용이라 결과 텍스트에 새어나오면 안 된다 — 이 텍스트가
  // 나중에 verify.ts가 "원문"으로 믿고 수치를 대조하는 그 문자열이기도 하다.
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, ' ')
  // <script src="x.js"/> 같은 self-closing 태그는 닫는 태그가 없다. 쌍으로만
  // 매칭하는 정규식을 먼저 돌리면 이 지점부터 "다음에 나오는 아무 </script>"까지를
  // 전부 삼켜버려 그 사이 진짜 본문이 사라진다 — self-closing 형태를 먼저 제거한다.
  const withoutSelfClosing = withoutComments.replace(/<(script|style)\b[^>]*\/>/gi, ' ')
  const withoutScripts = withoutSelfClosing
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
  const stripped = withoutScripts.replace(/<[^>]+>/g, ' ')
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
