import type { Assessment, BriefItem, PaperSummary } from '@jogan/core'
import { and, desc, eq, lte } from 'drizzle-orm'
import { db } from '../client'
import { assessments, briefItems, briefs, papers } from '../schema'
import { paperSummaryColumns } from './columns'
import { rowToAssessment, rowToBriefItem, rowToPaperSummary } from './mappers'

export type BriefView = {
  brief: {
    id: string
    date: string
    issueNumber: number
    readMinutes: number
    audioUrl: string | null
    audioSeconds: number | null
  }
  items: { item: BriefItem; paper: PaperSummary; assessment: Assessment | null }[]
  /** 오늘자 브리핑인가. false면 화면에 "지난 브리핑" 라벨을 붙인다 */
  isToday: boolean
}

async function loadBrief(briefRow: typeof briefs.$inferSelect, today: string): Promise<BriefView> {
  const rows = await db
    .select({ item: briefItems, paper: paperSummaryColumns, assessment: assessments })
    .from(briefItems)
    .innerJoin(papers, eq(briefItems.paperId, papers.id))
    .leftJoin(assessments, eq(assessments.paperId, papers.id))
    .where(eq(briefItems.briefId, briefRow.id))
    .orderBy(briefItems.position)

  return {
    brief: {
      id: briefRow.id,
      date: briefRow.date,
      issueNumber: briefRow.issueNumber,
      readMinutes: briefRow.readMinutes,
      audioUrl: briefRow.audioUrl,
      audioSeconds: briefRow.audioSeconds,
    },
    items: rows.map((r) => ({
      item: rowToBriefItem(r.item),
      paper: rowToPaperSummary(r.paper),
      assessment: r.assessment ? rowToAssessment(r.assessment) : null,
    })),
    isToday: briefRow.date === today,
  }
}

export async function getTodayBrief(userId: string, today: string): Promise<BriefView | null> {
  const row = await db.query.briefs.findFirst({
    where: and(eq(briefs.userId, userId), eq(briefs.date, today)),
  })
  return row ? loadBrief(row, today) : null
}

/** 오늘자가 없을 때 쓴다. 빈 브리핑을 보여주지 않는다 (PRD §5) */
export async function getLatestBrief(userId: string): Promise<BriefView | null> {
  const row = await db.query.briefs.findFirst({
    where: eq(briefs.userId, userId),
    orderBy: [desc(briefs.date)],
  })
  return row ? loadBrief(row, row.date) : null
}

/** 오늘(또는 어제)부터 하루도 빠지지 않고 이어진 브리핑 일수 */
export async function countStreak(userId: string, today: string): Promise<number> {
  const rows = await db
    .select({ date: briefs.date })
    .from(briefs)
    .where(and(eq(briefs.userId, userId), lte(briefs.date, today)))
    .orderBy(desc(briefs.date))

  const dates = rows.map((r) => r.date)
  if (dates.length === 0) return 0

  const dayMs = 86_400_000
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  const firstMs = Date.parse(`${dates[0]}T00:00:00Z`)
  // 오늘 것이 아직 없으면 어제까지 이어진 기록을 센다
  if (todayMs - firstMs > dayMs) return 0

  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    const prev = Date.parse(`${dates[i - 1]}T00:00:00Z`)
    const cur = Date.parse(`${dates[i]}T00:00:00Z`)
    if (prev - cur !== dayMs) break
    streak++
  }
  return streak
}
