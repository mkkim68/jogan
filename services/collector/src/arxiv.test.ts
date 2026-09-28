import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { NewPaper } from '@jogan/db'
import { buildArxivQueryUrl, dedupeByArxivId, entryToPaper, formatArxivDate, parseArxivFeed, stripVersion } from './arxiv'

const xml = readFileSync(join(import.meta.dirname, 'fixtures/arxiv-feed.xml'), 'utf8')

describe('formatArxivDate', () => {
  it('UTC 기준 YYYYMMDDHHmm', () => {
    expect(formatArxivDate(new Date('2026-09-24T17:58:43Z'))).toBe('202609241758')
  })
})

describe('buildArxivQueryUrl', () => {
  const url = buildArxivQueryUrl({
    categories: ['cs.AI', 'cs.CL'],
    from: new Date('2026-09-24T00:00:00Z'),
    to: new Date('2026-09-25T00:00:00Z'),
    start: 0,
    pageSize: 200,
  })
  it('카테고리를 OR로 묶고 날짜 범위를 건다', () => {
    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('cat:cs.AI OR cat:cs.CL')
    expect(decoded).toContain('submittedDate:[202609240000 TO 202609250000]')
  })
  it('제출일 내림차순으로 정렬한다', () => {
    expect(url).toContain('sortBy=submittedDate')
    expect(url).toContain('sortOrder=descending')
  })
  it('페이지네이션 파라미터를 넣는다', () => {
    expect(url).toContain('start=0')
    expect(url).toContain('max_results=200')
  })
})

describe('stripVersion', () => {
  it('URL과 버전 접미사를 떼어낸다', () => {
    expect(stripVersion('http://arxiv.org/abs/2609.30250v1')).toEqual({ arxivId: '2609.30250', version: 1 })
    expect(stripVersion('http://arxiv.org/abs/2609.30243v12')).toEqual({ arxivId: '2609.30243', version: 12 })
  })
  it('버전이 없으면 1로 본다', () => {
    expect(stripVersion('http://arxiv.org/abs/2609.30250')).toEqual({ arxivId: '2609.30250', version: 1 })
  })
})

describe('parseArxivFeed', () => {
  it('총 건수와 엔트리를 읽는다', () => {
    const feed = parseArxivFeed(xml)
    expect(feed.totalResults).toBe(107)
    expect(feed.entries).toHaveLength(3)
  })
  it('엔트리가 하나뿐인 응답도 배열로 돌려준다', () => {
    const single = xml.replace(/<entry>[\s\S]*<\/entry>/, xml.match(/<entry>[\s\S]*?<\/entry>/)![0])
    expect(parseArxivFeed(single).entries).toHaveLength(1)
  })
  it('엔트리가 없는 응답은 빈 배열이다', () => {
    expect(parseArxivFeed('<feed xmlns="http://www.w3.org/2005/Atom"><opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">0</opensearch:totalResults></feed>').entries).toEqual([])
  })
})

describe('entryToPaper', () => {
  const entries = parseArxivFeed(xml).entries

  it('저자 여럿을 매핑하고 제목·초록의 줄바꿈을 정규화한다', () => {
    const p = entryToPaper(entries[0])
    expect(p).not.toBeNull()
    if (!p) return
    expect(p.arxivId).toBe('2609.30250')
    expect(p.title).toBe('Agentic Detection of Online Conspiracies')
    expect(p.abstract).toBe('Conspiratorial discourse on social media is not always expressed through explicit claims.')
    expect(p.authors.map((a) => a.name)).toEqual(['Lior Biton', 'Oren Tsur'])
    expect(p.doi).toBeNull()
    expect(p.source).toBe('arxiv')
    expect(p.venue).toEqual({ name: 'arXiv', kind: 'preprint' })
    expect(p.openAccess).toBe(true)
    expect(p.codeUrl).toBeNull()
    expect(p.pdfUrl).toBe('https://arxiv.org/pdf/2609.30250')
    expect(p.publishedAt.toISOString()).toBe('2026-09-24T17:58:43.000Z')
  })

  it('저자가 한 명이어도 배열로 만든다', () => {
    const p = entryToPaper(entries[1])
    expect(p?.authors).toEqual([{ name: 'Solo Researcher' }])
  })

  it('DOI와 소속을 읽는다', () => {
    const p = entryToPaper(entries[2])
    expect(p?.doi).toBe('10.1000/example.42')
    expect(p?.authors[0]).toEqual({ name: 'Jane Doe', affiliation: 'KAIST' })
  })

  it('필수 필드가 없으면 null을 돌려준다 (건너뛰기)', () => {
    expect(entryToPaper({ id: 'http://arxiv.org/abs/1v1' })).toBeNull()
    expect(entryToPaper({})).toBeNull()
    expect(entryToPaper(null)).toBeNull()
  })

  it('소속이 여럿이면 첫 소속만 쓰고 논문은 버리지 않는다', () => {
    const entry = {
      id: 'http://arxiv.org/abs/2609.30250v2',
      title: '제목',
      summary: '초록',
      published: '2026-09-25T00:00:00Z',
      author: [{ name: 'Jane Doe', 'arxiv:affiliation': ['KAIST', 'NAVER'] }],
    }
    const p = entryToPaper(entry)
    expect(p?.authors[0]).toEqual({ name: 'Jane Doe', affiliation: 'KAIST' })
  })

  it('published가 날짜로 파싱되지 않으면 null을 돌려준다', () => {
    const entry = {
      id: 'http://arxiv.org/abs/2609.30250v2',
      title: '제목',
      summary: '초록',
      published: '날짜아님',
      author: [{ name: 'Jane Doe' }],
    }
    expect(entryToPaper(entry)).toBeNull()
  })
})

describe('dedupeByArxivId', () => {
  it('같은 id는 가장 높은 버전만 남긴다', () => {
    const mk = (arxivId: string, version: number, title: string) => ({
      arxivId,
      version,
      paper: {
        doi: null,
        arxivId,
        title,
        abstract: '초록',
        authors: [{ name: 'A' }],
        publishedAt: new Date('2026-09-25T00:00:00Z'),
        source: 'arxiv',
        venue: { name: 'arXiv', kind: 'preprint' },
        pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
        codeUrl: null,
        openAccess: true,
      } satisfies NewPaper,
    })
    const out = dedupeByArxivId([mk('a', 1, 'v1'), mk('a', 3, 'v3'), mk('b', 1, 'b1'), mk('a', 2, 'v2')])
    expect(out).toHaveLength(2)
    expect(out.map((p) => p.title).sort()).toEqual(['b1', 'v3'])
  })
})
