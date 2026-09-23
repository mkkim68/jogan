import { z } from 'zod'

export const FollowUp = z.object({
  kind: z.enum(['accepted', 'refuted', 'updated']),
  text: z.string().min(1),
  at: z.coerce.date(),
})
export type FollowUp = z.infer<typeof FollowUp>

export const SavedItem = z.object({
  userId: z.string().min(1),
  paperId: z.uuid(),
  savedAt: z.coerce.date(),
  readAt: z.coerce.date().nullable(),
  memo: z.string().nullable(),
  followUp: FollowUp.nullable(),
})
export type SavedItem = z.infer<typeof SavedItem>
