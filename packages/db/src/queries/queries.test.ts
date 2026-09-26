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

  it('deleteInterest는 호출자 본인의 관심사를 지운다', async () => {
    const { addInterests, deleteInterest, listInterests } = await import('../index')
    const label = `__test_own_delete_${Date.now()}`

    await addInterests(userId, [label])
    const created = (await listInterests(userId)).find((i) => i.label === label)
    expect(created).toBeDefined()
    if (!created) return

    await deleteInterest(userId, created.id)
    expect((await listInterests(userId)).find((i) => i.label === label)).toBeUndefined()
  })

  it('deleteInterest는 다른 사용자의 id로는 행을 지우지 못한다', async () => {
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
      await deleteInterest(otherUser.id, created.id)
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
})

afterAll(async () => {
  if (!hasDb) return
  // 커넥션을 닫지 않으면 vitest가 종료되지 않는다
  const { db } = await import('../index')
  await db.$client.end()
})
