import { z } from 'zod'

export const BriefItem = z.object({
  paperId: z.uuid(),
  /** 관심 주제와 유사한(주변) 분야 논문(isSerendipity)은 관심사가 없다 */
  interestId: z.uuid().nullable(),
  position: z.number().int().min(0),
  oneLine: z.string().min(1),
  whyItMatters: z.string().min(1),
  method: z.string(),
  results: z.array(z.object({ label: z.string(), value: z.string() })),
  limitations: z.array(z.object({ bySource: z.enum(['author', 'ai']), text: z.string() })),
  quotes: z.array(z.object({ text: z.string(), locator: z.string() })),
  /**
   * 필드명은 내부용이라 그대로 둔다(컬럼 리네임에는 마이그레이션이 필요하다). 사용자에게는
   * 절대 이 이름을 보여주지 않는다 — 실제 의미는 "관심 주제와 유사한 1편"이다("관심사
   * 바깥"이 아니라 "인접/주변" 분야). 화면 라벨은 `docs/DESIGN.md`를 따른다.
   */
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
