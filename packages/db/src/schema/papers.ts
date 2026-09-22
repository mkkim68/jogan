import { EMBEDDING_DIM, PAPER_SOURCES, type Author, type Venue } from '@jogan/core'
import {
  boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid, vector, type AnyPgColumn,
} from 'drizzle-orm/pg-core'

export const paperSource = pgEnum('paper_source', PAPER_SOURCES)

export const papers = pgTable('papers', {
  id: uuid('id').primaryKey().defaultRandom(),
  doi: text('doi').unique(),
  arxivId: text('arxiv_id').unique(),
  title: text('title').notNull(),
  authors: jsonb('authors').$type<Author[]>().notNull(),
  abstract: text('abstract').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  source: paperSource('source').notNull(),
  venue: jsonb('venue').$type<Venue>(),
  pdfUrl: text('pdf_url'),
  codeUrl: text('code_url'),
  openAccess: boolean('open_access').notNull().default(false),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
  mergedInto: uuid('merged_into').references((): AnyPgColumn => papers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
