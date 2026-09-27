import { config } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// env.ts를 import하면 DATABASE_URL이 없을 때 throw한다. 여기서는 로드만 하고
// 없으면 아래 describe.skipIf가 건너뛰게 둔다.
config({ path: ['.env', '../../.env'], quiet: true })

const hasDb = Boolean(process.env.DATABASE_URL)

// DATABASE_URL이 없는 환경(CI 등)에서는 건너뛴다. 로컬에서는 `pnpm db:seed` 후 돌린다.
describe.skipIf(!hasDb)('queries (로컬 DB · 시드 데이터 기준)', () => {
  let userId: string

  beforeAll(async () => {
    const { db } = await import('../index')
    const user = await db.query.users.findFirst()
    if (!user) throw new Error('시드 사용자가 없다. `pnpm db:seed` 후 다시 돌려라.')
    userId = user.id
  })

  it('오늘 브리핑을 항목·논문·평가와 함께 가져온다', async () => {
    const { getTodayBrief, todayInSeoul } = await import('../index')

    const view = await getTodayBrief(userId, todayInSeoul())
    expect(view).not.toBeNull()
    expect(view?.items).toHaveLength(4)
    expect(view?.isToday).toBe(true)
    // 목록은 임베딩을 끌고 오지 않는다
    expect(view?.items[0] && 'embedding' in view.items[0].paper).toBe(false)
    // 순서는 position대로
    expect(view?.items.map((i) => i.item.position)).toEqual([0, 1, 2, 3])
    // 곁가지가 정확히 1편
    expect(view?.items.filter((i) => i.item.isSerendipity)).toHaveLength(1)
  })

  it('논문 상세에 평가와 브리핑 항목이 함께 온다', async () => {
    const { getPaperDetail, getTodayBrief, todayInSeoul } = await import('../index')
    const view = await getTodayBrief(userId, todayInSeoul())
    const first = view?.items[0]
    expect(first).toBeDefined()
    if (!first) return

    const detail = await getPaperDetail(first.paper.id, userId)
    expect(detail?.paper.id).toBe(first.paper.id)
    expect(detail?.assessment).not.toBeNull()
    expect(detail?.briefItem?.oneLine).toBe(first.item.oneLine)
  })

  it('저장함의 후속 소식 at이 Date로 복원된다', async () => {
    const { listSaved } = await import('../index')
    const saved = await listSaved(userId)
    expect(saved.length).toBeGreaterThan(0)
    const withFollowUp = saved.find((s) => s.item.followUp)
    expect(withFollowUp?.item.followUp?.at).toBeInstanceOf(Date)
  })

  it('설정의 출발 시각이 HH:mm으로 온다', async () => {
    const { getSettings } = await import('../index')
    const settings = await getSettings(userId)
    expect(settings?.departureTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
  })

  it('연속 기록이 0 이상이다', async () => {
    const { countStreak, todayInSeoul } = await import('../index')
    expect(await countStreak(userId, todayInSeoul())).toBeGreaterThanOrEqual(1)
  })

  it('워터마크를 쓰고 읽는다', async () => {
    const { getPipelineState, setPipelineState } = await import('../index')
    const key = '__test_watermark'
    try {
      expect(await getPipelineState(key)).toBeNull()
      await setPipelineState(key, '2026-09-27T00:00:00.000Z')
      expect(await getPipelineState(key)).toBe('2026-09-27T00:00:00.000Z')
      await setPipelineState(key, '2026-09-28T00:00:00.000Z')
      expect(await getPipelineState(key)).toBe('2026-09-28T00:00:00.000Z')
    } finally {
      const { db, pipelineState } = await import('../index')
      const { eq } = await import('drizzle-orm')
      await db.delete(pipelineState).where(eq(pipelineState.key, key))
    }
  })

  it('후보는 더 높은 relevance로만 갱신된다', async () => {
    const { db, papers, upsertCandidates, paperCandidates } = await import('../index')
    const { and, eq } = await import('drizzle-orm')
    const paper = await db.query.papers.findFirst()
    expect(paper).toBeDefined()
    if (!paper) return
    try {
      await upsertCandidates([
        { userId, paperId: paper.id, interestId: null, relevance: 0.6, collectedFor: '2026-09-27' },
      ])
      await upsertCandidates([
        { userId, paperId: paper.id, interestId: null, relevance: 0.4, collectedFor: '2026-09-28' },
      ])
      const low = await db.query.paperCandidates.findFirst({
        where: and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, paper.id)),
      })
      expect(low?.relevance).toBeCloseTo(0.6, 5)
      expect(low?.collectedFor).toBe('2026-09-27')

      await upsertCandidates([
        { userId, paperId: paper.id, interestId: null, relevance: 0.9, collectedFor: '2026-09-29' },
      ])
      const high = await db.query.paperCandidates.findFirst({
        where: and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, paper.id)),
      })
      expect(high?.relevance).toBeCloseTo(0.9, 5)
      expect(high?.collectedFor).toBe('2026-09-29')
    } finally {
      await db.delete(paperCandidates).where(eq(paperCandidates.userId, userId))
    }
  })

  it('초록이 바뀌면 upsert가 임베딩을 무효화한다', async () => {
    const { db, papers, upsertArxivPapers, setPaperEmbedding } = await import('../index')
    const { EMBEDDING_DIM } = await import('@jogan/core')
    const { eq } = await import('drizzle-orm')
    const arxivId = '__test.00001'
    const base = {
      doi: null, arxivId, title: '제목', authors: [{ name: '저자' }],
      abstract: '첫 초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
      source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
      pdfUrl: null, codeUrl: null, openAccess: true,
    }
    try {
      await upsertArxivPapers([base])
      const row = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
      expect(row).toBeDefined()
      if (!row) return
      await setPaperEmbedding(row.id, Array.from({ length: EMBEDDING_DIM }, () => 0.1))
      expect((await db.query.papers.findFirst({ where: eq(papers.id, row.id) }))?.embedding).not.toBeNull()

      // 초록이 같으면 임베딩이 유지된다
      await upsertArxivPapers([{ ...base, title: '제목 v2' }])
      expect((await db.query.papers.findFirst({ where: eq(papers.id, row.id) }))?.embedding).not.toBeNull()

      // 초록이 바뀌면 임베딩이 null이 된다
      await upsertArxivPapers([{ ...base, abstract: '바뀐 초록' }])
      expect((await db.query.papers.findFirst({ where: eq(papers.id, row.id) }))?.embedding).toBeNull()
    } finally {
      await db.delete(papers).where(eq(papers.arxivId, arxivId))
    }
  })
})

afterAll(async () => {
  if (!hasDb) return
  // 커넥션을 닫지 않으면 vitest가 종료되지 않는다
  const { db } = await import('../index')
  await db.$client.end()
})
