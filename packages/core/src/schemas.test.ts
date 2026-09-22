import { describe, expect, it } from 'vitest'
import {
  Assessment,
  Brief,
  EMBEDDING_DIM,
  Paper,
  SavedItem,
  UserSettings,
} from './index'

const embedding = Array.from({ length: EMBEDDING_DIM }, () => 0)

const paper = {
  id: '3f1c1a6e-1b7e-4c2a-9c1d-0a1b2c3d4e5f',
  doi: '10.1000/example.1',
  arxivId: null,
  title: '예시 논문',
  authors: [{ name: '홍길동', affiliation: '예시대학교' }],
  abstract: '초록',
  publishedAt: '2026-09-21T00:00:00.000Z',
  source: 'arxiv',
  venue: { name: 'NeurIPS 2026', kind: 'conference' },
  pdfUrl: 'https://example.org/paper.pdf',
  codeUrl: null,
  openAccess: true,
  embedding,
  mergedInto: null,
}

const score = { value: 0.8, reason: '근거' }

const assessment = {
  paperId: paper.id,
  track: 'verified',
  field: 'cs',
  stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
  stage2: { venueTier: 'A*', reviewStatus: 'accepted', reviewScore: null, authorTrackRecord: 0.5 },
  stage3: {
    reproducibility: score, design: score, statistics: score,
    claimVsEvidence: score, limitations: score,
    preregistered: null, studyDesign: null,
  },
  stage4: { influentialCitations: 0, githubStars: 12, mentions: 0 },
  evidence: [{ stage: 2, verdict: 'pass', text: '동료심사 통과' }],
  caveats: [],
  assessedAt: '2026-09-22T00:00:00.000Z',
}

describe('Paper', () => {
  it('정상 객체를 파싱하고 날짜를 Date로 변환한다', () => {
    const parsed = Paper.parse(paper)
    expect(parsed.publishedAt).toBeInstanceOf(Date)
    expect(parsed.embedding).toHaveLength(EMBEDDING_DIM)
  })
  it('제목이 비면 거부한다', () => {
    expect(() => Paper.parse({ ...paper, title: '' })).toThrow()
  })
  it('임베딩 길이가 다르면 거부한다', () => {
    expect(() => Paper.parse({ ...paper, embedding: [0, 1] })).toThrow()
  })
  it('임베딩은 null을 허용한다 (수집 직후)', () => {
    expect(Paper.parse({ ...paper, embedding: null }).embedding).toBeNull()
  })
})

describe('Assessment', () => {
  it('정상 객체를 파싱한다', () => {
    expect(Assessment.parse(assessment).track).toBe('verified')
  })
  it('점수가 0~1 밖이면 거부한다', () => {
    const bad = { ...assessment, stage3: { ...assessment.stage3, design: { value: 1.5, reason: 'x' } } }
    expect(() => Assessment.parse(bad)).toThrow()
  })
  it('근거 문장이 하나도 없으면 거부한다', () => {
    expect(() => Assessment.parse({ ...assessment, evidence: [] })).toThrow()
  })
  it('점수 value는 null을 허용하되 reason은 필수다', () => {
    const ok = { ...assessment, stage3: { ...assessment.stage3, design: { value: null, reason: '판단 불가' } } }
    expect(Assessment.parse(ok).stage3.design.value).toBeNull()
    const bad = { ...assessment, stage3: { ...assessment.stage3, design: { value: null, reason: '' } } }
    expect(() => Assessment.parse(bad)).toThrow()
  })
})

describe('Brief', () => {
  it('date는 YYYY-MM-DD만 받는다', () => {
    const brief = {
      id: '8d3b6a1e-9a2f-4f0c-8a5e-7b6c5d4e3f2a', userId: 'u1', date: '2026-09-22',
      issueNumber: 1, readMinutes: 6, audioUrl: null, audioSeconds: null, items: [],
    }
    expect(Brief.parse(brief).date).toBe('2026-09-22')
    expect(() => Brief.parse({ ...brief, date: '2026/09/22' })).toThrow()
  })
})

describe('SavedItem', () => {
  it('followUp이 null이거나 kind가 정해진 값이어야 한다', () => {
    const base = { userId: 'u1', paperId: paper.id, savedAt: '2026-09-01T00:00:00Z', readAt: null, memo: null }
    expect(SavedItem.parse({ ...base, followUp: null }).followUp).toBeNull()
    expect(SavedItem.parse({ ...base, followUp: { kind: 'accepted', text: 'Sleep에 채택', at: '2026-09-20T00:00:00Z' } }).followUp?.kind).toBe('accepted')
    expect(() => SavedItem.parse({ ...base, followUp: { kind: 'lost', text: '', at: '2026-09-20T00:00:00Z' } })).toThrow()
  })
})

describe('UserSettings', () => {
  const settings = { userId: 'u1', departureTime: '08:10', papersPerDay: 4, includePreprints: true }
  it('정상 객체를 파싱한다', () => {
    expect(UserSettings.parse(settings).papersPerDay).toBe(4)
  })
  it('하루 편수는 1~5', () => {
    expect(() => UserSettings.parse({ ...settings, papersPerDay: 0 })).toThrow()
    expect(() => UserSettings.parse({ ...settings, papersPerDay: 6 })).toThrow()
  })
  it('출발 시각은 HH:mm', () => {
    expect(() => UserSettings.parse({ ...settings, departureTime: '8:10' })).toThrow()
  })
})
