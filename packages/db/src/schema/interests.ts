import { EMBEDDING_DIM } from '@jogan/core'
import { jsonb, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const interests = pgTable('interests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
  seedPaperIds: jsonb('seed_paper_ids').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
