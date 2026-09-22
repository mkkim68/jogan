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
