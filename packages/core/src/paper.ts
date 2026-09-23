import { z } from 'zod'
import { EMBEDDING_DIM, PAPER_SOURCES, VENUE_KINDS } from './constants'

export const PaperSource = z.enum(PAPER_SOURCES)
export type PaperSource = z.infer<typeof PaperSource>

export const VenueKind = z.enum(VENUE_KINDS)
export type VenueKind = z.infer<typeof VenueKind>

export const Author = z.object({
  name: z.string().min(1),
  affiliation: z.string().optional(),
})
export type Author = z.infer<typeof Author>

export const Venue = z.object({
  name: z.string().min(1),
  kind: VenueKind,
})
export type Venue = z.infer<typeof Venue>

export const Embedding = z.array(z.number()).length(EMBEDDING_DIM)
export type Embedding = z.infer<typeof Embedding>

export const Paper = z.object({
  id: z.uuid(),
  doi: z.string().nullable(),
  arxivId: z.string().nullable(),
  title: z.string().min(1),
  authors: z.array(Author).min(1),
  abstract: z.string(),
  publishedAt: z.coerce.date(),
  source: PaperSource,
  venue: Venue.nullable(),
  pdfUrl: z.url().nullable(),
  codeUrl: z.url().nullable(),
  openAccess: z.boolean(),
  /** 수집 직후에는 없고 관련성 필터 전에 채워진다 */
  embedding: Embedding.nullable(),
  /** 프리프린트 ↔ 출판본 병합. 병합된 쪽이 살아남은 쪽의 id를 가리킨다 */
  mergedInto: z.uuid().nullable(),
})
export type Paper = z.infer<typeof Paper>

/** 목록 화면용. 1024차원 임베딩을 끌고 오지 않는다 */
export const PaperSummary = Paper.omit({ embedding: true })
export type PaperSummary = z.infer<typeof PaperSummary>
