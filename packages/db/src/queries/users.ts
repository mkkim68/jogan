import { eq } from 'drizzle-orm'
import { db } from '../client'
import { users } from '../schema'

/** 사용자 단위로 도는 파이프라인 단계(④ 매칭 등)가 쓴다 */
export async function listUserIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users)
  return rows.map((r) => r.id)
}

/**
 * 로그인할 때마다 Google 프로필의 이름·사진으로 덮어쓴다.
 *
 * Auth.js는 이미 있는 사용자에 계정을 연결할 때 users 행을 고치지 않는다 — 그래서 시드로 먼저 만든
 * 사용자는 시드 이름('조간 독자')이 그대로 남아 상단바 아바타에 '조'가 떴다. 값이 없으면(null) 기존 값을 둔다.
 */
export async function updateUserProfile(
  userId: string,
  profile: { name: string | null; image: string | null },
): Promise<void> {
  const set: { name?: string; image?: string } = {}
  if (profile.name) set.name = profile.name
  if (profile.image) set.image = profile.image
  if (Object.keys(set).length === 0) return
  await db.update(users).set(set).where(eq(users.id, userId))
}
