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

export type PlanInterestAddResult =
  | { ok: true; newLabels: string[] }
  | { ok: false; reason: 'over-cap'; remaining: number }

/**
 * `addInterestsAction`(`/interests` 관심사 추가)의 상한 산술을 DB·세션 없이 순수하게
 * 계산한다. 제출된 라벨 중 이미 가진 라벨과 중복 제출된 라벨은 "새 라벨"에서 빼고
 * (그래서 이미 가진 라벨만 다시 제출해도 자리를 먹지 않는다), 그 개수를 기존 개수에
 * 더해 `max`를 넘으면 거부한다. `remaining`은 지금 더 추가할 수 있는 자리 수다.
 */
export function planInterestAdd(
  existingLabels: string[],
  submitted: string[],
  max: number,
): PlanInterestAddResult {
  const existingSet = new Set(existingLabels)
  const newLabels = [...new Set(submitted)].filter((label) => !existingSet.has(label))

  if (existingLabels.length + newLabels.length > max) {
    return { ok: false, reason: 'over-cap', remaining: Math.max(max - existingLabels.length, 0) }
  }

  return { ok: true, newLabels }
}
