import type { FollowUp } from '@jogan/core'
import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { papers } from './papers'

export const savedItems = pgTable(
  'saved_items',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    memo: text('memo'),
    followUp: jsonb('follow_up').$type<FollowUp>(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.paperId] })],
)
