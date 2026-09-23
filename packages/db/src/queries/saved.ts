import type { Assessment, PaperSummary, SavedItem } from '@jogan/core'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { assessments, papers, savedItems } from '../schema'
import { paperSummaryColumns } from './columns'
import { rowToAssessment, rowToPaperSummary, rowToSavedItem } from './mappers'

export type SavedView = { item: SavedItem; paper: PaperSummary; assessment: Assessment | null }

export async function listSaved(userId: string): Promise<SavedView[]> {
  const rows = await db
    .select({ item: savedItems, paper: paperSummaryColumns, assessment: assessments })
    .from(savedItems)
    .innerJoin(papers, eq(savedItems.paperId, papers.id))
    .leftJoin(assessments, eq(assessments.paperId, papers.id))
    .where(eq(savedItems.userId, userId))
    .orderBy(desc(savedItems.savedAt))

  return rows.map((r) => ({
    item: rowToSavedItem(r.item),
    paper: rowToPaperSummary(r.paper),
    assessment: r.assessment ? rowToAssessment(r.assessment) : null,
  }))
}

/** `TopBar`의 "저장함 N" 배지용 — `papers`/`assessments`를 조인하지 않고 정수 하나만 센다 */
export async function countSaved(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(savedItems)
    .where(eq(savedItems.userId, userId))
  return row?.count ?? 0
}

/** 저장 여부만 필요한 곳(예: `toggleSave`)에서 `getPaperDetail` 전체를 부르지 않도록 하는 한 행 조회 */
export async function isSaved(userId: string, paperId: string): Promise<boolean> {
  const [row] = await db
    .select({ paperId: savedItems.paperId })
    .from(savedItems)
    .where(and(eq(savedItems.userId, userId), eq(savedItems.paperId, paperId)))
    .limit(1)
  return row != null
}

export async function savePaper(userId: string, paperId: string): Promise<void> {
  await db.insert(savedItems).values({ userId, paperId }).onConflictDoNothing()
}

export async function unsavePaper(userId: string, paperId: string): Promise<void> {
  await db
    .delete(savedItems)
    .where(and(eq(savedItems.userId, userId), eq(savedItems.paperId, paperId)))
}

export async function markRead(userId: string, paperId: string): Promise<void> {
  await db
    .update(savedItems)
    .set({ readAt: new Date() })
    .where(and(eq(savedItems.userId, userId), eq(savedItems.paperId, paperId)))
}
