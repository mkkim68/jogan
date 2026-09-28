import type { ReservedSql } from 'postgres'
import { pgSql } from '../client'

/**
 * 파이프라인 중복 실행 가드.
 *
 * 두 실행이 겹치면(cron 도는 중 수동 실행, cron 재시도) 각자 자기 레이트 리미터를 들고
 * 있어 arXiv 입장에서는 요청 간격이 정책의 절반으로 보인다 — 차단당할 수 있다.
 *
 * advisory lock은 **세션 단위**다. 풀에서 아무 커넥션이나 빌려 잠그면, 그 커넥션이
 * `idle_timeout`(20초) 동안 놀다가 닫히는 순간 잠금도 같이 풀린다 — 실행이 아직
 * 한창인데도. Voyage 배치 한 번이나 arXiv 재시도 백오프만으로도 20초는 쉽게 넘는다.
 * 그래서 커넥션 하나를 예약해 붙잡고, 프로세스가 끝날 때까지 돌려주지 않는다.
 * 잠금 해제는 커넥션이 닫힐 때 자동으로 일어나므로 unlock 호출은 없다 —
 * 프로세스가 죽어도 잠금이 남지 않는다.
 *
 * 잠금을 잡지 못하면 대기하지 않고 즉시 false다 — 배치는 기다리는 것보다 비켜주는 게 낫다.
 */
let held: ReservedSql | null = null

export async function tryAdvisoryLock(key: number): Promise<boolean> {
  if (held) return true
  const conn = await pgSql.reserve()
  try {
    const rows = await conn`select pg_try_advisory_lock(${key}) as locked`
    if (rows[0]?.locked === true) {
      held = conn
      return true
    }
  } catch (err) {
    conn.release()
    throw err
  }
  conn.release()
  return false
}
