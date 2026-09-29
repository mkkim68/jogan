import { describe, expect, it } from 'vitest'
import { ARXIV_CATEGORIES, PaperCandidate, RELEVANCE_FLOOR } from './index'

const base = {
  userId: 'u1',
  paperId: '3f1c1a6e-1b7e-4c2a-9c1d-0a1b2c3d4e5f',
  interestId: 'a1000000-0000-4000-8000-000000000001',
  relevance: 0.72,
  collectedFor: '2026-09-27',
}

describe('PaperCandidate', () => {
  it('정상 객체를 파싱한다', () => {
    expect(PaperCandidate.parse(base).relevance).toBe(0.72)
  })
  it('interestId는 null을 허용한다', () => {
    expect(PaperCandidate.parse({ ...base, interestId: null }).interestId).toBeNull()
  })
  it('relevance가 0~1 밖이면 거부한다', () => {
    expect(() => PaperCandidate.parse({ ...base, relevance: 1.2 })).toThrow()
    expect(() => PaperCandidate.parse({ ...base, relevance: -0.1 })).toThrow()
  })
  it('collectedFor는 YYYY-MM-DD만 받는다', () => {
    expect(() => PaperCandidate.parse({ ...base, collectedFor: '2026/09/27' })).toThrow()
  })
})

describe('수집 상수', () => {
  it('카테고리는 비어 있지 않고 모두 arXiv 형식이다', () => {
    expect(ARXIV_CATEGORIES.length).toBeGreaterThan(0)
    for (const c of ARXIV_CATEGORIES) expect(c).toMatch(/^[a-z-]+(\.[A-Z]{2})?$/)
  })
  it('관련성 임계값은 0~1 사이다', () => {
    expect(RELEVANCE_FLOOR).toBeGreaterThan(0)
    expect(RELEVANCE_FLOOR).toBeLessThan(1)
  })
})
