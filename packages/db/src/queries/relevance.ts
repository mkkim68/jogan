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

/**
 * 현재 판정 기준(모델·프롬프트 해시)의 **통과 판정이 없는** 후보 행을 지운다. 지운 행 수를 돌려준다.
 *
 * 매칭은 그날 관심사별 상위 20편만 판정하므로, 기준을 바꾼 뒤 상위 20편 밖으로 밀린 옛 통과 후보나
 * 판정 도입 이전 후보(2026-09-29)는 탈락 처리로는 지워지지 않는다 — 그대로 두면 evaluator가 평가
 * 비용을 쓰고 briefer가 배달할 수 있다. 후보는 "지금 기준으로 통과한 쌍"이라는 불변식을 여기서 지킨다.
 * 판정이 보류된 쌍도 지워진다 — 다음 실행에서 다시 판정해 통과하면 다시 후보가 된다.
 */
export async function deleteCandidatesWithoutCurrentJudgment(userId: string, version: JudgeVersion): Promise<number> {
  const deleted = await db
    .delete(paperCandidates)
    .where(
      and(
        eq(paperCandidates.userId, userId),
        sql`not exists (
          select 1 from ${relevanceJudgments} r
          where r.interest_id = ${paperCandidates.interestId}
            and r.paper_id = ${paperCandidates.paperId}
            and r.relevant
            and r.model = ${version.model}
            and r.prompt_hash = ${version.promptHash}
        )`,
      ),
    )
    .returning({ paperId: paperCandidates.paperId })
  return deleted.length
}
