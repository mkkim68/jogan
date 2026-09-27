import type { Assessment, Author, BriefItem, Paper, PaperSummary, SavedItem, Venue } from '@jogan/core'
import { EMBEDDING_DIM } from '@jogan/core'
import { and, cosineDistance, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm'
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

export type NewPaper = {
  doi: string | null
  arxivId: string
  title: string
  authors: Author[]
  abstract: string
  publishedAt: Date
  source: 'arxiv'
  venue: Venue
  pdfUrl: string | null
  codeUrl: string | null
  openAccess: boolean
}

/**
 * arXiv 논문 upsert. 같은 arxiv_id면 내용을 갱신하고, **초록이 바뀌면 embedding을 null로
 * 되돌린다** — 낡은 벡터로 매칭하면 안 된다.
 */
export async function upsertArxivPapers(rows: NewPaper[]): Promise<number> {
  if (rows.length === 0) return 0
  const inserted = await db
    .insert(papers)
    .values(rows.map((r) => ({ ...r, embedding: null, mergedInto: null })))
    .onConflictDoUpdate({
      target: papers.arxivId,
      set: {
        title: sql`excluded.title`,
        abstract: sql`excluded.abstract`,
        publishedAt: sql`excluded.published_at`,
        doi: sql`excluded.doi`,
        pdfUrl: sql`excluded.pdf_url`,
        embedding: sql`case when ${papers.abstract} is distinct from excluded.abstract
                            then null else ${papers.embedding} end`,
      },
    })
    .returning({ id: papers.id })
  return inserted.length
}

export async function listUnembeddedPapers(
  limit: number,
): Promise<{ id: string; title: string; abstract: string }[]> {
  return db
    .select({ id: papers.id, title: papers.title, abstract: papers.abstract })
    .from(papers)
    .where(isNull(papers.embedding))
    .limit(limit)
}

export async function setPaperEmbedding(id: string, embedding: number[]): Promise<void> {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`임베딩 차원이 ${EMBEDDING_DIM}이 아니다: ${embedding.length}`)
  }
  await db.update(papers).set({ embedding }).where(eq(papers.id, id))
}

/** relevance = 1 - 코사인거리. 내림차순 */
export async function matchPapersForInterest(
  embedding: number[],
  since: Date,
  limit: number,
): Promise<{ paperId: string; relevance: number }[]> {
  const relevance = sql<number>`1 - (${cosineDistance(papers.embedding, embedding)})`
  return db
    .select({ paperId: papers.id, relevance })
    .from(papers)
    .where(and(isNull(papers.mergedInto), gte(papers.publishedAt, since), sql`${papers.embedding} is not null`))
    .orderBy(desc(relevance))
    .limit(limit)
}
