import type { Assessment, Author, BriefItem, Paper, PaperSummary, SavedItem, Venue } from '@jogan/core'
import { EMBEDDING_DIM, EmbeddingDimensionError } from '@jogan/core'
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
  categories?: string[]
}

/**
 * arXiv 논문 upsert. 같은 arxiv_id면 내용을 갱신하고, **초록이 바뀌면 embedding을 null로
 * 되돌린다** — 낡은 벡터로 매칭하면 안 된다.
 *
 * 갱신 대상은 "arXiv 재수집이 다시 알려주는 값"만이다: title·abstract·publishedAt·doi·
 * pdfUrl·authors·categories는 arXiv 쪽에서 새 버전이 나올 때마다 바뀔 수 있는 값이라
 * 매번 덮어쓴다. 반대로 venue·codeUrl·openAccess·mergedInto는 **뒷단계가 채워 넣는 값**이라
 * 여기서 건드리지 않는다 — venue는 출판본이 발견되면 바뀌고, codeUrl은 본문에서 찾아
 * 채워지고, mergedInto는 프리프린트·출판본 병합 결과다. arXiv 재수집이 이 컬럼들을
 * 초기값(null/false)으로 되돌리면 뒷단계가 이미 알아낸 정보를 잃는다. (다음 수집기를
 * arXiv 패턴을 베껴 만들 때도 이 구분을 그대로 지켜야 한다.)
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
        authors: sql`excluded.authors`,
        categories: sql`excluded.categories`,
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
    throw new EmbeddingDimensionError(EMBEDDING_DIM, embedding.length)
  }
  await db.update(papers).set({ embedding }).where(eq(papers.id, id))
}

/** relevance = 1 - 코사인거리. 내림차순 */
export async function matchPapersForInterest(
  embedding: number[],
  since: Date,
  limit: number,
): Promise<{ paperId: string; relevance: number; title: string; abstract: string }[]> {
  const relevance = sql<number>`1 - (${cosineDistance(papers.embedding, embedding)})`
  return db
    .select({ paperId: papers.id, relevance, title: papers.title, abstract: papers.abstract })
    .from(papers)
    .where(and(isNull(papers.mergedInto), gte(papers.publishedAt, since), sql`${papers.embedding} is not null`))
    .orderBy(desc(relevance))
    .limit(limit)
}
