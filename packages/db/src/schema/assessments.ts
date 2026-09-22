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
  stage3: jsonb('stage3').$type<Stage3>().notNull(),
  stage4: jsonb('stage4').$type<Stage4>().notNull(),
  evidence: jsonb('evidence').$type<Evidence[]>().notNull(),
  caveats: jsonb('caveats').$type<string[]>().notNull(),
  assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
})
