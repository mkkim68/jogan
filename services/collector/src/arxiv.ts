import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'
import type { NewPaper } from '@jogan/db'
import type { HttpClient } from './http'

const ARXIV_API = 'https://export.arxiv.org/api/query'

/** arXiv 질의의 날짜 형식: UTC 기준 YYYYMMDDHHmm */
export function formatArxivDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
}

export function buildArxivQueryUrl(o: {
  categories: readonly string[]
  from: Date
  to: Date
  start: number
  pageSize: number
}): string {
  const cats = o.categories.map((c) => `cat:${c}`).join(' OR ')
  const range = `submittedDate:[${formatArxivDate(o.from)} TO ${formatArxivDate(o.to)}]`
  // URLSearchParams는 공백을 '+'로 인코딩(application/x-www-form-urlencoded)하는데,
  // decodeURIComponent는 '+'를 공백으로 되돌리지 않는다. encodeURIComponent로 직접 조립한다.
  const params: [string, string][] = [
    ['search_query', `(${cats}) AND ${range}`],
    ['start', String(o.start)],
    ['max_results', String(o.pageSize)],
    ['sortBy', 'submittedDate'],
    ['sortOrder', 'descending'],
  ]
  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  return `${ARXIV_API}?${qs}`
}

export function stripVersion(idUrl: string): { arxivId: string; version: number } {
  const tail = idUrl.split('/abs/')[1] ?? idUrl
  const m = tail.match(/^(.+?)v(\d+)$/)
  return m && m[1] !== undefined && m[2] !== undefined
    ? { arxivId: m[1], version: Number(m[2]) }
    : { arxivId: tail, version: 1 }
}

/** arXiv는 제목·초록을 줄바꿈과 들여쓰기가 섞인 채로 준다 */
function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // 단일 요소도 항상 배열로 — fast-xml-parser는 기본적으로 하나면 객체를 준다
  isArray: (name) => ['entry', 'author', 'category', 'link'].includes(name),
})

export function parseArxivFeed(xml: string): { totalResults: number; entries: unknown[] } {
  const doc = parser.parse(xml) as Record<string, unknown>
  const feed = (doc.feed ?? {}) as Record<string, unknown>
  const total = Number(feed['opensearch:totalResults'] ?? 0)
  const entries = Array.isArray(feed.entry) ? feed.entry : []
  return { totalResults: Number.isFinite(total) ? total : 0, entries }
}

const AuthorNode = z.object({
  name: z.union([z.string(), z.number()]).transform(String),
  'arxiv:affiliation': z.union([z.string(), z.number()]).transform(String).optional(),
})

const EntryNode = z.object({
  id: z.string(),
  title: z.union([z.string(), z.number()]).transform(String),
  summary: z.union([z.string(), z.number()]).transform(String),
  published: z.string(),
  author: z.array(AuthorNode).min(1),
  'arxiv:doi': z.union([z.string(), z.number()]).transform(String).optional(),
})

/** 매핑할 수 없는 엔트리는 null. 호출부가 로그를 남기고 그 한 편만 건너뛴다 */
export function entryToPaper(entry: unknown): NewPaper | null {
  const parsed = EntryNode.safeParse(entry)
  if (!parsed.success) return null
  const e = parsed.data
  const { arxivId } = stripVersion(e.id)
  if (!arxivId) return null
  const publishedAt = new Date(e.published)
  if (Number.isNaN(publishedAt.getTime())) return null

  return {
    doi: e['arxiv:doi'] ?? null,
    arxivId,
    title: normalizeText(e.title),
    abstract: normalizeText(e.summary),
    authors: e.author.map((a) => {
      const affiliation = a['arxiv:affiliation']
      return affiliation ? { name: a.name, affiliation } : { name: a.name }
    }),
    publishedAt,
    source: 'arxiv',
    venue: { name: 'arXiv', kind: 'preprint' },
    pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
    codeUrl: null,
    openAccess: true,
  }
}

/** 한 배치 안에 v1과 v2가 같이 오면 높은 버전만 남긴다 */
export function dedupeByArxivId(
  rows: { arxivId: string; version: number; paper: NewPaper }[],
): NewPaper[] {
  const best = new Map<string, { version: number; paper: NewPaper }>()
  for (const r of rows) {
    const cur = best.get(r.arxivId)
    if (!cur || r.version > cur.version) best.set(r.arxivId, { version: r.version, paper: r.paper })
  }
  return [...best.values()].map((v) => v.paper)
}

export async function fetchArxivPage(client: HttpClient, url: string): Promise<string> {
  const res = await client.request(url, { headers: { 'User-Agent': 'jogan/0.1 (research digest)' } })
  if (!res.ok) throw new Error(`arXiv 응답 ${res.status}`)
  return res.text()
}
