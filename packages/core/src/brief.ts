import { z } from 'zod'

export const BriefItem = z.object({
  paperId: z.uuid(),
  /** 곁가지(isSerendipity)는 관심사가 없다 */
  interestId: z.uuid().nullable(),
  position: z.number().int().min(0),
  oneLine: z.string().min(1),
  whyItMatters: z.string().min(1),
  method: z.string(),
  results: z.array(z.object({ label: z.string(), value: z.string() })),
  limitations: z.array(z.object({ bySource: z.enum(['author', 'ai']), text: z.string() })),
  quotes: z.array(z.object({ text: z.string(), locator: z.string() })),
  isSerendipity: z.boolean(),
})
export type BriefItem = z.infer<typeof BriefItem>

export const Brief = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  date: z.iso.date(),
  issueNumber: z.number().int().positive(),
  readMinutes: z.number().int().min(0),
  audioUrl: z.url().nullable(),
  audioSeconds: z.number().int().min(0).nullable(),
  items: z.array(BriefItem),
})
export type Brief = z.infer<typeof Brief>
