import { eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { pipelineState } from '../schema'

export async function getPipelineState(key: string): Promise<string | null> {
  const row = await db.query.pipelineState.findFirst({ where: eq(pipelineState.key, key) })
  return row?.value ?? null
}

export async function setPipelineState(key: string, value: string): Promise<void> {
  await db
    .insert(pipelineState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: pipelineState.key, set: { value, updatedAt: new Date() } })
}

/**
 * 워터마크 전용 쓰기 — **값이 지금 저장된 것보다 클 때만** 갱신한다.
 * 겹침 구간(OVERLAP_MS)만 훑고 끝난 실행은 이미 저장된 워터마크보다 오래된 논문만
 * 보게 되는데, 그대로 덮어쓰면 워터마크가 뒤로 밀려 같은 구간을 계속 다시 받는다.
 *
 * 값은 항상 `Date#toISOString()` 형식(자릿수 고정·UTC)이라 문자열 사전순 비교가
 * 곧 시간순 비교다. 다른 형식을 이 키에 쓰면 그 전제가 깨진다.
 *
 * @returns 실제로 갱신됐으면 true
 */
export async function advancePipelineState(key: string, value: string): Promise<boolean> {
  const rows = await db
    .insert(pipelineState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: pipelineState.key,
      set: { value, updatedAt: new Date() },
      setWhere: sql`excluded.value > ${pipelineState.value}`,
    })
    .returning({ key: pipelineState.key })
  return rows.length > 0
}
