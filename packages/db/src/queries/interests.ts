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

/** 온보딩 제출. 임베딩은 파이프라인이 나중에 채운다 */
export async function createInterests(userId: string, labels: string[]): Promise<void> {
  if (labels.length === 0) return
  await db
    .insert(interests)
    .values(labels.map((label) => ({ userId, label, embedding: null, seedPaperIds: [] })))
}

export async function getSettings(userId: string): Promise<UserSettings | null> {
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) })
  return row ? rowToUserSettings(row) : null
}

export async function upsertSettings(s: UserSettings): Promise<void> {
  await db
    .insert(userSettings)
    .values({ ...s, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        departureTime: s.departureTime,
        papersPerDay: s.papersPerDay,
        includePreprints: s.includePreprints,
        updatedAt: new Date(),
      },
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
