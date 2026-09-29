import type { HttpClient } from '@jogan/core'

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}

/** arXiv HTML에서 읽을 수 있는 텍스트만 남긴다 */
export function htmlToText(html: string): string {
  const withoutScripts = html
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
