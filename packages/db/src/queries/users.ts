import { db } from '../client'
import { users } from '../schema'

/** 사용자 단위로 도는 파이프라인 단계(④ 매칭 등)가 쓴다 */
export async function listUserIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users)
  return rows.map((r) => r.id)
}
