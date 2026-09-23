import type { FollowUp } from '@jogan/core'
import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { papers } from './papers'

/** jsonb는 Date를 ISO 문자열로 저장한다. 도메인 FollowUp으로 복원은 core의 FollowUp.parse() */
export type FollowUpRow = Omit<FollowUp, 'at'> & { at: string }

export const savedItems = pgTable(
  'saved_items',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    memo: text('memo'),
    followUp: jsonb('follow_up').$type<FollowUpRow>(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.paperId] })],
)
