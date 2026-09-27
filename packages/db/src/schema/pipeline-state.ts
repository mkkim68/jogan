import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * 파이프라인 단계가 다음 실행에 넘기는 작은 상태. 지금은 collector의 워터마크뿐이고
 * evaluator·briefer도 같은 테이블을 쓴다.
 * 키 예: 'collector:arxiv:last_submitted_at'
 */
export const pipelineState = pgTable('pipeline_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
