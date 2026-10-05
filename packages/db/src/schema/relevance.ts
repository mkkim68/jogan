import { boolean, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { interests } from './interests'
import { papers } from './papers'

/**
 * collector의 관련성 판정 캐시 (ADR 0001). (관심사, 논문)당 한 행.
 * 매칭은 매일 지난 COLLECT_WINDOW_DAYS를 다시 훑으므로, 캐시가 없으면 같은 쌍을 최대 14번 묻는다.
 * 판정 실패(보류)는 여기에 남기지 않는다 — 다음 실행이 다시 묻는다.
 */
export const relevanceJudgments = pgTable(
  'relevance_judgments',
  {
    interestId: uuid('interest_id').notNull().references(() => interests.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
    relevant: boolean('relevant').notNull(),
    /** 탈락 사례를 HISTORY.md에 적을 때 쓰는 관측 자료 */
    reason: text('reason').notNull(),
    /** 판정한 모델 id — 모델을 바꾸면 어느 판정이 옛 모델 것인지 가려낼 수 있게 */
    model: text('model').notNull(),
    /**
     * 판정에 쓴 프롬프트(`services/collector/prompts/relevance.md`)의 해시. 캐시는 모델과 이 값이
     * 모두 같을 때만 재사용한다 — 판정 기준을 바꾸면 손으로 캐시를 비우지 않아도 다시 묻는다.
     * 이 컬럼 도입 전 판정은 빈 문자열이라 어떤 현재 프롬프트와도 맞지 않는다.
     */
    promptHash: text('prompt_hash').notNull().default(''),
    judgedAt: timestamp('judged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.interestId, t.paperId] })],
)
