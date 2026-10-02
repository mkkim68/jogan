import type { BriefItem, Evidence, Stage3 } from '@jogan/core'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { assessments, briefItems, briefs, paperCandidates, papers, relevanceJudgments } from '../schema'

export type BriefCandidate = {
  paperId: string
  interestId: string
  relevance: number
  title: string
  abstract: string
  arxivId: string | null
  track: 'verified' | 'notable'
  stage3: Stage3 | null
  evidence: Evidence[]
  caveats: string[]
}

export type NewBriefItemRow = {
  position: number
  paperId: string
  interestId: string | null
  oneLine: string
  whyItMatters: string
  method: string
  results: BriefItem['results']
  limitations: BriefItem['limitations']
  quotes: BriefItem['quotes']
  isSerendipity: boolean
}

/**
 * 이 사용자의 브리핑 후보 (ADR 0002).
 * 관련성 **통과 판정**이 있는 후보만 본다 — 판정 도입 이전에 만들어져 판정을 받지 못한 행과
 * 탈락한 행은 빠진다(ADR 0001 「결과」). 평가(`assessments`)가 없는 논문, 병합된 논문,
 * 이 사용자에게 이미 배달한 논문도 뺀다. 날짜로는 거르지 않는다 — 어제 배달하지 못한 후보가
 * 오늘 자리를 채울 수 있게(PRD §5 "전날 미배달 논문으로 채운다").
 */
export async function listBriefCandidates(userId: string): Promise<BriefCandidate[]> {
  const rows = await db
    .select({
      paperId: paperCandidates.paperId,
      interestId: relevanceJudgments.interestId,
      relevance: paperCandidates.relevance,
      title: papers.title,
      abstract: papers.abstract,
      arxivId: papers.arxivId,
      track: assessments.track,
      stage3: assessments.stage3,
      evidence: assessments.evidence,
      caveats: assessments.caveats,
    })
    .from(paperCandidates)
    .innerJoin(papers, eq(papers.id, paperCandidates.paperId))
    .innerJoin(assessments, eq(assessments.paperId, paperCandidates.paperId))
    .innerJoin(
      relevanceJudgments,
      and(
        eq(relevanceJudgments.interestId, paperCandidates.interestId),
        eq(relevanceJudgments.paperId, paperCandidates.paperId),
        eq(relevanceJudgments.relevant, true),
      ),
    )
    .where(
      and(
        eq(paperCandidates.userId, userId),
        isNull(papers.mergedInto),
        // ①단계(규칙) 실패 논문은 평가 행이 남아 있어도 배달하지 않는다 (PRD §3 ①)
        sql`(${assessments.stage1}->>'passed')::boolean = true`,
        sql`not exists (
          select 1 from ${briefItems} bi join ${briefs} b on b.id = bi.brief_id
          where b.user_id = ${userId} and bi.paper_id = ${paperCandidates.paperId}
        )`,
      ),
    )
  return rows
}

export async function hasBriefForDate(userId: string, date: string): Promise<boolean> {
  const row = await db.query.briefs.findFirst({ where: and(eq(briefs.userId, userId), eq(briefs.date, date)) })
  return row !== undefined
}

/** 이 사용자의 마지막 호수 + 1. 처음이면 1 */
export async function nextIssueNumber(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: briefs.issueNumber })
    .from(briefs)
    .where(eq(briefs.userId, userId))
    .orderBy(desc(briefs.issueNumber))
    .limit(1)
  return (row?.n ?? 0) + 1
}

/** 브리핑과 항목을 한 트랜잭션으로 저장한다. 새 브리핑 id를 돌려준다 */
export async function insertBrief(
  brief: { userId: string; date: string; issueNumber: number; readMinutes: number },
  items: NewBriefItemRow[],
): Promise<string> {
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(briefs).values(brief).returning({ id: briefs.id })
    if (!created) throw new Error('브리핑 저장 실패: id를 돌려받지 못했다')
    if (items.length > 0) {
      await tx.insert(briefItems).values(items.map((item) => ({ ...item, briefId: created.id })))
    }
    return created.id
  })
}
