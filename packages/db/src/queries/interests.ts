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

/** `db`와 `db.transaction`의 콜백 인자 둘 다 `.insert`를 지원한다 — upsert 본체가 필요한 건 이것뿐이다 */
type SettingsExecutor = Pick<typeof db, 'insert'>

/**
 * 설정 upsert 본체 — `completeOnboarding`(트랜잭션 안)과 `updateSettings`(단독)가 공유한다.
 */
async function upsertSettings(executor: SettingsExecutor, settings: UserSettings): Promise<void> {
  await executor
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
}

/** 관심사 관리 화면의 단독 설정 저장 — 트랜잭션 없이 `user_settings` 한 행만 upsert한다 */
export async function updateSettings(settings: UserSettings): Promise<void> {
  await upsertSettings(db, settings)
}

/**
 * 라벨 목록을 추가한다. 임베딩은 `null`로 둔다 — 파이프라인이 나중에 채운다.
 * `interests_user_label` 유니크 인덱스 + `onConflictDoNothing()`으로 중복 라벨은 조용히 무시한다.
 */
export async function addInterests(userId: string, labels: string[]): Promise<void> {
  if (labels.length === 0) return
  await db
    .insert(interests)
    .values(labels.map((label) => ({ userId, label, embedding: null, seedPaperIds: [] })))
    .onConflictDoNothing()
}

/**
 * 관심사 삭제 — `userId`도 WHERE에 들어가므로 다른 사용자의 행은 절대 지울 수 없다.
 *
 * "마지막 1개는 삭제 금지" 불변식을 DELETE 문 안의 서브쿼리 조건으로 함께 건다. 호출부
 * (`removeInterestAction`)의 사전 카운트 검사는 빠른 피드백용으로 남겨두지만, 그 검사와
 * 실제 삭제 사이에는 시간차가 있어 동시에 두 요청이 도착하면 둘 다 통과해 관심사가 0개가
 * 될 수 있었다(TOCTOU) — 그 경쟁에서 지면 복구 경로(`/onboarding` 재진입)가 `user_settings`를
 * 하드코딩 기본값으로 덮어써 버리므로 대가가 크다. 조건을 SQL 한 문장 안에 넣으면 그 경쟁이
 * 사라진다.
 *
 * 반환값은 실제로 지웠는지를 알려준다 — `interestId`가 없거나 남의 것이거나(행 자체가
 * WHERE에 안 걸림), 지금 가진 관심사가 1개뿐이라(서브쿼리 조건 불충족) 지우지 못했으면
 * `false`다. 호출부가 "성공" / "이미 없음 또는 남의 것" / "마지막 1개"를 구분해 사용자에게
 * 알릴 수 있도록, 성공과 실패를 항상 구분 가능한 형태로 돌려준다.
 */
export async function deleteInterest(userId: string, interestId: string): Promise<boolean> {
  const rows = await db
    .delete(interests)
    .where(
      and(
        eq(interests.userId, userId),
        eq(interests.id, interestId),
        sql`(select count(*) from ${interests} i2 where i2.user_id = ${userId}) > 1`,
      ),
    )
    .returning({ id: interests.id })
  return rows.length > 0
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

    await upsertSettings(tx, settings)
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
