import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// env.ts를 import하면 DATABASE_URL이 없을 때 throw한다. 여기서는 로드만 하고
// 없으면 아래 describe.skipIf가 건너뛰게 둔다.
config({ path: ['.env', '../../.env'], quiet: true })

const hasDb = Boolean(process.env.DATABASE_URL)

/**
 * 테스트가 만든 임시 상태를 지운다. 단언이 먼저 실패해 throw되더라도 `finally`에서 호출되므로
 * 반드시 실행된다. 정리 자체가 실패해도 원래 실패 원인을 덮지 않도록 여기서 삼키고 로그만 남긴다.
 */
async function safeCleanup(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error('테스트 정리 실패 — 수동으로 DB를 확인해야 할 수 있다:', err)
  }
}

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
    // 유사 주제 논문이 정확히 1편
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

  it('relevance는 [0, 1] 밖이면 DB가 거부한다', async () => {
    const { db, papers, paperCandidates, upsertCandidates, upsertArxivPapers } = await import('../index')
    const { and, eq } = await import('drizzle-orm')

    // 실제 논문을 골라 쓰면, 그 논문이 이미 파이프라인의 진짜 후보 행을 갖고 있을 때
    // finally의 "혹시 남았다면 지운다"가 그 진짜 행을 지워버릴 수 있다. 이 테스트만의
    // 논문을 만들어 그 논문에만 (실패할) 후보를 건다.
    const arxivId = '__test.00003'
    await upsertArxivPapers([{
      doi: null, arxivId, title: 'relevance 범위 테스트', authors: [{ name: '저자' }],
      abstract: '초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
      source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
      pdfUrl: null, codeUrl: null, openAccess: true,
    }])
    const paper = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
    expect(paper).toBeDefined()
    if (!paper) return

    try {
      let caught: unknown = null
      try {
        await upsertCandidates([
          { userId, paperId: paper.id, interestId: null, relevance: 1.5, collectedFor: '2026-09-27' },
        ])
      } catch (err) {
        caught = err
      }
      // drizzle이 드라이버 오류를 감싸므로 제약 이름은 cause 쪽에 있다
      expect(caught).toBeInstanceOf(Error)
      const cause = caught instanceof Error ? caught.cause : null
      expect(cause instanceof Error ? cause.message : String(cause)).toMatch(/relevance_range/)
      // papers 테이블은 건드리지 않았다
      expect(await db.query.papers.findFirst({ where: eq(papers.id, paper.id) })).toBeDefined()
    } finally {
      // 제약에 걸려 들어가지 않았어야 하지만, 혹시 남았다면 지운다 — 이 테스트가 만든
      // 논문 하나에 대해서만이라 다른 행을 건드릴 수 없다
      await db
        .delete(paperCandidates)
        .where(and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, paper.id)))
      await db.delete(papers).where(eq(papers.arxivId, arxivId))
    }
  })

  it('워터마크는 더 늦은 값으로만 전진한다 (뒤로 가지 않는다)', async () => {
    const { advancePipelineState, getPipelineState } = await import('../index')
    const key = '__test_watermark_monotonic'
    try {
      expect(await advancePipelineState(key, '2026-09-27T00:00:00.000Z')).toBe(true)
      // 더 이른 값은 무시된다
      expect(await advancePipelineState(key, '2026-09-20T00:00:00.000Z')).toBe(false)
      expect(await getPipelineState(key)).toBe('2026-09-27T00:00:00.000Z')
      // 같은 값도 전진이 아니다
      expect(await advancePipelineState(key, '2026-09-27T00:00:00.000Z')).toBe(false)
      // 더 늦은 값만 전진한다
      expect(await advancePipelineState(key, '2026-09-28T00:00:00.000Z')).toBe(true)
      expect(await getPipelineState(key)).toBe('2026-09-28T00:00:00.000Z')
    } finally {
      const { db, pipelineState } = await import('../index')
      const { eq } = await import('drizzle-orm')
      await db.delete(pipelineState).where(eq(pipelineState.key, key))
    }
  })

  it('후보는 더 높은 relevance로만 갱신되고, 그때 interestId도 함께 바뀐다', async () => {
    const { db, papers, listInterests, upsertCandidates, upsertArxivPapers, paperCandidates } = await import('../index')
    const { and, eq } = await import('drizzle-orm')

    // 실제 논문을 빌려 쓰면 그 논문이 이미 파이프라인의 진짜 후보 행을 갖고 있을 수 있고,
    // upsertCandidates의 setWhere(relevance가 더 높을 때만)는 그 진짜 행을 조용히 건드리지
    // 않은 채 통과시킨 뒤 finally가 그 행을 지워버린다. 이 테스트만의 논문을 만든다.
    const arxivId = '__test.00004'
    await upsertArxivPapers([{
      doi: null, arxivId, title: '후보 갱신 테스트', authors: [{ name: '저자' }],
      abstract: '초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
      source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
      pdfUrl: null, codeUrl: null, openAccess: true,
    }])
    const paper = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
    expect(paper).toBeDefined()
    if (!paper) return

    const userInterests = await listInterests(userId)
    expect(userInterests.length).toBeGreaterThanOrEqual(2)
    const [interestA, interestB] = userInterests
    if (!interestA || !interestB) return

    try {
      // 관심사 A로 0.6 삽입
      await upsertCandidates([
        { userId, paperId: paper.id, interestId: interestA.id, relevance: 0.6, collectedFor: '2026-09-27' },
      ])
      // 관심사 B로 더 낮은 0.4 — 갱신되면 안 된다 (interestId도 A 그대로)
      await upsertCandidates([
        { userId, paperId: paper.id, interestId: interestB.id, relevance: 0.4, collectedFor: '2026-09-28' },
      ])
      const low = await db.query.paperCandidates.findFirst({
        where: and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, paper.id)),
      })
      expect(low?.relevance).toBeCloseTo(0.6, 5)
      expect(low?.interestId).toBe(interestA.id)
      expect(low?.collectedFor).toBe('2026-09-27')

      // 관심사 B로 더 높은 0.9 — 갱신된다 (interestId도 B로 바뀐다)
      await upsertCandidates([
        { userId, paperId: paper.id, interestId: interestB.id, relevance: 0.9, collectedFor: '2026-09-29' },
      ])
      const high = await db.query.paperCandidates.findFirst({
        where: and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, paper.id)),
      })
      expect(high?.relevance).toBeCloseTo(0.9, 5)
      expect(high?.interestId).toBe(interestB.id)
      expect(high?.collectedFor).toBe('2026-09-29')
    } finally {
      // 이 테스트가 만든 논문의 후보 행만 지운 뒤, 논문 자체도 지운다 (paper_candidates에는
      // 캐스케이드가 없어 순서를 지켜야 한다)
      await db
        .delete(paperCandidates)
        .where(and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, paper.id)))
      await db.delete(papers).where(eq(papers.arxivId, arxivId))
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

  it('논문 임베딩 차원이 다르면 setPaperEmbedding이 던지고 행은 그대로다', async () => {
    const { db, papers, upsertArxivPapers, setPaperEmbedding } = await import('../index')
    const { EMBEDDING_DIM, EmbeddingDimensionError } = await import('@jogan/core')
    const { eq } = await import('drizzle-orm')
    const arxivId = '__test.00002'
    const base = {
      doi: null, arxivId, title: '차원 가드 테스트', authors: [{ name: '저자' }],
      abstract: '초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
      source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
      pdfUrl: null, codeUrl: null, openAccess: true,
    }
    try {
      await upsertArxivPapers([base])
      const row = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
      expect(row).toBeDefined()
      if (!row) return
      expect(row.embedding).toBeNull()

      const wrongLength = Array.from({ length: EMBEDDING_DIM - 1 }, () => 0.1)
      await expect(setPaperEmbedding(row.id, wrongLength)).rejects.toThrow(EmbeddingDimensionError)

      const after = await db.query.papers.findFirst({ where: eq(papers.id, row.id) })
      expect(after?.embedding).toBeNull()
    } finally {
      await db.delete(papers).where(eq(papers.arxivId, arxivId))
    }
  })

  it('관심사 임베딩 차원이 다르면 setInterestEmbedding이 던지고 행은 그대로다', async () => {
    const { db, interests, setInterestEmbedding } = await import('../index')
    const { EMBEDDING_DIM, EmbeddingDimensionError } = await import('@jogan/core')
    const { eq } = await import('drizzle-orm')
    const label = '__test_dimension_guard'
    try {
      const [inserted] = await db
        .insert(interests)
        .values({ userId, label, embedding: null, seedPaperIds: [] })
        .returning({ id: interests.id })
      expect(inserted).toBeDefined()
      if (!inserted) return
      const before = await db.query.interests.findFirst({ where: eq(interests.id, inserted.id) })
      expect(before?.embedding).toBeNull()

      const wrongLength = Array.from({ length: EMBEDDING_DIM + 1 }, () => 0.2)
      await expect(setInterestEmbedding(inserted.id, wrongLength)).rejects.toThrow(EmbeddingDimensionError)

      const after = await db.query.interests.findFirst({ where: eq(interests.id, inserted.id) })
      expect(after?.embedding).toBeNull()
    } finally {
      await db.delete(interests).where(eq(interests.label, label))
    }
  })

  it('addInterests가 새 라벨을 넣고, 중복 라벨은 조용히 무시한다', async () => {
    const { addInterests, deleteInterest, listInterests } = await import('../index')
    const label = `__test_label_${Date.now()}`
    let createdId: string | undefined

    try {
      await addInterests(userId, [label])
      const afterFirst = await listInterests(userId)
      const created = afterFirst.find((i) => i.label === label)
      createdId = created?.id
      expect(created).toBeDefined()

      // 같은 라벨 재삽입 — unique 제약 위반 없이 조용히 무시되어야 한다
      await addInterests(userId, [label])
      const afterSecond = await listInterests(userId)
      expect(afterSecond.filter((i) => i.label === label)).toHaveLength(1)
    } finally {
      // 단언이 도중에 실패해도 방금 만든 행은 반드시 지운다
      const id = createdId
      if (id) await safeCleanup(() => deleteInterest(userId, id))
    }

    const afterCleanup = await listInterests(userId)
    expect(afterCleanup.find((i) => i.label === label)).toBeUndefined()
  })

  it('addInterests가 빈 배열을 받으면 아무것도 하지 않는다', async () => {
    const { addInterests, listInterests } = await import('../index')
    const before = await listInterests(userId)
    await addInterests(userId, [])
    const after = await listInterests(userId)
    expect(after).toHaveLength(before.length)
  })

  it('deleteInterest는 호출자 본인의 관심사를 지우고 true를 돌려준다', async () => {
    const { addInterests, deleteInterest, listInterests } = await import('../index')
    const label = `__test_own_delete_${Date.now()}`
    let createdId: string | undefined

    try {
      await addInterests(userId, [label])
      const created = (await listInterests(userId)).find((i) => i.label === label)
      createdId = created?.id
      expect(created).toBeDefined()
      if (!created) return

      expect(await deleteInterest(userId, created.id)).toBe(true)
    } finally {
      // 단언이 도중에 실패해도 방금 만든 행은 반드시 지운다(이미 지워졌으면 두 번째
      // deleteInterest는 false를 돌려줄 뿐 에러는 아니다)
      const id = createdId
      if (id) await safeCleanup(() => deleteInterest(userId, id))
    }

    expect((await listInterests(userId)).find((i) => i.label === label)).toBeUndefined()
  })

  it('deleteInterest는 다른 사용자의 id로는 행을 지우지 못하고 false를 돌려준다', async () => {
    const { db, users, addInterests, deleteInterest, listInterests } = await import('../index')
    const label = `__test_cross_user_${Date.now()}`
    let otherUserId: string | undefined
    let createdId: string | undefined

    try {
      // 남의 지갑을 뒤지지 못한다는 걸 보이기 위한 일회용 사용자
      const [otherUser] = await db
        .insert(users)
        .values({ email: `__test_other_${Date.now()}@example.com`, name: null, image: null })
        .returning()
      expect(otherUser).toBeDefined()
      otherUserId = otherUser?.id
      if (!otherUser) return

      await addInterests(userId, [label])
      const created = (await listInterests(userId)).find((i) => i.label === label)
      createdId = created?.id
      expect(created).toBeDefined()
      if (!created) return

      // 남의 아이디로 지우려는 시도는 아무 효과가 없어야 한다 — 바로 이 지점에서
      // 스코핑이 깨지면 아래 assert가 실패하는데, 그래도 finally에서 정리는 돈다
      expect(await deleteInterest(otherUser.id, created.id)).toBe(false)
      expect((await listInterests(userId)).find((i) => i.label === label)).toBeDefined()
    } finally {
      // 실제 소유자로 지우고, 일회용 사용자도 지운다 — 단언 실패 여부와 무관하게 항상 실행
      const interestId = createdId
      if (interestId) await safeCleanup(() => deleteInterest(userId, interestId))
      const otherId = otherUserId
      if (otherId) await safeCleanup(() => db.delete(users).where(eq(users.id, otherId)))
    }

    expect((await listInterests(userId)).find((i) => i.label === label)).toBeUndefined()
  })

  it('deleteInterest는 관심사가 1개뿐이면 SQL 수준에서 막고 false를 돌려준다', async () => {
    const { db, users, addInterests, deleteInterest, listInterests } = await import('../index')
    const label = `__test_last_one_${Date.now()}`
    let otherUserId: string | undefined

    try {
      // 관심사가 정확히 1개인 일회용 사용자를 만들어, 사전 카운트 검사(액션 계층)를
      // 우회하고 `deleteInterest`를 직접 호출해도 원자적으로 막히는지 확인한다
      const [otherUser] = await db
        .insert(users)
        .values({ email: `__test_last_one_${Date.now()}@example.com`, name: null, image: null })
        .returning()
      expect(otherUser).toBeDefined()
      otherUserId = otherUser?.id
      if (!otherUser) return

      await addInterests(otherUser.id, [label])
      const created = (await listInterests(otherUser.id)).find((i) => i.label === label)
      expect(created).toBeDefined()
      if (!created) return

      expect(await deleteInterest(otherUser.id, created.id)).toBe(false)
      expect((await listInterests(otherUser.id)).find((i) => i.label === label)).toBeDefined()
    } finally {
      const otherId = otherUserId
      if (otherId) await safeCleanup(() => db.delete(users).where(eq(users.id, otherId)))
    }
  })

  it('updateSettings가 값을 바꾸고, getSettings가 HH:mm으로 읽어온다', async () => {
    const { getSettings, updateSettings } = await import('../index')
    const original = await getSettings(userId)
    expect(original).not.toBeNull()
    if (!original) return

    try {
      const changed = {
        userId,
        departureTime: '07:45',
        papersPerDay: (original.papersPerDay % 5) + 1,
        includePreprints: !original.includePreprints,
      }
      await updateSettings(changed)

      const afterChange = await getSettings(userId)
      expect(afterChange?.departureTime).toBe('07:45')
      expect(afterChange?.papersPerDay).toBe(changed.papersPerDay)
      expect(afterChange?.includePreprints).toBe(changed.includePreprints)
    } finally {
      // 단언이 도중에 실패해도 시드 값으로 반드시 복원한다
      await safeCleanup(() => updateSettings(original))
    }

    const restored = await getSettings(userId)
    expect(restored).toEqual(original)
  })

  it('아직 평가되지 않은 후보 논문만 가져온다', async () => {
    const {
      listUnassessedCandidatePapers, upsertAssessment, upsertCandidates, upsertArxivPapers,
      db, assessments, papers, paperCandidates,
    } = await import('../index')
    const { and, eq } = await import('drizzle-orm')

    // 실제 논문을 빌리면 그 논문이 이미 파이프라인·다른 사용자의 진짜 후보 행을 갖고
    // 있을 수 있어 finally의 삭제가 그 진짜 행을 지워버릴 수 있다. 이 테스트만의
    // 논문을 만든다.
    const arxivId = '__test.00005'
    await upsertArxivPapers([{
      doi: null, arxivId, title: '미평가 후보 조회 테스트', authors: [{ name: '저자' }],
      abstract: '초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
      source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
      pdfUrl: null, codeUrl: null, openAccess: true,
    }])
    const candidatePaper = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
    expect(candidatePaper).toBeDefined()
    if (!candidatePaper) return

    await upsertCandidates([
      { userId, paperId: candidatePaper.id, interestId: null, relevance: 0.5, collectedFor: '2026-09-29' },
    ])

    try {
      const before = await listUnassessedCandidatePapers(2000)
      expect(before.map((p) => p.id)).toContain(candidatePaper.id)

      await upsertAssessment({
        paperId: candidatePaper.id,
        track: 'notable',
        field: 'cs',
        stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
        stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
        stage3: null,
        stage4: null,
        evidence: [{ stage: 1, verdict: 'pass', text: '철회 기록이 없다' }],
        caveats: [],
      })
      const after = await listUnassessedCandidatePapers(2000)
      expect(after.map((p) => p.id)).not.toContain(candidatePaper.id)
    } finally {
      // paper_candidates에는 papers로의 캐스케이드가 없어, 후보 행 → 논문 순서로 지운다.
      // assessments는 캐스케이드가 있지만 명시적으로도 지운다.
      await db.delete(assessments).where(eq(assessments.paperId, candidatePaper.id))
      await db
        .delete(paperCandidates)
        .where(and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, candidatePaper.id)))
      await db.delete(papers).where(eq(papers.arxivId, arxivId))
    }
  })

  it('같은 논문을 다시 upsert하면 덮어쓴다', async () => {
    const { upsertAssessment, upsertArxivPapers, db, assessments, papers } = await import('../index')
    const { eq } = await import('drizzle-orm')

    const arxivId = '__test.00006'
    await upsertArxivPapers([{
      doi: null, arxivId, title: 'upsert 덮어쓰기 테스트', authors: [{ name: '저자' }],
      abstract: '초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
      source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
      pdfUrl: null, codeUrl: null, openAccess: true,
    }])
    const paper = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
    expect(paper).toBeDefined()
    if (!paper) return

    const row = {
      paperId: paper.id,
      track: 'notable' as const,
      field: 'cs' as const,
      stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
      stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
      stage3: null,
      stage4: null,
      evidence: [{ stage: 1 as const, verdict: 'pass' as const, text: '처음' }],
      caveats: [],
    }
    try {
      await upsertAssessment(row)
      await upsertAssessment({ ...row, evidence: [{ stage: 1, verdict: 'caution', text: '나중' }] })
      const saved = await db.query.assessments.findFirst({ where: eq(assessments.paperId, paper.id) })
      expect(saved?.evidence).toEqual([{ stage: 1, verdict: 'caution', text: '나중' }])
    } finally {
      await db.delete(assessments).where(eq(assessments.paperId, paper.id))
      await db.delete(papers).where(eq(papers.arxivId, arxivId))
    }
  })

  it('stage3을 null로 다시 upsert하면 실제로 null로 지워진다 (평가하지 않음과 0점을 구분한다)', async () => {
    const { upsertAssessment, upsertArxivPapers, db, assessments, papers } = await import('../index')
    const { eq } = await import('drizzle-orm')

    const arxivId = '__test.00007'
    await upsertArxivPapers([{
      doi: null, arxivId, title: 'stage3 null 복원 테스트', authors: [{ name: '저자' }],
      abstract: '초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
      source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
      pdfUrl: null, codeUrl: null, openAccess: true,
    }])
    const paper = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
    expect(paper).toBeDefined()
    if (!paper) return

    const stage3 = {
      reproducibility: { value: 0.8, reason: '코드가 공개되어 있다' },
      design: { value: 0.7, reason: '통제군이 있다' },
      statistics: { value: 0.6, reason: '표본이 작다' },
      claimVsEvidence: { value: 0.75, reason: '주장이 근거 범위 안에 있다' },
      limitations: { value: 0.5, reason: '한계를 명시했다' },
      preregistered: false,
      studyDesign: 'RCT',
    }
    const row = {
      paperId: paper.id,
      track: 'notable' as const,
      field: 'cs' as const,
      stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
      stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
      stage4: null,
      evidence: [{ stage: 3 as const, verdict: 'pass' as const, text: '본문 정밀 평가를 통과했다' }],
      caveats: [],
    }
    try {
      await upsertAssessment({ ...row, stage3 })
      const withStage3 = await db.query.assessments.findFirst({ where: eq(assessments.paperId, paper.id) })
      expect(withStage3?.stage3).not.toBeNull()

      // 다시 평가했는데 이번엔 ③b(본문 정밀 평가)를 돌리지 않았다면, 낡은 stage3이 남아
      // 있으면 안 된다 — "평가하지 않았다"와 "0점"은 다르다 (CLAUDE.md 절대 규칙 2)
      await upsertAssessment({ ...row, stage3: null })
      const cleared = await db.query.assessments.findFirst({ where: eq(assessments.paperId, paper.id) })
      expect(cleared?.stage3).toBeNull()
    } finally {
      await db.delete(assessments).where(eq(assessments.paperId, paper.id))
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
