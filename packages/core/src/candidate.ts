import { z } from 'zod'

/** 관련성 필터를 통과해 evaluator에게 넘어갈 논문. 사용자·논문당 한 행 */
export const PaperCandidate = z.object({
  userId: z.string().min(1),
  paperId: z.uuid(),
  /** 어느 관심사로 걸렸는지. 관심사가 삭제되면 null이 된다 */
  interestId: z.uuid().nullable(),
  /** 코사인 유사도 0~1 */
  relevance: z.number().min(0).max(1),
  /** KST 기준 수집일 */
  collectedFor: z.string().date(),
})
export type PaperCandidate = z.infer<typeof PaperCandidate>
