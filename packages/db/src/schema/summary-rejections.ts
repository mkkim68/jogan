import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { papers } from './papers'

/**
 * briefer가 요약을 원문 대조에서 통째로 버린 논문 (절대 규칙 1). 논문당 한 행.
 * 한 줄 요약이나 "그래서 뭐?"가 실패하면 그 논문은 배달하지 않는데, 기록이 없으면 다음 날 같은 논문을 다시
 * 요약하고 같은 이유로 버린다(HISTORY 2026-10-09: 같은 논문이 이틀 연속, Sonnet 호출이 매일 헛돈다).
 * 요약 입력(제목·초록·본문·평가)은 사용자와 무관하므로 사용자별이 아니다.
 * 모델이나 요약 프롬프트(`services/briefer/prompts/summary.md`)가 바뀌면 다시 시도한다 —
 * relevance_judgments의 prompt_hash와 같은 규칙. 검증 규칙(`packages/core/src/verify.ts`)만 바뀐 경우는
 * 자동으로 다시 보지 않는다: 그때는 이 테이블을 비운다.
 */
export const summaryRejections = pgTable('summary_rejections', {
  paperId: uuid('paper_id').primaryKey().references(() => papers.id, { onDelete: 'cascade' }),
  /** 걸린 필드 — oneLine | whyItMatters */
  field: text('field').$type<'oneLine' | 'whyItMatters'>().notNull(),
  sentence: text('sentence').notNull(),
  /** 걸린 수량어·숫자·이름 (`sentenceProblems`) — 필터 기준을 관측으로 조정할 자료 */
  problems: jsonb('problems').$type<string[]>().notNull(),
  /** 대조한 원문이 본문인지 초록인지(본문을 못 받은 날은 초록) */
  sourceKind: text('source_kind').$type<'본문' | '초록'>().notNull(),
  model: text('model').notNull(),
  promptHash: text('prompt_hash').notNull(),
  rejectedAt: timestamp('rejected_at', { withTimezone: true }).notNull().defaultNow(),
})
