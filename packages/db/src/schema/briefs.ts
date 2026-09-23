import type { BriefItem } from '@jogan/core'
import {
  boolean, date, integer, pgTable, primaryKey, text, timestamp, unique, uuid, jsonb,
} from 'drizzle-orm/pg-core'
import { users } from './auth'
import { interests } from './interests'
import { papers } from './papers'

export const briefs = pgTable(
  'briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    issueNumber: integer('issue_number').notNull(),
    readMinutes: integer('read_minutes').notNull().default(0),
    audioUrl: text('audio_url'),
    audioSeconds: integer('audio_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('briefs_user_date').on(t.userId, t.date)],
)

export const briefItems = pgTable(
  'brief_items',
  {
    briefId: uuid('brief_id').notNull().references(() => briefs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    interestId: uuid('interest_id').references(() => interests.id, { onDelete: 'set null' }),
    oneLine: text('one_line').notNull(),
    whyItMatters: text('why_it_matters').notNull(),
    method: text('method').notNull(),
    results: jsonb('results').$type<BriefItem['results']>().notNull(),
    limitations: jsonb('limitations').$type<BriefItem['limitations']>().notNull(),
    quotes: jsonb('quotes').$type<BriefItem['quotes']>().notNull(),
    isSerendipity: boolean('is_serendipity').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.briefId, t.position] })],
)
