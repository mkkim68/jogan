import { papers } from '../schema'

/** 목록 쿼리용 — 1024차원 embedding을 SQL에서부터 제외한다 */
export const paperSummaryColumns = {
  id: papers.id,
  doi: papers.doi,
  arxivId: papers.arxivId,
  title: papers.title,
  authors: papers.authors,
  abstract: papers.abstract,
  publishedAt: papers.publishedAt,
  source: papers.source,
  venue: papers.venue,
  pdfUrl: papers.pdfUrl,
  codeUrl: papers.codeUrl,
  openAccess: papers.openAccess,
  mergedInto: papers.mergedInto,
} as const
