import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from './env'
import * as schema from './schema'

// prepare: false — Neon 풀링(pgbouncer) 호환
const sql = postgres(env.DATABASE_URL, { prepare: false })

export const db = drizzle(sql, { schema })
export type Db = typeof db
