import type { Author } from '@jogan/core'
import { isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { assessments } from '../schema/assessments'
import { paperCandidates } from '../schema/candidates'
import { papers } from '../schema/papers'

export type NewAssessment = typeof assessments.$inferInsert

export type UnassessedPaper = {
  id: string
  arxivId: string | null
  doi: string | null
  title: string
  abstract: string
  authors: Author[]
  categories: string[] | null
}

/**
 * 후보로 올라왔지만 아직 판정이 없는 논문. 사용자가 여럿이어도 논문당 한 번만 평가한다
 * (assessments는 paperId가 PK라 사용자 간에 공유된다).
 */
export async function listUnassessedCandidatePapers(limit: number): Promise<UnassessedPaper[]> {
  const rows = await db
    .selectDistinct({
      id: papers.id,
      arxivId: papers.arxivId,
      doi: papers.doi,
      title: papers.title,
      abstract: papers.abstract,
      authors: papers.authors,
      categories: papers.categories,
    })
    .from(paperCandidates)
    .innerJoin(papers, sql`${papers.id} = ${paperCandidates.paperId}`)
    .leftJoin(assessments, sql`${assessments.paperId} = ${papers.id}`)
    .where(isNull(assessments.paperId))
    .limit(limit)
  return rows
}

/** 판정은 논문당 1행. 다시 평가하면 덮어쓴다 */
export async function upsertAssessment(row: NewAssessment): Promise<void> {
  await db
    .insert(assessments)
    .values(row)
    .onConflictDoUpdate({
      target: assessments.paperId,
      set: {
        track: row.track,
        field: row.field,
        stage1: row.stage1,
        stage2: row.stage2,
        stage3: row.stage3 ?? null,
        stage4: row.stage4 ?? null,
        evidence: row.evidence,
        caveats: row.caveats,
        assessedAt: new Date(),
      },
    })
}
