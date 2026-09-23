import type { Assessment, PaperSummary, SavedItem } from '@jogan/core'
import { and, desc, eq } from 'drizzle-orm'
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
