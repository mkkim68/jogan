import { Assessment, Brief, EMBEDDING_DIM, Interest, Paper, SavedItem, UserSettings } from '@jogan/core'
import { describe, expect, it } from 'vitest'
import { buildSeed, fakeEmbedding } from './seed-data'

const seed = buildSeed('user_test', '2026-09-22')

describe('buildSeed', () => {
  it('모든 시드 객체가 core 스키마를 통과한다', () => {
    for (const p of seed.papers) Paper.parse(p)
    for (const a of seed.assessments) Assessment.parse(a)
    for (const i of seed.interests) Interest.parse(i)
    for (const s of seed.saved) SavedItem.parse(s)
    Brief.parse(seed.brief)
    UserSettings.parse(seed.settings)
  })

  it('관심사 3개, 오늘 브리핑 4편, 그중 곁가지 1편', () => {
    expect(seed.interests).toHaveLength(3)
    expect(seed.brief.items).toHaveLength(4)
    expect(seed.brief.items.filter((i) => i.isSerendipity)).toHaveLength(1)
    expect(seed.brief.date).toBe('2026-09-22')
  })

  it('브리핑 항목과 평가는 존재하는 논문만 가리킨다', () => {
    const ids = new Set(seed.papers.map((p) => p.id))
    for (const item of seed.brief.items) expect(ids.has(item.paperId)).toBe(true)
    for (const a of seed.assessments) expect(ids.has(a.paperId)).toBe(true)
    for (const s of seed.saved) expect(ids.has(s.paperId)).toBe(true)
  })

  it('심사 전 논문은 notable 트랙이고 하루 최대 2편', () => {
    const notable = seed.assessments.filter((a) => a.track === 'notable')
    expect(notable.length).toBeGreaterThanOrEqual(1)
    expect(notable.length).toBeLessThanOrEqual(2)
    for (const a of notable) {
      const paper = seed.papers.find((p) => p.id === a.paperId)
      expect(paper?.venue?.kind).toBe('preprint')
    }
  })

  it('시드 arXiv id는 arXiv가 발급할 수 없는 네임스페이스(월 99)를 쓴다', () => {
    // 실재하는 id를 점유하면 수집기의 upsert가 허구 시드를 진짜 논문으로 덮어쓰고,
    // 가짜 요약·가짜 신뢰도 근거만 paper_id로 남는다 (절대 규칙 1·2).
    for (const p of seed.papers) {
      if (p.arxivId === null) continue
      const m = p.arxivId.match(/^(\d{2})(\d{2})\./)
      expect(m).not.toBeNull()
      expect(Number(m?.[2])).toBeGreaterThan(12)
    }
  })

  it('관심사 임베딩은 전부 null이다 — 파이프라인이 채울 자리다', () => {
    // listUnembeddedInterests가 `embedding IS NULL`로 고르므로, 가짜 벡터를 심으면
    // 그 관심사는 영원히 진짜 임베딩을 못 받고 후보가 0건이 된다.
    for (const i of seed.interests) expect(i.embedding).toBeNull()
  })

  it('저장 항목에 후속 소식이 하나 있다', () => {
    expect(seed.saved.some((s) => s.followUp?.kind === 'accepted')).toBe(true)
  })

  it('모든 userId가 인자로 받은 값이다', () => {
    for (const i of seed.interests) expect(i.userId).toBe('user_test')
    expect(seed.brief.userId).toBe('user_test')
    expect(seed.settings.userId).toBe('user_test')
  })
})

describe('fakeEmbedding', () => {
  it('길이가 EMBEDDING_DIM이고 결정적이며 단위 벡터다', () => {
    const a = fakeEmbedding('x')
    expect(a).toHaveLength(EMBEDDING_DIM)
    expect(fakeEmbedding('x')).toEqual(a)
    expect(fakeEmbedding('y')).not.toEqual(a)
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
    expect(norm).toBeCloseTo(1, 5)
  })
})
