import { date, index, pgTable, primaryKey, real, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { interests } from './interests'
import { papers } from './papers'

/**
 * 관련성 필터의 출력. 사용자·논문당 한 행이고, 한 논문이 여러 관심사에 걸리면
 * 가장 높은 relevance 쪽으로만 남는다 (queries/candidates.ts의 upsert 참고).
 */
export const paperCandidates = pgTable(
  'paper_candidates',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    /** 관심사가 삭제돼도 후보 자체는 남는다 */
    interestId: uuid('interest_id').references(() => interests.id, { onDelete: 'set null' }),
    relevance: real('relevance').notNull(),
    collectedFor: date('collected_for', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.paperId] }),
    index('paper_candidates_user_date').on(t.userId, t.collectedFor),
  ],
)
