import { z } from 'zod'
import { Embedding } from './paper'

export const Interest = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  label: z.string().min(1),
  embedding: Embedding.nullable(),
  seedPaperIds: z.array(z.uuid()),
})
export type Interest = z.infer<typeof Interest>
