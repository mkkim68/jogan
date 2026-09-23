import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from './env'
import * as schema from './schema'

// next dev의 HMR은 모듈을 다시 평가한다. 캐시하지 않으면 커넥션이 쌓여 "too many clients"가 난다.
declare global {
  var __joganSql: ReturnType<typeof postgres> | undefined
}

// prepare: false — Neon 풀링(pgbouncer) 호환
const sql =
  globalThis.__joganSql ??
  postgres(env.DATABASE_URL, { prepare: false, max: 10, idle_timeout: 20 })

if (process.env.NODE_ENV !== 'production') globalThis.__joganSql = sql

export const db = drizzle(sql, { schema })
export type Db = typeof db
