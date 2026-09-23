import { describe, expect, it } from 'vitest'
import {
  rowToAssessment,
  rowToBriefItem,
  rowToPaper,
  rowToPaperSummary,
  rowToSavedItem,
  rowToUserSettings,
} from './mappers'

const paperRow = {
  id: '3f1c1a6e-1b7e-4c2a-9c1d-0a1b2c3d4e5f',
  doi: '10.1000/x',
  arxivId: null,
  title: '제목',
  authors: [{ name: '홍길동' }],
  abstract: '초록',
  publishedAt: new Date('2026-09-19T00:00:00Z'),
  source: 'arxiv' as const,
  venue: { name: 'NeurIPS 2026', kind: 'conference' as const },
  pdfUrl: 'https://example.org/a.pdf',
  codeUrl: null,
  openAccess: true,
  embedding: Array.from({ length: 1024 }, () => 0),
  mergedInto: null,
  createdAt: new Date('2026-09-19T00:00:00Z'),
}

describe('rowToPaper', () => {
  it('행을 도메인 Paper로 바꾸고 createdAt 같은 DB 전용 컬럼을 떨어뜨린다', () => {
    const paper = rowToPaper(paperRow)
    expect(paper.title).toBe('제목')
    expect(paper.publishedAt).toBeInstanceOf(Date)
    expect('createdAt' in paper).toBe(false)
  })
  it('임베딩이 null인 행도 받는다', () => {
    expect(rowToPaper({ ...paperRow, embedding: null }).embedding).toBeNull()
  })
})

describe('rowToPaperSummary', () => {
  it('임베딩을 뺀 객체를 돌려준다', () => {
    const summary = rowToPaperSummary({ ...paperRow, embedding: undefined })
    expect('embedding' in summary).toBe(false)
    expect(summary.title).toBe('제목')
  })
})

describe('rowToUserSettings', () => {
  it('pg time의 초 단위를 잘라 HH:mm으로 만든다', () => {
    const settings = rowToUserSettings({
      userId: 'u1',
      departureTime: '08:10:00',
      papersPerDay: 4,
      includePreprints: true,
      updatedAt: new Date(),
    })
    expect(settings.departureTime).toBe('08:10')
  })
  it('이미 HH:mm이면 그대로 둔다', () => {
    const settings = rowToUserSettings({
      userId: 'u1',
      departureTime: '08:10',
      papersPerDay: 4,
      includePreprints: true,
      updatedAt: new Date(),
    })
    expect(settings.departureTime).toBe('08:10')
  })
})

describe('rowToSavedItem', () => {
  const base = {
    userId: 'u1',
    paperId: paperRow.id,
    savedAt: new Date('2026-09-02T00:00:00Z'),
    readAt: null,
    memo: null,
  }
  it('jsonb의 followUp.at ISO 문자열을 Date로 복원한다', () => {
    const item = rowToSavedItem({
      ...base,
      followUp: { kind: 'accepted' as const, text: 'Sleep에 채택', at: '2026-09-20T00:00:00.000Z' },
    })
    expect(item.followUp?.at).toBeInstanceOf(Date)
    expect(item.followUp?.kind).toBe('accepted')
  })
  it('followUp이 없으면 null이다', () => {
    expect(rowToSavedItem({ ...base, followUp: null }).followUp).toBeNull()
  })
})

describe('rowToAssessment', () => {
  it('stage jsonb와 evidence를 그대로 파싱한다', () => {
    const score = { value: 0.8, reason: '근거' }
    const assessment = rowToAssessment({
      paperId: paperRow.id,
      track: 'verified' as const,
      field: 'cs' as const,
      stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
      stage2: { venueTier: 'A*', reviewStatus: 'accepted', reviewScore: null, authorTrackRecord: 0.4 },
      stage3: {
        reproducibility: score, design: score, statistics: score,
        claimVsEvidence: score, limitations: score, preregistered: null, studyDesign: null,
      },
      stage4: { influentialCitations: 0, githubStars: 12, mentions: 0 },
      evidence: [{ stage: 2 as const, verdict: 'pass' as const, text: '동료심사 통과' }],
      caveats: [],
      assessedAt: new Date('2026-09-22T00:00:00Z'),
    })
    expect(assessment.track).toBe('verified')
    expect(assessment.evidence).toHaveLength(1)
  })
})

describe('rowToBriefItem', () => {
  it('briefId와 position을 떨어뜨리고 도메인 BriefItem을 만든다', () => {
    const item = rowToBriefItem({
      briefId: '8d3b6a1e-9a2f-4f0c-8a5e-7b6c5d4e3f2a',
      position: 0,
      paperId: paperRow.id,
      interestId: null,
      oneLine: '한 줄',
      whyItMatters: '왜 중요한가',
      method: '방법',
      results: [{ label: '표본', value: '96명' }],
      limitations: [{ bySource: 'author' as const, text: '한계' }],
      quotes: [{ text: 'quote', locator: 'Abstract' }],
      isSerendipity: false,
    })
    expect(item.position).toBe(0)
    expect('briefId' in item).toBe(false)
    expect(item.interestId).toBeNull()
  })
})
