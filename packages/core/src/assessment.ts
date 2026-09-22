import { z } from 'zod'
import { FIELDS, TRACKS } from './constants'

export const Track = z.enum(TRACKS)
export type Track = z.infer<typeof Track>

export const Field = z.enum(FIELDS)
export type Field = z.infer<typeof Field>

/** 0~1 점수. 판단이 어려우면 value를 null로 두고 reason에 이유를 적는다 (PRD §9) */
export const Score = z.object({
  value: z.number().min(0).max(1).nullable(),
  reason: z.string().min(1),
})
export type Score = z.infer<typeof Score>

export const Stage1 = z.object({
  passed: z.boolean(),
  retracted: z.boolean(),
  predatoryVenue: z.boolean(),
  paperMillSignals: z.array(z.string()),
})
export type Stage1 = z.infer<typeof Stage1>

export const Stage2 = z.object({
  venueTier: z.string().nullable(),
  reviewStatus: z.string(),
  reviewScore: z.number().nullable(),
  /** 명성 편향 때문에 가중치를 낮게 둔다 */
  authorTrackRecord: z.number().min(0).max(1),
})
export type Stage2 = z.infer<typeof Stage2>

export const Stage3 = z.object({
  reproducibility: Score,
  design: Score,
  statistics: Score,
  claimVsEvidence: Score,
  limitations: Score,
  preregistered: z.boolean().nullable(),
  studyDesign: z.string().nullable(),
})
export type Stage3 = z.infer<typeof Stage3>

export const Stage4 = z.object({
  influentialCitations: z.number().int().min(0),
  githubStars: z.number().int().min(0).nullable(),
  mentions: z.number().int().min(0),
})
export type Stage4 = z.infer<typeof Stage4>

/** UI에 그대로 노출되는 근거 문장 */
export const Evidence = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  verdict: z.enum(['pass', 'caution']),
  text: z.string().min(1),
})
export type Evidence = z.infer<typeof Evidence>

export const Assessment = z.object({
  paperId: z.uuid(),
  track: Track,
  field: Field,
  stage1: Stage1,
  stage2: Stage2,
  stage3: Stage3,
  stage4: Stage4,
  evidence: z.array(Evidence).min(1),
  caveats: z.array(z.string()),
  assessedAt: z.coerce.date(),
})
export type Assessment = z.infer<typeof Assessment>
