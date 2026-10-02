import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { paperCandidates, relevanceJudgments } from '../schema'

export type NewRelevanceJudgment = typeof relevanceJudgments.$inferInsert

/** 판정 기준의 정체. 캐시는 둘 다 같을 때만 재사용한다 */
export type JudgeVersion = { model: string; promptHash: string }

/**
 * 이 관심사에 대해 **같은 모델·같은 프롬프트로** 이미 판정한 논문들.
 * 키가 없으면 아직 판정하지 않았거나, 보류됐거나, 옛 기준으로 판정한 쌍이다.
 */
export async function listRelevanceJudgments(
  interestId: string,
  paperIds: string[],
  version: JudgeVersion,
): Promise<Map<string, boolean>> {
  if (paperIds.length === 0) return new Map()
  const rows = await db
    .select({ paperId: relevanceJudgments.paperId, relevant: relevanceJudgments.relevant })
    .from(relevanceJudgments)
    .where(
      and(
        eq(relevanceJudgments.interestId, interestId),
        inArray(relevanceJudgments.paperId, paperIds),
        eq(relevanceJudgments.model, version.model),
        eq(relevanceJudgments.promptHash, version.promptHash),
      ),
    )
  return new Map(rows.map((r) => [r.paperId, r.relevant]))
}

/** 같은 쌍을 다시 판정하면 덮어쓴다 */
export async function saveRelevanceJudgments(rows: NewRelevanceJudgment[]): Promise<void> {
  if (rows.length === 0) return
  await db
    .insert(relevanceJudgments)
    .values(rows)
    .onConflictDoUpdate({
      target: [relevanceJudgments.interestId, relevanceJudgments.paperId],
      set: {
        relevant: sql`excluded.relevant`,
        reason: sql`excluded.reason`,
        model: sql`excluded.model`,
        promptHash: sql`excluded.prompt_hash`,
        judgedAt: sql`now()`,
      },
    })
}

/**
 * 탈락한 (관심사, 논문) 쌍에 해당하는 기존 후보 행을 지운다.
 * 세 개(userId, paperId, interestId)가 모두 맞을 때만 지운다 — 같은 논문이 다른 관심사로
 * 걸린 행은 그 관심사에서는 통과한 것이므로 남긴다.
 */
export async function deleteCandidatesForPairs(
  userId: string,
  pairs: { interestId: string; paperId: string }[],
): Promise<void> {
  if (pairs.length === 0) return
  await db
    .delete(paperCandidates)
    .where(
      and(
        eq(paperCandidates.userId, userId),
        or(
          ...pairs.map((p) =>
            and(eq(paperCandidates.interestId, p.interestId), eq(paperCandidates.paperId, p.paperId)),
          ),
        ),
      ),
    )
}
