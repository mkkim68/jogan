import { sql } from 'drizzle-orm'
import { db } from '../client'

/**
 * 파이프라인 중복 실행 가드.
 *
 * 두 실행이 겹치면(cron 도는 중 수동 실행, cron 재시도) 각자 자기 레이트 리미터를 들고
 * 있어 arXiv 입장에서는 요청 간격이 정책의 절반으로 보인다 — 차단당할 수 있다.
 *
 * 세션 단위 advisory lock이라 프로세스가 끝나면(커넥션이 닫히면) 자동으로 풀린다.
 * 잠금을 잡지 못하면 대기하지 않고 즉시 false다 — 배치는 기다리는 것보다 비켜주는 게 낫다.
 */
export async function tryAdvisoryLock(key: number): Promise<boolean> {
  const rows = await db.execute(sql`select pg_try_advisory_lock(${key}) as locked`)
  return rows[0]?.locked === true
}
