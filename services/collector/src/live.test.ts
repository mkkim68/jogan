import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { ARXIV_CATEGORIES, ARXIV_MIN_INTERVAL_MS, COLLECT_BACKFILL_DAYS, createHttpClient } from '@jogan/core'
import { buildArxivQueryUrl, entryToPaper, fetchArxivPage, parseArxivFeed } from './arxiv'
import { embedTexts } from './embed'

config({ path: ['.env', '../../.env'], quiet: true })

// 실제 외부 API를 부른다. 기본 `pnpm test`에서는 돌지 않는다.
//   COLLECTOR_LIVE_TEST=1 pnpm --filter @jogan/collector test live
const live = process.env.COLLECTOR_LIVE_TEST === '1'

describe.skipIf(!live)('실호출', () => {
  it('arXiv에서 실제 엔트리를 가져와 Paper로 매핑한다', async () => {
    const client = createHttpClient({ minIntervalMs: ARXIV_MIN_INTERVAL_MS, maxRetries: 2, timeoutMs: 30_000 }, {})
    const to = new Date()
    // 브리핑 원안은 2일치만 봤지만, arXiv는 주말·공휴일에 새 논문을 내지 않아 실행 시점에
    // 따라 2일 창이 통째로 비는 경우가 실제로 있다(검증됨: 확인 당시 최신 제출이 금요일
    // 저녁이었는데 "지금"은 월요일 새벽이라 2일 전으로 가도 그 논문을 못 봤다). 워터마크가
    // 없을 때 첫 수집이 거슬러 받는 기간과 같은 COLLECT_BACKFILL_DAYS(7일)를 써서 이 창을
    // 넓힌다 — 평일이 하루라도 걸리면 항상 결과가 있다.
    const from = new Date(to.getTime() - COLLECT_BACKFILL_DAYS * 24 * 60 * 60 * 1000)
    const url = buildArxivQueryUrl({ categories: ARXIV_CATEGORIES.slice(0, 2), from, to, start: 0, pageSize: 5 })
    const xml = await fetchArxivPage(client, url)
    const { entries } = parseArxivFeed(xml)
    expect(entries.length).toBeGreaterThan(0)

    const papers = entries.map(entryToPaper).filter((p) => p !== null)
    expect(papers.length).toBeGreaterThan(0)
    for (const p of papers) {
      expect(p.arxivId).toMatch(/^\d{4}\.\d{4,5}$/)
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.authors.length).toBeGreaterThan(0)
      expect(p.source).toBe('arxiv')
    }
  }, 60_000)

  it.skipIf(!process.env.VOYAGE_API_KEY)('Voyage가 EMBEDDING_DIM 차원을 돌려준다', async () => {
    const { EMBEDDING_DIM } = await import('@jogan/core')
    const client = createHttpClient({ minIntervalMs: 0, maxRetries: 2, timeoutMs: 60_000 }, {})
    const out = await embedTexts(client, String(process.env.VOYAGE_API_KEY), ['수면과 기억 공고화'], 'query')
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(EMBEDDING_DIM)
  }, 60_000)
})
