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
    expect(r.evidence.some((e) => e.verdict === 'caution')).toBe(true)
  })

  // OpenAlex에 아직 없는 논문(며칠 전 올라온 것)은 흔하다. 탈락이 아니다.
  it('OpenAlex에 없으면 주목 트랙 + caveat이고 탈락이 아니다', () => {
    const r = toStage2(null)
    expect(r.track).toBe('notable')
    expect(r.caveats.join(' ')).toContain('색인')
    expect(r.evidence.length).toBeGreaterThan(0)
  })

  it('인용 수를 근거 문장에 쓴다', () => {
    const r = toStage2(parseOpenAlexWork(work))
    expect(r.evidence.map((e) => e.text).join(' ')).toContain('12')
  })

  it('authorTrackRecord는 0~1이고 가중치가 낮다는 것을 주석이 아니라 값으로 보인다', () => {
    const r = toStage2(parseOpenAlexWork(work))
    expect(r.stage2.authorTrackRecord).toBeGreaterThanOrEqual(0)
    expect(r.stage2.authorTrackRecord).toBeLessThanOrEqual(1)
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
  it('404면 null이다', async () => {
    const client = { request: async () => new Response('', { status: 404 }) }
    expect(await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')).toBeNull()
  })

  it('mailto를 붙인다 (polite pool)', async () => {
    let seen = ''
    const client = {
      request: async (url: string) => {
        seen = url
        return new Response(JSON.stringify(work), { status: 200 })
      },
    }
    await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')
    expect(seen).toContain('mailto=a%40b.com')
    expect(seen).toContain('2609.00001')
  })

  it('200이 아니고 404도 아니면 던진다', async () => {
    const client = { request: async () => new Response('', { status: 500 }) }
    await expect(fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')).rejects.toThrow()
  })
})
