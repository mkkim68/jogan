import { z } from 'zod'

export const User = z.object({
  id: z.string().min(1),
  email: z.email(),
  name: z.string().nullable(),
  image: z.string().nullable(),
})
export type User = z.infer<typeof User>

export const UserSettings = z.object({
  userId: z.string().min(1),
  /** 집에서 나서는 시각 HH:mm. 알림은 이 5분 전 */
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  papersPerDay: z.number().int().min(1).max(5),
  includePreprints: z.boolean(),
})
export type UserSettings = z.infer<typeof UserSettings>
