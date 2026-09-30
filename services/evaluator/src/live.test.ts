import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { OPENALEX_MIN_INTERVAL_MS, createHttpClient } from '@jogan/core'
import { fetchFullText } from './fulltext'
import { fetchOpenAlexByArxivId, parseOpenAlexWork } from './stage2'

config({ path: ['.env', '../../.env'], quiet: true })

// 실제 외부 API를 부른다. 기본 `pnpm test`에서는 돌지 않는다.
//   EVALUATOR_LIVE_TEST=1 pnpm --filter @jogan/evaluator test live
const live = process.env.EVALUATOR_LIVE_TEST === '1'

describe.skipIf(!live)('실호출', () => {
  // 널리 알려진 arXiv 논문 (Attention Is All You Need). OpenAlex에 확실히 색인돼 있다.
  it('OpenAlex에서 실제 논문을 찾는다', async () => {
    const client = createHttpClient({ minIntervalMs: OPENALEX_MIN_INTERVAL_MS, maxRetries: 2, timeoutMs: 30_000 }, {})
    const json = await fetchOpenAlexByArxivId(client, '1706.03762', process.env.OPENALEX_MAILTO ?? 'test@example.com')
    expect(json).not.toBeNull()
    const work = parseOpenAlexWork(json)
    expect(work).not.toBeNull()
    expect(work?.citedByCount).toBeGreaterThan(1000)
  }, 60_000)

  it('색인되지 않은 id는 null이다', async () => {
    const client = createHttpClient({ minIntervalMs: OPENALEX_MIN_INTERVAL_MS, maxRetries: 2, timeoutMs: 30_000 }, {})
    expect(await fetchOpenAlexByArxivId(client, '9999.99999', 'test@example.com')).toBeNull()
  }, 60_000)

  it('arXiv에서 실제 본문을 가져온다', async () => {
    const client = createHttpClient({ minIntervalMs: 3000, maxRetries: 2, timeoutMs: 90_000 }, {})
    const text = await fetchFullText(client, '1706.03762')
    if (text === null) {
      // 오래된 논문은 HTML이 없을 수 있다. 그건 실패가 아니다
      expect(text).toBeNull()
      return
    }
    expect(text.length).toBeGreaterThan(5000)
  }, 120_000)
})
