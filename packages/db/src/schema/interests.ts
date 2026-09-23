import { EMBEDDING_DIM } from '@jogan/core'
import { jsonb, pgTable, text, timestamp, unique, uuid, vector } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const interests = pgTable(
  'interests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    seedPaperIds: jsonb('seed_paper_ids').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // 같은 사용자가 같은 라벨을 두 번 가질 이유가 없다 — 온보딩 재제출 시 중복 삽입을 막는다
  (t) => [unique('interests_user_label').on(t.userId, t.label)],
)
