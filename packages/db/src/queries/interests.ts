import type { Interest, UserSettings } from '@jogan/core'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../client'
import { briefItems, briefs, interests, userSettings } from '../schema'
import { rowToInterest, rowToUserSettings } from './mappers'
import { todayInSeoul } from './today'

export async function listInterests(userId: string): Promise<Interest[]> {
  const rows = await db.query.interests.findMany({ where: eq(interests.userId, userId) })
  return rows.map(({ createdAt: _createdAt, ...row }) => rowToInterest(row))
}

export async function getSettings(userId: string): Promise<UserSettings | null> {
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) })
  return row ? rowToUserSettings(row) : null
}

/**
 * 온보딩 제출 — 관심사 삽입과 설정 upsert를 하나의 트랜잭션으로 묶는다.
 * 웹 앱(서버 액션)은 이 함수 하나만 호출한다 — 두 쓰기를 앱 쪽에서 따로 조율하지 않는다.
 * 하나가 실패하면 둘 다 롤백되므로, "관심사는 커밋됐는데 설정은 없다" 같은 상태가 생기지 않는다.
 *
 * 임베딩은 `null`로 둔다 — 파이프라인이 나중에 채운다.
 * `interests_user_label` 유니크 인덱스 + `onConflictDoNothing()`으로 같은 라벨의 재삽입은 조용히 무시한다
 * (재제출 가드는 호출부에서 `listInterests`로 먼저 걸러야 하지만, 이 함수 자체도 중복 삽입에 안전하다).
 */
export async function completeOnboarding(
  userId: string,
  labels: string[],
  settings: UserSettings,
): Promise<void> {
  await db.transaction(async (tx) => {
    if (labels.length > 0) {
      await tx
        .insert(interests)
        .values(labels.map((label) => ({ userId, label, embedding: null, seedPaperIds: [] })))
        .onConflictDoNothing()
    }

    await tx
      .insert(userSettings)
      .values({ ...settings, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: {
          departureTime: settings.departureTime,
          papersPerDay: settings.papersPerDay,
          includePreprints: settings.includePreprints,
          updatedAt: new Date(),
        },
      })
  })
}

/** 웹 우 레일 "이번 주 관심사 흐름" */
export async function countByInterest(
  userId: string,
  sinceDays: number,
): Promise<{ interestId: string; label: string; count: number }[]> {
  const since = new Date(
    Date.parse(`${todayInSeoul()}T00:00:00+09:00`) - sinceDays * 86_400_000,
  ).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const rows = await db
    .select({
      interestId: interests.id,
      label: interests.label,
      count: sql<number>`count(*)::int`,
    })
    .from(briefItems)
    .innerJoin(briefs, eq(briefItems.briefId, briefs.id))
    .innerJoin(interests, eq(briefItems.interestId, interests.id))
    .where(and(eq(briefs.userId, userId), gte(briefs.date, since)))
    .groupBy(interests.id, interests.label)
  return rows
}
