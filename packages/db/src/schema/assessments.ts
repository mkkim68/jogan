import {
  FIELDS, TRACKS, type Evidence, type Stage1, type Stage2, type Stage3, type Stage4,
} from '@jogan/core'
import { jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { papers } from './papers'

export const assessmentTrack = pgEnum('assessment_track', TRACKS)
export const paperField = pgEnum('paper_field', FIELDS)

/** 논문당 1행. 같은 논문을 두 번 평가하지 않도록 사용자 간 공유한다 */
export const assessments = pgTable('assessments', {
  paperId: uuid('paper_id').primaryKey().references(() => papers.id, { onDelete: 'cascade' }),
  track: assessmentTrack('track').notNull(),
  field: paperField('field').notNull(),
  stage1: jsonb('stage1').$type<Stage1>().notNull(),
  stage2: jsonb('stage2').$type<Stage2>().notNull(),
  // ③b는 상위 몇 편에만, ④는 아직 미구현이라 null이 정직한 값이다 (@jogan/core Assessment와 동일)
  stage3: jsonb('stage3').$type<Stage3>(),
  stage4: jsonb('stage4').$type<Stage4>(),
  evidence: jsonb('evidence').$type<Evidence[]>().notNull(),
  caveats: jsonb('caveats').$type<string[]>().notNull(),
  assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
})
