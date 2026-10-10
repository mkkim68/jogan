import type { BriefCandidate, NewBriefItemRow, SummaryRejectionRow } from '@jogan/db'
import { describe, expect, it } from 'vitest'
import { BRIEF_MAX_SUMMARY_ATTEMPTS } from '@jogan/core'
import { buildBriefs, readMinutesOf, type BriefDeps } from './index'
import { summarizerVersion, type SummaryDraft, type SummaryInput } from './summarize'

const score = (value: number | null) => ({ value, reason: 'r' })
const stage3 = {
  reproducibility: score(0.8), design: score(0.8), statistics: score(0.8),
  claimVsEvidence: score(0.8), limitations: score(0.8), preregistered: null, studyDesign: null,
}

const cand = (paperId: string, over: Partial<BriefCandidate> = {}): BriefCandidate => ({
  paperId, interestId: `i-${paperId}`, relevance: 0.5, title: `T ${paperId}`,
  abstract: `Abstract of ${paperId}.`, arxivId: `2609.${paperId}`, track: 'verified',
  stage3, evidence: [], caveats: [], ...over,
})

/** 원문에 있는 것만 쓴 정상 초안 */
const okDraft = (paperId: string): SummaryDraft => ({
  oneLine: { text: `${paperId} 논문의 한 줄`, terms: [] },
  whyItMatters: { text: '왜 중요한가', terms: [] },
  method: [], results: [], limitations: [], quotes: [],
})

type Saved = { brief: { userId: string; date: string; issueNumber: number; readMinutes: number }; items: NewBriefItemRow[] }

/**
 * 모든 의존성을 주입한다 — 빠뜨리면 기본 구현이 DB와 실제 Anthropic을 부른다.
 * briefer는 .env를 읽으므로 키가 있는 머신에서는 테스트가 돈을 쓴다.
 */
function deps(over: Partial<BriefDeps> = {}): { d: BriefDeps; saved: Saved[]; bodies: string[]; rejections: SummaryRejectionRow[] } {
  const saved: Saved[] = []
  const bodies: string[] = []
  const rejections: SummaryRejectionRow[] = []
  const d: BriefDeps = {
    listUserIds: async () => ['u1'],
    today: '2026-10-02',
    hasBrief: async () => false,
    listCandidates: async () => [cand('a'), cand('b'), cand('c'), cand('d'), cand('e')],
    fetchBody: async (arxivId) => { bodies.push(arxivId); return null },
    summarize: async (input: SummaryInput) => okDraft(input.title.replace('T ', '')),
    nextIssue: async () => 13,
    saveBrief: async (brief, items) => { saved.push({ brief, items }); return 'brief-id' },
    recordRejection: async (row) => { rejections.push(row) },
    getSettings: async () => null,
    ...over,
  }
  return { d, saved, bodies, rejections }
}

describe('readMinutesOf', () => {
  it('요약 글자 수 ÷ 500 올림, 최소 1 (ADR 0002 D7)', () => {
    const item = (n: number): NewBriefItemRow => ({
      position: 0, paperId: 'p', interestId: null, oneLine: 'x'.repeat(n), whyItMatters: '', method: '',
      results: [], limitations: [], quotes: [], isSerendipity: false,
    })
    expect(readMinutesOf([item(10)])).toBe(1)
    expect(readMinutesOf([item(500)])).toBe(1)
    expect(readMinutesOf([item(501)])).toBe(2)
  })
})

describe('buildBriefs', () => {
  it('순위대로 4편을 골라 position 0~3, 호수·날짜와 함께 저장한다', async () => {
    const { d, saved } = deps()
    const r = await buildBriefs(d)
    expect(r.built).toBe(1)
    expect(saved).toHaveLength(1)
    expect(saved[0]?.brief).toMatchObject({ userId: 'u1', date: '2026-10-02', issueNumber: 13 })
    expect(saved[0]?.items.map((i) => i.position)).toEqual([0, 1, 2, 3])
    expect(saved[0]?.items.every((i) => i.isSerendipity === false)).toBe(true)
  })

  it('프리프린트만 있는 날은 2편만 담는다 (절대 규칙 3)', async () => {
    const { d, saved } = deps({
      listCandidates: async () => ['a', 'b', 'c', 'd'].map((id) => cand(id, { track: 'notable' })),
    })
    await buildBriefs(d)
    expect(saved[0]?.items).toHaveLength(2)
  })

  it('한 줄 요약이 검증에 실패한 논문은 빼고 다음 순위로 채운다', async () => {
    const { d, saved } = deps({
      summarize: async (input) =>
        input.title === 'T a'
          ? { ...okDraft('a'), oneLine: { text: 'FakeNet을 제안했다', terms: ['FakeNet'] } }
          : okDraft(input.title.replace('T ', '')),
    })
    await buildBriefs(d)
    expect(saved[0]?.items.map((i) => i.paperId)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('통째로 버린 논문은 사유와 요약기 버전을 기록한다 — 다음 날 다시 요약하지 않게', async () => {
    const { d, rejections } = deps({
      summarize: async (input) =>
        input.title === 'T a'
          ? { ...okDraft('a'), oneLine: { text: 'FakeNet이 9.9를 냈다', terms: ['FakeNet'] } }
          : okDraft(input.title.replace('T ', '')),
    })
    await buildBriefs(d)
    expect(rejections).toEqual([
      {
        paperId: 'a',
        field: 'oneLine',
        sentence: 'FakeNet이 9.9를 냈다',
        problems: ['원문에 없는 숫자 9.9', '원문에 없는 이름 FakeNet'],
        sourceKind: '초록',
        ...summarizerVersion(),
      },
    ])
  })

  it('문장·항목 일부만 버린 논문, 응답을 못 읽거나 호출이 던진 논문은 기록하지 않는다 (다시 시도할 가치가 있다)', async () => {
    const { d, rejections } = deps({
      summarize: async (input) => {
        if (input.title === 'T a') throw new Error('529')
        if (input.title === 'T b') return null
        return { ...okDraft(input.title.replace('T ', '')), method: [{ text: '시드 7개를 썼다', terms: [] }] }
      },
    })
    await buildBriefs(d)
    expect(rejections).toEqual([])
  })

  it('기록이 실패해도 브리핑은 만든다', async () => {
    const { d, saved } = deps({
      summarize: async (input) =>
        input.title === 'T a'
          ? { ...okDraft('a'), oneLine: { text: 'FakeNet을 제안했다', terms: ['FakeNet'] } }
          : okDraft(input.title.replace('T ', '')),
      recordRejection: async () => { throw new Error('db down') },
    })
    await buildBriefs(d)
    expect(saved[0]?.items.map((i) => i.paperId)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('요약 응답을 못 읽은 논문(null)도 빼고 다음 순위로', async () => {
    const { d, saved } = deps({
      summarize: async (input) => (input.title === 'T b' ? null : okDraft(input.title.replace('T ', ''))),
    })
    await buildBriefs(d)
    expect(saved[0]?.items.map((i) => i.paperId)).toEqual(['a', 'c', 'd', 'e'])
  })

  it('요약 호출이 던진 논문도 빼고 계속한다', async () => {
    const { d, saved } = deps({
      summarize: async (input) => {
        if (input.title === 'T a') throw new Error('529')
        return okDraft(input.title.replace('T ', ''))
      },
    })
    await buildBriefs(d)
    expect(saved[0]?.items.map((i) => i.paperId)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('본문이 없으면 초록으로 검증한다 — 본문에만 있는 숫자를 쓴 문장은 버려진다', async () => {
    const { d, saved } = deps({
      listCandidates: async () => [cand('a')],
      fetchBody: async () => null,
      summarize: async () => ({ ...okDraft('a'), method: [{ text: '시드 7개를 썼다', terms: [] }] }),
    })
    await buildBriefs(d)
    expect(saved[0]?.items[0]?.method).toBe('')
  })

  it('본문을 받으면 그 본문으로 검증한다', async () => {
    const { d, saved } = deps({
      listCandidates: async () => [cand('a')],
      fetchBody: async () => 'Full body with 7 seeds.',
      summarize: async () => ({ ...okDraft('a'), method: [{ text: '시드 7개를 썼다', terms: [] }] }),
    })
    await buildBriefs(d)
    expect(saved[0]?.items[0]?.method).toBe('시드 7개를 썼다')
  })

  it('같은 날 브리핑이 이미 있으면 그 사용자는 건너뛴다 (D5)', async () => {
    let listed = false
    const { d, saved } = deps({
      hasBrief: async () => true,
      listCandidates: async () => { listed = true; return [] },
    })
    const r = await buildBriefs(d)
    expect(r.skipped).toBe(1)
    expect(listed).toBe(false)
    expect(saved).toHaveLength(0)
  })

  it('배달할 논문이 0편이면 브리핑을 만들지 않는다 (빈 브리핑 금지)', async () => {
    const { d, saved } = deps({ listCandidates: async () => [] })
    const r = await buildBriefs(d)
    expect(r.empty).toBe(1)
    expect(saved).toHaveLength(0)
  })

  it('한 사용자가 실패해도 다른 사용자는 만든다', async () => {
    const { d, saved } = deps({
      listUserIds: async () => ['u1', 'u2'],
      listCandidates: async (userId) => {
        if (userId === 'u1') throw new Error('DB 오류')
        return [cand('a')]
      },
    })
    const r = await buildBriefs(d)
    expect(r.failedUsers).toBe(1)
    expect(saved.map((s) => s.brief.userId)).toEqual(['u2'])
  })

  it('요약을 시도했는데 응답이 전부 실패하면, 처리를 마친 뒤 던진다', async () => {
    const { d } = deps({ summarize: async () => { throw new Error('401') } })
    await expect(buildBriefs(d)).rejects.toThrow('요약이 전량 실패')
  })

  it('arXiv id가 없는 논문은 본문을 가져오지 않는다', async () => {
    const { d, bodies } = deps({ listCandidates: async () => [cand('a', { arxivId: null })] })
    await buildBriefs(d)
    expect(bodies).toEqual([])
  })

  it('제목에만 있는 고유명사를 쓴 한 줄 요약은 통과한다 (모델은 제목도 본다)', async () => {
    const { d, saved } = deps({
      listCandidates: async () => [cand('a', { title: 'T a: XNet', abstract: 'Abstract of a.' })],
      fetchBody: async () => 'Body without the name.',
      summarize: async () => ({ ...okDraft('a'), oneLine: { text: 'XNet을 제안했다', terms: ['XNet'] } }),
    })
    await buildBriefs(d)
    expect(saved[0]?.items[0]?.oneLine).toBe('XNet을 제안했다')
  })

  it('사용자당 요약 시도는 상한까지만 — 전부 검증 실패해도 8회에서 멈춘다 (F3)', async () => {
    let calls = 0
    const { d, saved } = deps({
      listCandidates: async () => Array.from({ length: 20 }, (_, i) => cand(`p${i}`)),
      summarize: async (input) => {
        calls++
        return { ...okDraft('x'), oneLine: { text: `Fake${input.title}Net`, terms: ['FakeNet'] } }
      },
    })
    const r = await buildBriefs(d)
    expect(BRIEF_MAX_SUMMARY_ATTEMPTS).toBe(8)
    expect(calls).toBe(8)
    expect(saved).toHaveLength(0)
    expect(r.empty).toBe(1)
  })

  it('verified 2 + notable 4가 섞이면 4편, 프리프린트는 정확히 2편 (절대 규칙 3)', async () => {
    const { d, saved } = deps({
      listCandidates: async () => [
        cand('a', { track: 'notable', relevance: 0.9 }),
        cand('b', { track: 'notable', relevance: 0.9 }),
        cand('c', { track: 'notable', relevance: 0.9 }),
        cand('d', { track: 'notable', relevance: 0.9 }),
        cand('e', { track: 'verified', relevance: 0.1 }),
        cand('f', { track: 'verified', relevance: 0.1 }),
      ],
    })
    await buildBriefs(d)
    const items = saved[0]?.items ?? []
    expect(items).toHaveLength(4)
    const notable = items.filter((i) => ['a', 'b', 'c', 'd'].includes(i.paperId))
    expect(notable).toHaveLength(2)
  })

  it('평가 단계의 evidence 문장은 검증 원문이 아니다', async () => {
    const { d, saved } = deps({
      listCandidates: async () => [
        cand('a', { evidence: [{ stage: 2, verdict: 'caution', text: 'ZetaNet 관련 주의' }] }),
      ],
      summarize: async () => ({ ...okDraft('a'), oneLine: { text: 'ZetaNet을 제안했다', terms: ['ZetaNet'] } }),
    })
    await buildBriefs(d)
    expect(saved).toHaveLength(0)
  })

  it('본문이 없으면 인용 locator 대체값은 초록이다 (F7)', async () => {
    const { d, saved } = deps({
      listCandidates: async () => [cand('a', { abstract: 'Our method improves accuracy by a wide margin.' })],
      fetchBody: async () => null,
      summarize: async () => ({
        ...okDraft('a'),
        quotes: [{ text: 'Our method improves accuracy by a wide margin.', locator: '섹션 9' }],
      }),
    })
    await buildBriefs(d)
    expect(saved[0]?.items[0]?.quotes[0]?.locator).toBe('초록')
  })
})

describe('buildBriefs — 사용자 설정', () => {
  it('하루 편수 2면 2편만 요약·저장한다 (요약 호출도 2번)', async () => {
    let calls = 0
    const { d, saved } = deps({
      getSettings: async () => ({ papersPerDay: 2, includePreprints: true }),
      summarize: async (input) => { calls++; return okDraft(input.title.replace('T ', '')) },
    })
    await buildBriefs(d)
    expect(saved[0]?.items.map((i) => i.paperId)).toEqual(['a', 'b'])
    expect(calls).toBe(2)
  })

  it('프리프린트를 끄면 notable 후보는 요약하지 않는다', async () => {
    const { d, saved } = deps({
      getSettings: async () => ({ papersPerDay: 4, includePreprints: false }),
      listCandidates: async () => [cand('a', { track: 'notable' }), cand('b')],
    })
    await buildBriefs(d)
    expect(saved[0]?.items.map((i) => i.paperId)).toEqual(['b'])
  })

  it('설정을 못 읽으면 그 사용자만 실패로 넘긴다', async () => {
    const { d, saved } = deps({ getSettings: async () => { throw new Error('db down') } })
    const r = await buildBriefs(d)
    expect(r.failedUsers).toBe(1)
    expect(saved).toEqual([])
  })
})
