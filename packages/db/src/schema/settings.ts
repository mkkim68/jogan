import { boolean, integer, pgTable, text, time, timestamp } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  departureTime: time('departure_time').notNull(),
  papersPerDay: integer('papers_per_day').notNull().default(4),
  includePreprints: boolean('include_preprints').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
