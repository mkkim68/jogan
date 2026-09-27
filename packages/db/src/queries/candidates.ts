import { and, count, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { paperCandidates } from '../schema'

export type CandidateRow = {
  userId: string
  paperId: string
  interestId: string | null
  relevance: number
  collectedFor: string
}

/**
 * 사용자·논문당 한 행. 이미 있으면 **더 높은 relevance일 때만** 갱신하고,
 * 그때 interestId·collectedFor도 함께 바꾼다 — 점수와 "어느 관심사로 걸렸는지"가
 * 어긋나면 안 된다.
 */
export async function upsertCandidates(rows: CandidateRow[]): Promise<void> {
  if (rows.length === 0) return
  await db
    .insert(paperCandidates)
    .values(rows)
    .onConflictDoUpdate({
      target: [paperCandidates.userId, paperCandidates.paperId],
      set: {
        relevance: sql`excluded.relevance`,
        interestId: sql`excluded.interest_id`,
        collectedFor: sql`excluded.collected_for`,
      },
      setWhere: sql`excluded.relevance > ${paperCandidates.relevance}`,
    })
}

export async function countCandidates(userId: string, collectedFor: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(paperCandidates)
    .where(and(eq(paperCandidates.userId, userId), eq(paperCandidates.collectedFor, collectedFor)))
  return row?.n ?? 0
}
