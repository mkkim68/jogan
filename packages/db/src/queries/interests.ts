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
 * "마지막 1개는 삭제 금지" 불변식은 트랜잭션 안에서 이 사용자의 관심사 행들을
 * `SELECT ... FOR UPDATE`로 먼저 잠근 뒤 개수를 세고, 그 잠금이 유지된 채로 DELETE를
 * 실행해 지킨다. **DELETE 문 하나에 넣은 서브쿼리 `count(*)` 조건만으로는 이 경쟁이
 * 닫히지 않는다** — READ COMMITTED에서 서브쿼리 `SELECT`는 행을 잠그지 않으므로,
 * 관심사가 정확히 2개일 때 **서로 다른 두 행**을 동시에 지우는 두 요청은 각자 자기
 * DELETE가 실행되는 순간의 스냅샷에서 똑같이 `count = 2`를 보고 둘 다 조건을 통과해버려
 * 0개가 될 수 있다(같은 행을 동시에 지우는 경쟁만 막혔을 뿐, 서로 다른 행을 지우는
 * 경쟁은 열려 있었다). `FOR UPDATE`로 먼저 행을 잠그면 두 번째 트랜잭션은 첫 번째가
 * 커밋(또는 롤백)할 때까지 그 SELECT에서 블로킹되고, 커밋 후 다시 읽는 개수는 이미
 * 줄어든 상태이므로 정확히 판정한다. 이게 중요한 이유: 관심사가 0개가 되면 복구 경로
 * (`/onboarding` 재진입 → `completeOnboarding`)가 온보딩 폼의 하드코딩 기본값으로
 * `user_settings`를 조용히 덮어써 버린다 — 대가가 큰 조용한 데이터 손실이다.
 *
 * 반환값은 실제로 지웠는지를 알려준다 — `interestId`가 없거나 남의 것이거나(행 자체가
 * WHERE에 안 걸림), 지금 가진 관심사가 1개뿐이라(잠근 뒤 센 개수가 1 이하) 지우지 못했으면
 * `false`다. 호출부가 "성공" / "이미 없음 또는 남의 것" / "마지막 1개"를 구분해 사용자에게
 * 알릴 수 있도록, 성공과 실패를 항상 구분 가능한 형태로 돌려준다.
 *
 * `.orderBy(interests.id)`는 잠그는 행의 순서를 결정적으로 만든다 — 정렬이 없으면 동시에
 * 도는 두 트랜잭션이 서로 다른 스캔 순서로 행을 잠글 수 있어(예: 하나는 id 순, 다른 하나는
 * 물리적 저장 순) `40P01 deadlock`이 이론상 가능하다. 여기엔 이 트랜잭션을 감싸는 재시도가
 * 없으므로 데드락이 나면 그대로 throw된다. 순서를 고정하면 두 트랜잭션이 항상 같은 순서로
 * 잠그려 시도하므로 그 가능성 자체가 없어진다 — 단점은 없다.
 */
export async function deleteInterest(userId: string, interestId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: interests.id })
      .from(interests)
      .where(eq(interests.userId, userId))
      .orderBy(interests.id)
      .for('update')

    if (owned.length <= 1) return false

    const deleted = await tx
      .delete(interests)
      .where(and(eq(interests.userId, userId), eq(interests.id, interestId)))
      .returning({ id: interests.id })

    return deleted.length > 0
  })
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
