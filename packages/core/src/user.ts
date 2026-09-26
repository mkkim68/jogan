import { z } from 'zod'
import { MAX_INTERESTS } from './constants'

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

/**
 * 라벨 하나의 제약 — 앞뒤 공백은 trim(zod v4의 `.trim()`은 값을 변환하므로 `parsed.data`에는
 * 이미 trim된 값이 담긴다), trim 후 길이 1~60. `[" "]`처럼 공백만 있는 라벨이 빈 행으로
 * 저장되는 것과, `[" 인과추론 "]`처럼 앞뒤 공백만 다른 라벨이 dedupe·유니크 인덱스를 우회해
 * 시각적 중복을 만드는 것을 막는다. 상한 60은 거대한 라벨이 그대로 임베딩 API로 넘어가는
 * 것을 막는다(CLAUDE.md 비용 규칙).
 */
const InterestLabel = z.string().trim().min(1).max(60)

/** `/onboarding` 제출값. userId는 서버 액션이 세션에서 채운다 — 클라이언트에서 받지 않는다 */
export const OnboardingInput = UserSettings.omit({ userId: true }).extend({
  labels: z.array(InterestLabel).min(1).max(MAX_INTERESTS),
})
export type OnboardingInput = z.infer<typeof OnboardingInput>

/**
 * `/interests` 관심사 추가 제출값. `OnboardingInput`의 라벨 제약(1~`MAX_INTERESTS`개)과
 * 동일하게 맞춘다 — 이건 "한 번에 제출하는 개수"의 상한이다. 사용자가 가질 수 있는
 * **관심사 총 개수**의 상한(`MAX_INTERESTS`) 자체는 액션(`addInterestsAction`)이
 * 기존 개수와 합산해 강제한다.
 */
export const AddInterestsInput = z.object({
  labels: z.array(InterestLabel).min(1).max(MAX_INTERESTS),
})
export type AddInterestsInput = z.infer<typeof AddInterestsInput>

/** `/settings` 제출값. `userId`는 서버 액션이 세션에서 채운다 — 클라이언트에서 받지 않는다 */
export const SettingsInput = UserSettings.omit({ userId: true })
export type SettingsInput = z.infer<typeof SettingsInput>
