import type { Assessment, BriefItem, Paper, PaperSummary, SavedItem } from '@jogan/core'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../client'
import { assessments, briefItems, briefs, papers, savedItems } from '../schema'
import { paperSummaryColumns } from './columns'
import { rowToAssessment, rowToBriefItem, rowToPaper, rowToPaperSummary, rowToSavedItem } from './mappers'

export type PaperDetail = {
  paper: Paper
  assessment: Assessment | null
  /** 이 사용자의 브리핑에 실렸다면 그 항목 (요약 텍스트가 여기 있다) */
  briefItem: BriefItem | null
  saved: SavedItem | null
}

export async function getPaperDetail(paperId: string, userId: string): Promise<PaperDetail | null> {
  const paperRow = await db.query.papers.findFirst({ where: eq(papers.id, paperId) })
  if (!paperRow) return null

  const [assessmentRow, itemRow, savedRow] = await Promise.all([
    db.query.assessments.findFirst({ where: eq(assessments.paperId, paperId) }),
    db
      .select({ item: briefItems })
      .from(briefItems)
      .innerJoin(briefs, eq(briefItems.briefId, briefs.id))
      .where(and(eq(briefItems.paperId, paperId), eq(briefs.userId, userId)))
      .limit(1),
    db.query.savedItems.findFirst({
      where: and(eq(savedItems.userId, userId), eq(savedItems.paperId, paperId)),
    }),
  ])

  const { createdAt: _createdAt, ...paper } = paperRow
  return {
    paper: rowToPaper(paper),
    assessment: assessmentRow ? rowToAssessment(assessmentRow) : null,
    briefItem: itemRow[0] ? rowToBriefItem(itemRow[0].item) : null,
    saved: savedRow ? rowToSavedItem(savedRow) : null,
  }
}

/**
 * "함께 읽으면 좋은 논문" — 추천 로직이 아직 없다.
 * 같은 브리핑의 다른 항목에서 최대 2편을 가져온다.
 */
export async function getRelatedInBrief(paperId: string, userId: string): Promise<PaperSummary[]> {
  // 서브쿼리로 한 번에 묶으면 drizzle 0.45에서 타입이 맞지 않아 두 단계로 나눈다.
  const ownItem = await db
    .select({ briefId: briefItems.briefId })
    .from(briefItems)
    .innerJoin(briefs, eq(briefItems.briefId, briefs.id))
    .where(and(eq(briefItems.paperId, paperId), eq(briefs.userId, userId)))
    .limit(1)

  const briefId = ownItem[0]?.briefId
  if (!briefId) return []

  const rows = await db
    .select({ paper: paperSummaryColumns })
    .from(briefItems)
    .innerJoin(papers, eq(briefItems.paperId, papers.id))
    .where(and(eq(briefItems.briefId, briefId), ne(briefItems.paperId, paperId)))
    .orderBy(briefItems.position)
    .limit(2)

  return rows.map((r) => rowToPaperSummary(r.paper))
}
