/**
 * ⚠️ 전부 허구다. 아래 논문 제목·저자·게재처·수치는 디자인 시안(docs/DESIGN.md)의 예시를
 * 데이터로 옮긴 것이며 실제 논문이 아니다. 화면 개발과 필터 기준 조정용 시드로만 쓴다.
 */
import {
  EMBEDDING_DIM,
  type Assessment,
  type Brief,
  type Interest,
  type Paper,
  type SavedItem,
  type UserSettings,
} from '@jogan/core'

export type SeedData = {
  interests: Interest[]
  papers: Paper[]
  assessments: Assessment[]
  brief: Brief
  saved: SavedItem[]
  settings: UserSettings
}

/** 문자열 시드에서 결정적으로 만든 단위 벡터. 실제 임베딩 모델을 붙이기 전까지의 자리표시자 */
export function fakeEmbedding(seed: string): number[] {
  let h = 2166136261
  for (const ch of seed) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  const out: number[] = []
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0
    out.push((h / 0xffffffff) * 2 - 1)
  }
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0))
  return out.map((v) => v / norm)
}

// 고정 id — 시드를 여러 번 돌려도 같은 행을 가리킨다
const INTEREST = {
  memory: 'a1000000-0000-4000-8000-000000000001',
  sleep: 'a1000000-0000-4000-8000-000000000002',
  review: 'a1000000-0000-4000-8000-000000000003',
} as const

const PAPER = {
  episodic: 'b1000000-0000-4000-8000-000000000001',
  spindle: 'b1000000-0000-4000-8000-000000000002',
  reviewbench: 'b1000000-0000-4000-8000-000000000003',
  fourday: 'b1000000-0000-4000-8000-000000000004',
  tmr: 'b1000000-0000-4000-8000-000000000005',
} as const

const BRIEF_ID = 'c1000000-0000-4000-8000-000000000001'

const ok = (value: number, reason: string) => ({ value, reason })

export function buildSeed(userId: string, today: string): SeedData {
  const interests: Interest[] = [
    { id: INTEREST.memory, userId, label: 'LLM 에이전트의 장기 기억', embedding: fakeEmbedding('interest:memory'), seedPaperIds: [] },
    { id: INTEREST.sleep, userId, label: '수면과 기억 공고화', embedding: fakeEmbedding('interest:sleep'), seedPaperIds: [] },
    { id: INTEREST.review, userId, label: '코드 리뷰 자동화', embedding: fakeEmbedding('interest:review'), seedPaperIds: [] },
  ]

  const papers: Paper[] = [
    {
      id: PAPER.episodic,
      doi: '10.5555/jogan.seed.0001',
      arxivId: '2609.00001',
      title: 'Episodic Retrieval for Long-Horizon Conversational Agents',
      authors: [
        { name: 'Mina Seo', affiliation: 'KAIST' },
        { name: 'Daniel Okafor', affiliation: 'University of Edinburgh' },
      ],
      abstract: 'We propose an episodic memory index that lets conversational agents retrieve past events by time and participant rather than by surface similarity. On a 1,200-dialogue long-horizon benchmark, recall@5 improves from 0.66 to 0.81 while prompt tokens drop by 38%.',
      publishedAt: new Date('2026-09-19T00:00:00Z'),
      source: 'arxiv',
      venue: { name: 'NeurIPS 2026', kind: 'conference' },
      pdfUrl: 'https://example.org/seed/episodic.pdf',
      codeUrl: 'https://example.org/seed/episodic-code',
      openAccess: true,
      embedding: fakeEmbedding('paper:episodic'),
      mergedInto: null,
    },
    {
      id: PAPER.spindle,
      doi: '10.5555/jogan.seed.0002',
      arxivId: null,
      title: 'Sleep Spindle Density Predicts Overnight Gains in Motor Sequence Learning: A Preregistered Replication',
      authors: [
        { name: 'Lucía Fernández', affiliation: 'Universidad de Barcelona' },
        { name: 'Jiwoo Park', affiliation: '서울대학교' },
      ],
      abstract: 'In a preregistered replication with 96 adults, we find that stage-2 spindle density predicts overnight improvement on a finger-tapping task (β = 0.31, 95% CI 0.12–0.50). Effects hold after controlling for total sleep time.',
      publishedAt: new Date('2026-09-18T00:00:00Z'),
      source: 'pubmed',
      venue: { name: 'Journal of Sleep Research', kind: 'journal' },
      pdfUrl: 'https://example.org/seed/spindle.pdf',
      codeUrl: 'https://example.org/seed/spindle-data',
      openAccess: true,
      embedding: fakeEmbedding('paper:spindle'),
      mergedInto: null,
    },
    {
      id: PAPER.reviewbench,
      doi: null,
      arxivId: '2609.00003',
      title: 'ReviewBench: Do LLM Code Reviewers Catch Real Regressions?',
      authors: [
        { name: 'Tomasz Nowak', affiliation: 'TU Delft' },
        { name: 'Hyun Lee', affiliation: 'Naver' },
      ],
      abstract: 'We collect 3,400 merged pull requests that later caused a reverted regression and ask whether LLM reviewers flag the faulty hunk. The best model catches 41% at a 12% false-positive rate; simple heuristics catch 27%.',
      publishedAt: new Date('2026-09-20T00:00:00Z'),
      source: 'arxiv',
      venue: { name: 'arXiv', kind: 'preprint' },
      pdfUrl: 'https://example.org/seed/reviewbench.pdf',
      codeUrl: 'https://example.org/seed/reviewbench-code',
      openAccess: true,
      embedding: fakeEmbedding('paper:reviewbench'),
      mergedInto: null,
    },
    {
      id: PAPER.fourday,
      doi: '10.5555/jogan.seed.0004',
      arxivId: null,
      title: 'Four-Day Workweek Pilots and Deep Work: Evidence from 214 Knowledge Workers',
      authors: [{ name: 'Amara Osei', affiliation: 'LSE' }],
      abstract: 'Using diary data from 214 knowledge workers across six firms piloting a four-day week, we observe a 19% increase in self-reported uninterrupted work blocks. The design is observational; firms self-selected into the pilot.',
      publishedAt: new Date('2026-09-17T00:00:00Z'),
      source: 'openalex',
      venue: { name: 'Work, Employment and Society', kind: 'journal' },
      pdfUrl: 'https://example.org/seed/fourday.pdf',
      codeUrl: null,
      openAccess: true,
      embedding: fakeEmbedding('paper:fourday'),
      mergedInto: null,
    },
    {
      id: PAPER.tmr,
      doi: '10.5555/jogan.seed.0005',
      arxivId: null,
      title: 'Targeted Memory Reactivation During Slow-Wave Sleep Improves Procedural Consolidation',
      authors: [{ name: 'Noor Haddad', affiliation: 'McGill University' }],
      abstract: 'A 48-participant randomized crossover study replaying task-associated sounds during slow-wave sleep. Cued sequences improved 12% more than uncued sequences overnight.',
      publishedAt: new Date('2026-08-25T00:00:00Z'),
      source: 'biorxiv',
      venue: { name: 'Sleep', kind: 'journal' },
      pdfUrl: 'https://example.org/seed/tmr.pdf',
      codeUrl: 'https://example.org/seed/tmr-data',
      openAccess: true,
      embedding: fakeEmbedding('paper:tmr'),
      mergedInto: null,
    },
  ]

  const passedStage1 = { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] }
  const assessedAt = new Date(`${today}T03:12:00+09:00`)

  const assessments: Assessment[] = [
    {
      paperId: PAPER.episodic, track: 'verified', field: 'cs',
      stage1: passedStage1,
      stage2: { venueTier: 'CORE A*', reviewStatus: 'accepted', reviewScore: 7.2, authorTrackRecord: 0.4 },
      stage3: {
        reproducibility: ok(0.9, '코드와 벤치마크 생성 스크립트가 공개되어 있고 시드가 명시되어 있다.'),
        design: ok(0.85, '베이스라인 5종과 ablation 3건을 포함한다.'),
        statistics: ok(0.7, '5회 반복 평균과 표준편차를 보고하지만 신뢰구간은 없다.'),
        claimVsEvidence: ok(0.8, '초록의 수치가 본문 표 2와 일치한다.'),
        limitations: ok(0.75, '영어 대화에서만 검증했음을 저자가 명시한다.'),
        preregistered: null, studyDesign: null,
      },
      stage4: { influentialCitations: 0, githubStars: 340, mentions: 4 },
      evidence: [
        { stage: 1, verdict: 'pass', text: '철회·약탈적 학술지 신호 없음.' },
        { stage: 2, verdict: 'pass', text: 'NeurIPS 2026 채택. 동료심사 통과.' },
        { stage: 3, verdict: 'pass', text: '코드 공개, 베이스라인 5종, ablation 포함.' },
        { stage: 4, verdict: 'pass', text: '공개 4일 만에 GitHub 스타 340.' },
      ],
      caveats: ['영어 대화에서만 검증되었다.'],
      assessedAt,
    },
    {
      paperId: PAPER.spindle, track: 'verified', field: 'bio_med',
      stage1: passedStage1,
      stage2: { venueTier: 'SJR Q1', reviewStatus: 'published', reviewScore: null, authorTrackRecord: 0.5 },
      stage3: {
        reproducibility: ok(0.85, '원자료와 분석 스크립트가 OSF에 공개되어 있다.'),
        design: ok(0.8, '사전등록된 표본 크기(96명)를 채웠고 원 연구와 같은 과제를 썼다.'),
        statistics: ok(0.9, '효과크기와 95% 신뢰구간을 보고한다.'),
        claimVsEvidence: ok(0.85, '상관 관계로만 서술하고 인과를 주장하지 않는다.'),
        limitations: ok(0.8, '단일 야간 측정이라는 한계를 명시한다.'),
        preregistered: true, studyDesign: 'preregistered replication',
      },
      stage4: { influentialCitations: 0, githubStars: null, mentions: 2 },
      evidence: [
        { stage: 1, verdict: 'pass', text: '철회·약탈적 학술지 신호 없음.' },
        { stage: 2, verdict: 'pass', text: 'SJR Q1 저널 게재. 동료심사 통과.' },
        { stage: 3, verdict: 'pass', text: '사전등록 재현 연구, 표본 96명, 신뢰구간 보고.' },
        { stage: 4, verdict: 'pass', text: '수면 연구자 2명이 언급.' },
      ],
      caveats: [],
      assessedAt,
    },
    {
      paperId: PAPER.reviewbench, track: 'notable', field: 'cs',
      stage1: passedStage1,
      stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0.3 },
      stage3: {
        reproducibility: ok(0.8, '데이터셋과 평가 코드가 공개되어 있다.'),
        design: ok(0.7, '휴리스틱 베이스라인이 있으나 사람 리뷰어 비교는 없다.'),
        statistics: ok(0.5, '단일 실행 결과만 보고한다.'),
        claimVsEvidence: ok(0.75, '제목의 질문에 초록 수치가 직접 답한다.'),
        limitations: ok(0.6, '리버트된 PR만 모아 표본 편향이 있음을 인정한다.'),
        preregistered: null, studyDesign: null,
      },
      stage4: { influentialCitations: 0, githubStars: 88, mentions: 1 },
      evidence: [
        { stage: 1, verdict: 'pass', text: '철회·약탈적 학술지 신호 없음.' },
        { stage: 2, verdict: 'caution', text: 'arXiv 프리프린트. 아직 동료심사를 받지 않았다.' },
        { stage: 3, verdict: 'pass', text: '데이터셋 공개, 베이스라인 포함.' },
        { stage: 3, verdict: 'caution', text: '단일 실행 결과라 분산을 알 수 없다.' },
      ],
      caveats: ['심사 전 프리프린트다.', '리버트된 PR만 모아 표본이 편향되었다.'],
      assessedAt,
    },
    {
      paperId: PAPER.fourday, track: 'verified', field: 'social',
      stage1: passedStage1,
      stage2: { venueTier: 'SJR Q1', reviewStatus: 'published', reviewScore: null, authorTrackRecord: 0.4 },
      stage3: {
        reproducibility: ok(0.5, '설문 문항은 공개했으나 원자료는 비공개다.'),
        design: ok(0.55, '표본 214명이지만 기업이 자발적으로 참여해 선택 편향이 있다.'),
        statistics: ok(0.7, '효과크기와 신뢰구간을 보고한다.'),
        claimVsEvidence: ok(0.8, '관찰 연구임을 초록에서부터 밝힌다.'),
        limitations: ok(0.85, '선택 편향과 자기보고 한계를 성실히 적었다.'),
        preregistered: false, studyDesign: 'observational',
      },
      stage4: { influentialCitations: 0, githubStars: null, mentions: 0 },
      evidence: [
        { stage: 1, verdict: 'pass', text: '철회·약탈적 학술지 신호 없음.' },
        { stage: 2, verdict: 'pass', text: 'SJR Q1 저널 게재. 동료심사 통과.' },
        { stage: 3, verdict: 'caution', text: '관찰 연구이며 원자료가 비공개다.' },
      ],
      caveats: ['관찰 연구라 인과를 말할 수 없다.'],
      assessedAt,
    },
    {
      paperId: PAPER.tmr, track: 'verified', field: 'bio_med',
      stage1: passedStage1,
      stage2: { venueTier: 'SJR Q1', reviewStatus: 'published', reviewScore: null, authorTrackRecord: 0.5 },
      stage3: {
        reproducibility: ok(0.8, '자극 파일과 분석 코드가 공개되어 있다.'),
        design: ok(0.8, '무작위 교차 설계, 표본 48명.'),
        statistics: ok(0.75, '효과크기를 보고한다.'),
        claimVsEvidence: ok(0.8, '초록 수치가 본문과 일치한다.'),
        limitations: ok(0.7, '젊은 성인만 포함했음을 명시한다.'),
        preregistered: true, studyDesign: 'RCT (crossover)',
      },
      stage4: { influentialCitations: 1, githubStars: null, mentions: 3 },
      evidence: [
        { stage: 1, verdict: 'pass', text: '철회·약탈적 학술지 신호 없음.' },
        { stage: 2, verdict: 'pass', text: '프리프린트로 배달된 뒤 Sleep에 채택되었다.' },
        { stage: 3, verdict: 'pass', text: '무작위 교차 설계, 사전등록.' },
      ],
      caveats: [],
      assessedAt: new Date('2026-09-20T03:10:00+09:00'),
    },
  ]

  const brief: Brief = {
    id: BRIEF_ID,
    userId,
    date: today,
    issueNumber: 12,
    readMinutes: 6,
    audioUrl: null,
    audioSeconds: null,
    items: [
      {
        paperId: PAPER.episodic, interestId: INTEREST.memory, position: 0, isSerendipity: false,
        oneLine: '대화 에이전트의 기억을 "언제·누구와"로 색인하면 검색 정확도가 오르고 토큰은 줄어든다.',
        whyItMatters: '기존 벡터 검색은 비슷한 문장을 찾을 뿐 사건을 찾지 못한다. 이 논문은 시간과 참여자 축을 색인에 넣어 그 한계를 직접 겨냥한다.',
        method: '1,200개 장기 대화 벤치마크에서 5종 베이스라인과 비교.',
        results: [
          { label: '데이터', value: '장기 대화 1,200개' },
          { label: '기억 검색', value: 'recall@5 0.81 (베이스라인 0.66)' },
          { label: '비용', value: '프롬프트 토큰 −38%' },
        ],
        limitations: [
          { bySource: 'author', text: '영어 대화에서만 검증했다.' },
          { bySource: 'ai', text: '신뢰구간 없이 5회 평균만 보고한다.' },
        ],
        quotes: [{ text: 'recall@5 improves from 0.66 to 0.81 while prompt tokens drop by 38%', locator: 'Abstract' }],
      },
      {
        paperId: PAPER.spindle, interestId: INTEREST.sleep, position: 1, isSerendipity: false,
        oneLine: '수면 방추 밀도가 운동 학습의 밤사이 향상을 예측한다는 결과가 사전등록 재현에서 다시 확인됐다.',
        whyItMatters: '재현 위기 속에서 원 결과가 살아남았다. 방추 밀도를 지표로 쓰는 후속 연구의 발판이 된다.',
        method: '96명 사전등록 재현. 손가락 두드리기 과제.',
        results: [
          { label: '표본', value: '96명' },
          { label: '효과', value: 'β = 0.31 (95% CI 0.12–0.50)' },
        ],
        limitations: [{ bySource: 'author', text: '단일 야간 측정.' }],
        quotes: [{ text: 'stage-2 spindle density predicts overnight improvement on a finger-tapping task (β = 0.31, 95% CI 0.12–0.50)', locator: 'Abstract' }],
      },
      {
        paperId: PAPER.reviewbench, interestId: INTEREST.review, position: 2, isSerendipity: false,
        oneLine: '실제 리버트를 부른 PR 3,400건으로 LLM 코드 리뷰어를 시험하니 최고 모델도 41%만 잡았다.',
        whyItMatters: '합성 버그가 아니라 실제 회귀로 만든 벤치마크다. "LLM 리뷰가 얼마나 쓸모 있나"에 처음으로 숫자를 준다.',
        method: '리버트된 병합 PR 3,400건. 모델별 결함 hunk 탐지율 측정.',
        results: [
          { label: '데이터', value: '리버트된 PR 3,400건' },
          { label: '탐지율', value: '최고 41% (오탐 12%)' },
          { label: '휴리스틱', value: '27%' },
        ],
        limitations: [
          { bySource: 'author', text: '리버트된 PR만 모아 표본이 편향되었다.' },
          { bySource: 'ai', text: '단일 실행 결과라 분산을 알 수 없다.' },
        ],
        quotes: [{ text: 'The best model catches 41% at a 12% false-positive rate', locator: 'Abstract' }],
      },
      {
        paperId: PAPER.fourday, interestId: null, position: 3, isSerendipity: true,
        oneLine: '주 4일제 시범 기업의 지식노동자 214명은 방해받지 않는 작업 블록이 19% 늘었다고 보고했다.',
        whyItMatters: '관심 주제인 수면과 기억 공고화와 맞닿아 있다. 딥워크 시간을 다루는 드문 현장 데이터다.',
        method: '6개 기업 214명 일기 데이터. 관찰 연구.',
        results: [
          { label: '표본', value: '214명' },
          { label: '효과', value: '집중 블록 +19%' },
        ],
        limitations: [
          { bySource: 'author', text: '기업이 자발적으로 참여해 선택 편향이 있다.' },
          { bySource: 'ai', text: '원자료가 비공개라 재분석이 불가능하다.' },
        ],
        quotes: [{ text: 'we observe a 19% increase in self-reported uninterrupted work blocks', locator: 'Abstract' }],
      },
    ],
  }

  const saved: SavedItem[] = [
    {
      userId, paperId: PAPER.tmr,
      savedAt: new Date('2026-09-02T08:15:00+09:00'),
      readAt: null, memo: null,
      followUp: { kind: 'accepted', text: '그 뒤 Sleep에 채택되었습니다', at: new Date('2026-09-20T03:10:00+09:00') },
    },
  ]

  const settings: UserSettings = { userId, departureTime: '08:10', papersPerDay: 4, includePreprints: true }

  return { interests, papers, assessments, brief, saved, settings }
}
