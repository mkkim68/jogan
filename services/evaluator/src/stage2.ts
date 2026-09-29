import { OPENALEX_API, type Evidence, type Field, type HttpClient, type Stage2, type Track } from '@jogan/core'
import { z } from 'zod'

const Source = z.object({
  display_name: z.string(),
  type: z.string().nullish(),
})

const Work = z.object({
  cited_by_count: z.number().int().min(0),
  publication_year: z.number().int().nullish(),
  primary_location: z.object({ source: Source.nullish() }).nullish(),
  authorships: z.array(z.object({ author: z.object({ display_name: z.string() }) })).default([]),
})

export type OpenAlexWork = {
  citedByCount: number
  venueName: string | null
  isJournal: boolean
  authorCount: number
}

export function parseOpenAlexWork(json: unknown): OpenAlexWork | null {
  const parsed = Work.safeParse(json)
  if (!parsed.success) return null
  const source = parsed.data.primary_location?.source ?? null
  return {
    citedByCount: parsed.data.cited_by_count,
    venueName: source?.display_name ?? null,
    isJournal: source?.type === 'journal',
    authorCount: parsed.data.authorships.length,
  }
}

export type Stage2Result = { stage2: Stage2; track: Track; evidence: Evidence[]; caveats: string[] }

/**
 * 출처 신호를 Stage2로 옮기고 트랙을 정한다.
 *
 * `authorTrackRecord`는 PRD §3.2 ②의 지시대로 **가중치를 낮게** 둔다. 명성 편향을 피하려고
 * 트랙 결정과 ③단계 점수에 쓰지 않고, 근거 문장에서도 단독으로 내세우지 않는다.
 * 지금은 저자 수만 아는 상태라 0.2를 상한으로 하는 약한 신호로만 기록한다.
 */
export function toStage2(work: OpenAlexWork | null): Stage2Result {
  if (work === null) {
    return {
      stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
      track: 'notable',
      evidence: [{ stage: 2, verdict: 'caution', text: '심사를 거치지 않은 프리프린트다' }],
      caveats: ['OpenAlex에 아직 색인되지 않아 출처 신호를 확인하지 못했다'],
    }
  }

  const published = work.isJournal
  const evidence: Evidence[] = []

  if (published && work.venueName !== null) {
    evidence.push({ stage: 2, verdict: 'pass', text: `동료심사를 거쳐 ${work.venueName}에 게재됐다` })
  } else {
    evidence.push({ stage: 2, verdict: 'caution', text: '심사를 거치지 않은 프리프린트다' })
  }

  if (work.citedByCount > 0) {
    evidence.push({ stage: 2, verdict: 'pass', text: `다른 논문에 ${work.citedByCount}회 인용됐다` })
  }

  return {
    stage2: {
      venueTier: published ? work.venueName : null,
      reviewStatus: published ? 'published' : 'preprint',
      reviewScore: null,
      authorTrackRecord: Math.min(0.2, work.authorCount / 50),
    },
    track: published ? 'verified' : 'notable',
    evidence,
    caveats: [],
  }
}

/** arXiv 카테고리 → 분야. 지금 코퍼스는 7개 카테고리뿐이라 이 매핑으로 충분하다 */
export function fieldFromCategories(categories: string[] | null): Field {
  if (categories === null || categories.length === 0) return 'other'
  if (categories.some((c) => c.startsWith('q-bio'))) return 'bio_med'
  if (categories.some((c) => c.startsWith('cs.') || c === 'stat.ME')) return 'cs'
  return 'other'
}

const OpenAlexListResponse = z.object({
  results: z.array(z.unknown()),
})

/**
 * OpenAlex는 `/works/{external-id}` 축약 경로로 arXiv URL을 받지 않는다(실측: 404).
 * 대신 `filter=locations.landing_page_url:...`로 조회하면 색인된 레코드는 200 +
 * `results`에 항목 하나로 온다. 색인 전(흔한 경우 — 며칠 전 올라온 preprint)이면
 * 이 필터도 여전히 200을 주고 `results`가 빈 배열이다 — 그게 404가 아니라는 뜻이다.
 * 이제 404나 그 밖의 비정상 상태·모양은 진짜 오류이므로 던진다.
 */
export async function fetchOpenAlexByArxivId(
  client: HttpClient,
  arxivId: string,
  mailto: string,
): Promise<unknown | null> {
  const filter = `locations.landing_page_url:https://arxiv.org/abs/${arxivId}`
  const url = `${OPENALEX_API}?filter=${encodeURIComponent(filter)}&mailto=${encodeURIComponent(mailto)}`
  const res = await client.request(url)
  if (!res.ok) throw new Error(`OpenAlex 응답 ${res.status}`)
  const body: unknown = await res.json()
  const parsed = OpenAlexListResponse.safeParse(body)
  if (!parsed.success) throw new Error('OpenAlex 응답 모양이 예상과 다르다')
  const [first] = parsed.data.results
  return first ?? null
}
