import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchOpenAlexByArxivId, fieldFromCategories, parseOpenAlexWork, toStage2 } from './stage2'

const work = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/openalex-work.json'), 'utf8')) as unknown

describe('parseOpenAlexWork', () => {
  it('픽스처를 파싱한다', () => {
    const w = parseOpenAlexWork(work)
    expect(w?.citedByCount).toBe(12)
    expect(w?.venueName).toBe('Nature')
    expect(w?.isJournal).toBe(true)
    expect(w?.authorCount).toBe(2)
  })

  it('preprint 저장소는 저널로 보지 않는다', () => {
    const repo = { ...(work as Record<string, unknown>), primary_location: { source: { display_name: 'arXiv', type: 'repository' } } }
    const w = parseOpenAlexWork(repo)
    expect(w?.isJournal).toBe(false)
    expect(w?.venueName).toBe('arXiv')
  })

  it('primary_location이 없어도 파싱된다', () => {
    const none = { ...(work as Record<string, unknown>), primary_location: null }
    expect(parseOpenAlexWork(none)?.isJournal).toBe(false)
  })

  it('모양이 다르면 null을 돌려준다 (파이프라인을 죽이지 않는다)', () => {
    expect(parseOpenAlexWork({ nope: true })).toBeNull()
    expect(parseOpenAlexWork(null)).toBeNull()
  })
})

describe('toStage2', () => {
  it('저널에 실렸으면 검증 트랙이다', () => {
    const r = toStage2(parseOpenAlexWork(work))
    expect(r.track).toBe('verified')
    expect(r.stage2.reviewStatus).toBe('published')
    expect(r.stage2.venueTier).toBe('Nature')
  })

  it('저널이 아니면 주목 트랙이고 프리프린트 경고가 붙는다', () => {
    const repo = { ...(work as Record<string, unknown>), primary_location: { source: { display_name: 'arXiv', type: 'repository' } } }
    const r = toStage2(parseOpenAlexWork(repo))
    expect(r.track).toBe('notable')
    expect(r.stage2.reviewStatus).toBe('preprint')
    // 조회는 됐지만 저널이 아니라고 "확인된" 경우다 — 조회 자체가 안 된 경우와 문장이 달라야 한다.
    expect(r.evidence.some((e) => e.verdict === 'caution' && e.text === '심사를 거치지 않은 프리프린트다')).toBe(true)
  })

  // OpenAlex에 아직 없는 논문(며칠 전 올라온 것)은 흔하다. 탈락이 아니다.
  it('OpenAlex에 없으면 주목 트랙 + caveat이고 탈락이 아니다', () => {
    const r = toStage2(null)
    expect(r.track).toBe('notable')
    expect(r.caveats.join(' ')).toContain('색인')
    // "확인 못 함"과 "확인했는데 저널이 아님"은 다른 사실이다 — 같은 문장을 쓰면
    // 확인한 적 없는 것을 확인한 것처럼 보이게 된다(절대 규칙 2).
    expect(r.evidence.some((e) => e.verdict === 'caution' && e.text === 'OpenAlex에 아직 색인되지 않아 게재 여부를 확인하지 못했다')).toBe(
      true,
    )
  })

  it('인용 수를 근거 문장에 쓴다', () => {
    const r = toStage2(parseOpenAlexWork(work))
    expect(r.evidence.map((e) => e.text).join(' ')).toContain('12')
  })

  it('authorTrackRecord는 저자 수가 많아도 0.2를 넘지 않는다 (명성 편향 방지)', () => {
    const manyAuthors = {
      ...(work as Record<string, unknown>),
      authorships: Array.from({ length: 40 }, (_, i) => ({ author: { display_name: `Author ${i}` } })),
    }
    const r = toStage2(parseOpenAlexWork(manyAuthors))
    expect(r.stage2.authorTrackRecord).toBe(0.2)
  })

  it('저자가 많아도 저널이 아니면 여전히 주목 트랙이다 (저자 수가 트랙을 바꾸지 않는다)', () => {
    const manyAuthorsNoJournal = {
      ...(work as Record<string, unknown>),
      primary_location: { source: { display_name: 'arXiv', type: 'repository' } },
      authorships: Array.from({ length: 40 }, (_, i) => ({ author: { display_name: `Author ${i}` } })),
    }
    const r = toStage2(parseOpenAlexWork(manyAuthorsNoJournal))
    expect(r.track).toBe('notable')
  })
})

describe('fieldFromCategories', () => {
  it('q-bio는 bio_med다', () => {
    expect(fieldFromCategories(['q-bio.NC', 'cs.LG'])).toBe('bio_med')
  })

  it('cs와 stat.ME는 cs다', () => {
    expect(fieldFromCategories(['cs.CL'])).toBe('cs')
    expect(fieldFromCategories(['stat.ME'])).toBe('cs')
  })

  it('모르면 other다', () => {
    expect(fieldFromCategories(['math.AG'])).toBe('other')
    expect(fieldFromCategories(null)).toBe('other')
    expect(fieldFromCategories([])).toBe('other')
  })
})

describe('fetchOpenAlexByArxivId', () => {
  it('results가 비어 있으면(아직 색인 전) null이다', async () => {
    const client = { request: async () => new Response(JSON.stringify({ results: [] }), { status: 200 }) }
    expect(await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')).toBeNull()
  })

  it('mailto를 붙인다 (polite pool)', async () => {
    let seen = ''
    const client = {
      request: async (url: string) => {
        seen = url
        return new Response(JSON.stringify({ results: [work] }), { status: 200 })
      },
    }
    await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')
    expect(seen).toContain('mailto=a%40b.com')
  })

  it('arXiv id로 landing_page_url 필터를 건다', async () => {
    let seen = ''
    const client = {
      request: async (url: string) => {
        seen = url
        return new Response(JSON.stringify({ results: [work] }), { status: 200 })
      },
    }
    await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')
    expect(seen).toContain('2609.00001')
    expect(seen).toContain('locations.landing_page_url')
  })

  it('http와 https 두 스킴을 OR로 함께 조회한다', async () => {
    // 실측: 옛 레코드는 http://arxiv.org/abs/…, 최근(2609.*) 레코드는 https://로 저장돼 있다
    let seen = ''
    const client = {
      request: async (url: string) => {
        seen = decodeURIComponent(url)
        return new Response(JSON.stringify({ results: [work] }), { status: 200 })
      },
    }
    await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')
    expect(seen).toContain(
      'locations.landing_page_url:http://arxiv.org/abs/2609.00001|https://arxiv.org/abs/2609.00001',
    )
  })

  it('결과가 있으면 첫 번째를 돌려준다', async () => {
    const client = { request: async () => new Response(JSON.stringify({ results: [work] }), { status: 200 }) }
    expect(await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')).toEqual(work)
  })

  it('200이 아니면 던진다', async () => {
    const client = { request: async () => new Response('', { status: 500 }) }
    await expect(fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')).rejects.toThrow()
  })
})
