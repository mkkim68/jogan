# `services/collector` 구현 계획 — arXiv 수집 · 중복 제거 · 임베딩 · 관련성

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm pipeline:collect` 한 번으로 arXiv에서 실제 논문을 가져와 중복을 제거하고, Voyage 임베딩을 채우고, 사용자별 후보를 `paper_candidates`에 남긴다. 중간에 죽어도 재실행하면 이어서 진행한다.

**Architecture:** 네 단계(fetch → dedupe → embed → match)가 각각 독립 함수이고, 앞 단계의 결과를 DB에서 읽는다. 외부 호출(arXiv·Voyage)은 레이트리밋·재시도 래퍼 하나를 통과하고, 응답은 zod로 검증한다. 순수 로직(질의 조립·Atom 매핑·후보 선별)은 I/O에서 분리해 단위 테스트한다.

**Tech Stack:** TypeScript 5.9, tsx, vitest 5, zod 4, Drizzle 0.45 + pgvector, `fast-xml-parser` 5, Voyage `voyage-3` (fetch 직접 호출).

**Spec:** `docs/superpowers/specs/2026-09-27-collector-design.md`

## Global Constraints

- **서버 로직에 `any` 금지.** `@ts-ignore`·`as unknown as` 금지. 외부 API 응답은 **zod로 파싱**한다.
- **파싱/처리 실패는 해당 항목만 건너뛰고 로그**한다. 파이프라인 전체를 죽이지 않는다 (CLAUDE.md 코딩 규칙).
- **외부 API 호출은 반드시 레이트리밋·재시도 래퍼를 통해서.** arXiv는 **요청 간 3초**.
- 프롬프트는 이 작업에 없다. LLM 호출도 없다 (임베딩은 LLM이 아니다).
- 마이그레이션은 **파일로 남겨 커밋**한다.
- `EMBEDDING_DIM`(1024)이 임베딩 차원의 유일한 출처다. Voyage 응답 차원이 다르면 **즉시 실패**한다.
- 커밋 메시지는 한국어. 트레일러는 각자의 지시를 따른다.
- 스테이징 금지: `.env*`, `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `.superpowers/`.
- **포트 3100만** 사용. **`pkill`로 이름 패턴 종료 금지** — PID는 포트로 특정한다. 3000번은 사용자의 다른 프로젝트다.
- 로컬 DB는 호스트 포트 **5433**. `pnpm db:seed`는 멱등이다.

---

## 파일 구조

```
packages/core/src/
├── constants.ts          (수정) 수집 상수 8개 추가
├── candidate.ts          (신규) PaperCandidate
└── index.ts              (수정) candidate re-export
packages/db/src/
├── schema/candidates.ts      (신규) paper_candidates
├── schema/pipeline-state.ts  (신규) pipeline_state
├── schema/index.ts           (수정) re-export
├── queries/candidates.ts     (신규) upsert·조회
├── queries/pipeline-state.ts (신규) get·set
├── queries/papers.ts         (수정) upsert·미임베딩 조회·임베딩 쓰기·유사도 매칭
├── queries/interests.ts      (수정) 미임베딩 조회·임베딩 쓰기
├── queries/index.ts          (수정) re-export
└── migrations/0002_*.sql     (생성) drizzle-kit
services/collector/
├── package.json          (수정) 의존성 추가
└── src/
    ├── index.ts          (교체) 네 단계 오케스트레이션
    ├── http.ts           (신규) 레이트리밋 + 재시도
    ├── http.test.ts      (신규)
    ├── arxiv.ts          (신규) 질의 조립 · Atom 파싱 · Paper 매핑
    ├── arxiv.test.ts     (신규)
    ├── embed.ts          (신규) Voyage
    ├── embed.test.ts     (신규)
    ├── match.ts          (신규) 후보 선별
    ├── match.test.ts     (신규)
    └── fixtures/arxiv-feed.xml (신규) 실제 응답 발췌
.env.example, README.md   (수정) VOYAGE_API_KEY
```

---

### Task 1: core 상수와 `PaperCandidate`

**Files:**
- Modify: `packages/core/src/constants.ts`
- Create: `packages/core/src/candidate.ts`, `packages/core/src/candidate.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces (`@jogan/core`): `ARXIV_CATEGORIES`, `COLLECT_BACKFILL_DAYS`, `COLLECT_WINDOW_DAYS`, `COLLECT_MAX_PER_RUN`, `RELEVANCE_THRESHOLD`, `CANDIDATES_PER_INTEREST`, `VOYAGE_MODEL`, `VOYAGE_BATCH_SIZE`, `ARXIV_PAGE_SIZE`, `ARXIV_MIN_INTERVAL_MS`; `PaperCandidate` (값 + 타입).

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/src/candidate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARXIV_CATEGORIES, PaperCandidate, RELEVANCE_THRESHOLD } from './index'

const base = {
  userId: 'u1',
  paperId: '3f1c1a6e-1b7e-4c2a-9c1d-0a1b2c3d4e5f',
  interestId: 'a1000000-0000-4000-8000-000000000001',
  relevance: 0.72,
  collectedFor: '2026-09-27',
}

describe('PaperCandidate', () => {
  it('정상 객체를 파싱한다', () => {
    expect(PaperCandidate.parse(base).relevance).toBe(0.72)
  })
  it('interestId는 null을 허용한다', () => {
    expect(PaperCandidate.parse({ ...base, interestId: null }).interestId).toBeNull()
  })
  it('relevance가 0~1 밖이면 거부한다', () => {
    expect(() => PaperCandidate.parse({ ...base, relevance: 1.2 })).toThrow()
    expect(() => PaperCandidate.parse({ ...base, relevance: -0.1 })).toThrow()
  })
  it('collectedFor는 YYYY-MM-DD만 받는다', () => {
    expect(() => PaperCandidate.parse({ ...base, collectedFor: '2026/09/27' })).toThrow()
  })
})

describe('수집 상수', () => {
  it('카테고리는 비어 있지 않고 모두 arXiv 형식이다', () => {
    expect(ARXIV_CATEGORIES.length).toBeGreaterThan(0)
    for (const c of ARXIV_CATEGORIES) expect(c).toMatch(/^[a-z-]+(\.[A-Z]{2})?$/)
  })
  it('관련성 임계값은 0~1 사이다', () => {
    expect(RELEVANCE_THRESHOLD).toBeGreaterThan(0)
    expect(RELEVANCE_THRESHOLD).toBeLessThan(1)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jogan/core test candidate`
Expected: FAIL — `PaperCandidate` / `ARXIV_CATEGORIES` export 없음.

- [ ] **Step 3: 구현**

`packages/core/src/constants.ts` 맨 아래에 추가:

```ts
/**
 * 수집 대상 arXiv 카테고리. 관심사는 자연어라 카테고리와 1:1이 아니므로,
 * 관심사들이 닿는 범위를 덮는 고정 목록으로 볼륨과 비용을 예측 가능하게 한다.
 */
export const ARXIV_CATEGORIES = [
  'cs.AI',    // 인공지능
  'cs.CL',    // 자연어 처리
  'cs.LG',    // 기계학습
  'cs.SE',    // 소프트웨어 공학
  'cs.SD',    // 음성·오디오
  'q-bio.NC', // 신경과학
  'stat.ME',  // 통계 방법론 (인과추론)
] as const

/** 워터마크가 없는 첫 실행에서 거슬러 받을 기간 */
export const COLLECT_BACKFILL_DAYS = 7
/** 관련성 매칭 대상이 되는 논문의 최근성 */
export const COLLECT_WINDOW_DAYS = 7
/** 한 실행에서 저장할 논문 수 상한. 넘으면 로그를 남기고 멈춘다 */
export const COLLECT_MAX_PER_RUN = 3000
/** arXiv 한 페이지 크기 */
export const ARXIV_PAGE_SIZE = 200
/** arXiv가 요구하는 요청 간 최소 간격 */
export const ARXIV_MIN_INTERVAL_MS = 3000

/**
 * 후보로 남길 코사인 유사도 하한.
 * **실제 수집 결과를 보고 조정할 값이다.** 관심사당 상위 N편 제한이 함께 걸려 있어서
 * 이 값이 낮게 잘못 잡혀도 후보 수가 폭발하지는 않는다.
 */
export const RELEVANCE_THRESHOLD = 0.45
/** 관심사 하나가 하루에 만들 수 있는 후보 수 상한 */
export const CANDIDATES_PER_INTEREST = 50

/** 임베딩 모델. 1024차원이라 EMBEDDING_DIM과 일치한다 */
export const VOYAGE_MODEL = 'voyage-3'
/** Voyage가 한 요청에 받는 최대 입력 수 */
export const VOYAGE_BATCH_SIZE = 128
```

`packages/core/src/candidate.ts`:

```ts
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
  collectedFor: z.iso.date(),
})
export type PaperCandidate = z.infer<typeof PaperCandidate>
```

`packages/core/src/index.ts`에 `export * from './candidate'` 추가.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @jogan/core test && pnpm typecheck`
Expected: 전부 PASS, tsc 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add packages/core
git commit -m "core: 수집 상수와 PaperCandidate 스키마"
```

---

### Task 2: DB 스키마 두 개와 마이그레이션 `0002`

**Files:**
- Create: `packages/db/src/schema/candidates.ts`, `packages/db/src/schema/pipeline-state.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0002_*.sql` (drizzle-kit 생성)

**Interfaces:**
- Consumes: Task 1의 없음 (스키마는 core 상수를 쓰지 않는다).
- Produces (`@jogan/db`): 테이블 `paperCandidates`, `pipelineState`.

- [ ] **Step 1: 스키마 작성**

`packages/db/src/schema/candidates.ts`:

```ts
import { date, index, pgTable, primaryKey, real, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { interests } from './interests'
import { papers } from './papers'

/**
 * 관련성 필터의 출력. 사용자·논문당 한 행이고, 한 논문이 여러 관심사에 걸리면
 * 가장 높은 relevance 쪽으로만 남는다 (queries/candidates.ts의 upsert 참고).
 */
export const paperCandidates = pgTable(
  'paper_candidates',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    /** 관심사가 삭제돼도 후보 자체는 남는다 */
    interestId: uuid('interest_id').references(() => interests.id, { onDelete: 'set null' }),
    relevance: real('relevance').notNull(),
    collectedFor: date('collected_for', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.paperId] }),
    index('paper_candidates_user_date').on(t.userId, t.collectedFor),
  ],
)
```

`packages/db/src/schema/pipeline-state.ts`:

```ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * 파이프라인 단계가 다음 실행에 넘기는 작은 상태. 지금은 collector의 워터마크뿐이고
 * evaluator·briefer도 같은 테이블을 쓴다.
 * 키 예: 'collector:arxiv:last_submitted_at'
 */
export const pipelineState = pgTable('pipeline_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`packages/db/src/schema/index.ts`에 추가:
```ts
export * from './candidates'
export * from './pipeline-state'
```

- [ ] **Step 2: 타입 확인**

Run: `pnpm --filter @jogan/db typecheck`
Expected: 오류 0.

- [ ] **Step 3: 마이그레이션 생성·적용**

```bash
pnpm db:generate
ls packages/db/migrations/0002_*.sql
pnpm db:migrate
docker compose exec -T db psql -U jogan -d jogan -c "\d paper_candidates" -c "\d pipeline_state"
```
Expected: `0002_<이름>.sql` 생성, 적용 성공. `paper_candidates`에 PK `(user_id, paper_id)`와 인덱스 `paper_candidates_user_date`, FK 세 개(users cascade / papers no action / interests set null)가 보인다.

- [ ] **Step 4: 기존 테스트가 여전히 통과하는지**

Run: `pnpm db:seed && pnpm test`
Expected: 전부 PASS (새 테이블은 아직 아무도 쓰지 않는다).

- [ ] **Step 5: 커밋**

```bash
git add packages/db
git commit -m "db: paper_candidates·pipeline_state 테이블과 마이그레이션"
```

---

### Task 3: DB 쿼리 — 후보 · 워터마크 · 논문 upsert · 임베딩 · 매칭

**Files:**
- Create: `packages/db/src/queries/candidates.ts`, `packages/db/src/queries/pipeline-state.ts`
- Modify: `packages/db/src/queries/papers.ts`, `packages/db/src/queries/interests.ts`, `packages/db/src/queries/index.ts`
- Modify: `packages/db/src/queries/queries.test.ts`

**Interfaces:**
- Consumes: Task 1의 `EMBEDDING_DIM`·`PaperCandidate`, Task 2의 테이블.
- Produces (`@jogan/db`):
  ```ts
  getPipelineState(key: string): Promise<string | null>
  setPipelineState(key: string, value: string): Promise<void>

  type CandidateRow = { userId: string; paperId: string; interestId: string | null
                        relevance: number; collectedFor: string }
  upsertCandidates(rows: CandidateRow[]): Promise<void>
  countCandidates(userId: string, collectedFor: string): Promise<number>

  type NewPaper = Omit<Paper, 'id' | 'embedding'> // arxivId는 필수
  upsertArxivPapers(rows: NewPaper[]): Promise<number>   // 반환: 영향받은 행 수
  listUnembeddedPapers(limit: number): Promise<{ id: string; title: string; abstract: string }[]>
  setPaperEmbedding(id: string, embedding: number[]): Promise<void>
  listUnembeddedInterests(): Promise<{ id: string; label: string; userId: string }[]>
  setInterestEmbedding(id: string, embedding: number[]): Promise<void>
  matchPapersForInterest(embedding: number[], since: Date, limit: number):
    Promise<{ paperId: string; relevance: number }[]>   // relevance = 1 - cosineDistance, 내림차순
  ```

- [ ] **Step 1: 워터마크와 후보 쿼리**

`packages/db/src/queries/pipeline-state.ts`:

```ts
import { eq } from 'drizzle-orm'
import { db } from '../client'
import { pipelineState } from '../schema'

export async function getPipelineState(key: string): Promise<string | null> {
  const row = await db.query.pipelineState.findFirst({ where: eq(pipelineState.key, key) })
  return row?.value ?? null
}

export async function setPipelineState(key: string, value: string): Promise<void> {
  await db
    .insert(pipelineState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: pipelineState.key, set: { value, updatedAt: new Date() } })
}
```

`packages/db/src/queries/candidates.ts`:

```ts
import { and, count, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { paperCandidates } from '../schema'

export type CandidateRow = {
  userId: string
  paperId: string
  interestId: string | null
  relevance: number
  collectedFor: string
}

/**
 * 사용자·논문당 한 행. 이미 있으면 **더 높은 relevance일 때만** 갱신하고,
 * 그때 interestId·collectedFor도 함께 바꾼다 — 점수와 "어느 관심사로 걸렸는지"가
 * 어긋나면 안 된다.
 */
export async function upsertCandidates(rows: CandidateRow[]): Promise<void> {
  if (rows.length === 0) return
  await db
    .insert(paperCandidates)
    .values(rows)
    .onConflictDoUpdate({
      target: [paperCandidates.userId, paperCandidates.paperId],
      set: {
        relevance: sql`excluded.relevance`,
        interestId: sql`excluded.interest_id`,
        collectedFor: sql`excluded.collected_for`,
      },
      setWhere: sql`excluded.relevance > ${paperCandidates.relevance}`,
    })
}

export async function countCandidates(userId: string, collectedFor: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(paperCandidates)
    .where(and(eq(paperCandidates.userId, userId), eq(paperCandidates.collectedFor, collectedFor)))
  return row?.n ?? 0
}
```

`setWhere`가 drizzle 0.45에서 다른 이름이면 타입 정의를 확인해 맞는 API를 쓰고 리포트에 적어라. 기능(더 높을 때만 갱신)은 반드시 지켜야 한다.

- [ ] **Step 2: 논문·관심사 쿼리**

`packages/db/src/queries/papers.ts`에 추가 (기존 `getPaperDetail`·`getRelatedInBrief`는 건드리지 않는다):

```ts
import { EMBEDDING_DIM } from '@jogan/core'
import { and, desc, gte, isNull, sql } from 'drizzle-orm'
import { cosineDistance } from 'drizzle-orm'

export type NewPaper = {
  doi: string | null
  arxivId: string
  title: string
  authors: Author[]
  abstract: string
  publishedAt: Date
  source: 'arxiv'
  venue: Venue
  pdfUrl: string | null
  codeUrl: string | null
  openAccess: boolean
}

/**
 * arXiv 논문 upsert. 같은 arxiv_id면 내용을 갱신하고, **초록이 바뀌면 embedding을 null로
 * 되돌린다** — 낡은 벡터로 매칭하면 안 된다.
 */
export async function upsertArxivPapers(rows: NewPaper[]): Promise<number> {
  if (rows.length === 0) return 0
  const inserted = await db
    .insert(papers)
    .values(rows.map((r) => ({ ...r, embedding: null, mergedInto: null })))
    .onConflictDoUpdate({
      target: papers.arxivId,
      set: {
        title: sql`excluded.title`,
        abstract: sql`excluded.abstract`,
        publishedAt: sql`excluded.published_at`,
        doi: sql`excluded.doi`,
        pdfUrl: sql`excluded.pdf_url`,
        embedding: sql`case when ${papers.abstract} is distinct from excluded.abstract
                            then null else ${papers.embedding} end`,
      },
    })
    .returning({ id: papers.id })
  return inserted.length
}

export async function listUnembeddedPapers(
  limit: number,
): Promise<{ id: string; title: string; abstract: string }[]> {
  return db
    .select({ id: papers.id, title: papers.title, abstract: papers.abstract })
    .from(papers)
    .where(isNull(papers.embedding))
    .limit(limit)
}

export async function setPaperEmbedding(id: string, embedding: number[]): Promise<void> {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`임베딩 차원이 ${EMBEDDING_DIM}이 아니다: ${embedding.length}`)
  }
  await db.update(papers).set({ embedding }).where(eq(papers.id, id))
}

/** relevance = 1 - 코사인거리. 내림차순 */
export async function matchPapersForInterest(
  embedding: number[],
  since: Date,
  limit: number,
): Promise<{ paperId: string; relevance: number }[]> {
  const relevance = sql<number>`1 - (${cosineDistance(papers.embedding, embedding)})`
  return db
    .select({ paperId: papers.id, relevance })
    .from(papers)
    .where(and(isNull(papers.mergedInto), gte(papers.publishedAt, since), sql`${papers.embedding} is not null`))
    .orderBy(desc(relevance))
    .limit(limit)
}
```

`packages/db/src/queries/interests.ts`에 추가:

```ts
export async function listUnembeddedInterests(): Promise<
  { id: string; label: string; userId: string }[]
> {
  return db
    .select({ id: interests.id, label: interests.label, userId: interests.userId })
    .from(interests)
    .where(isNull(interests.embedding))
}

export async function setInterestEmbedding(id: string, embedding: number[]): Promise<void> {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`임베딩 차원이 ${EMBEDDING_DIM}이 아니다: ${embedding.length}`)
  }
  await db.update(interests).set({ embedding }).where(eq(interests.id, id))
}
```

`packages/db/src/queries/index.ts`에 `export * from './candidates'`, `export * from './pipeline-state'` 추가.

- [ ] **Step 3: 통합 테스트 추가**

`packages/db/src/queries/queries.test.ts`의 기존 패턴(모듈 상단 `config()`로 dotenv 로드, `describe.skipIf(!hasDb)`, `beforeAll`에서 시드 사용자 확인, **정리는 `try/finally`**)을 그대로 따른다. 다음 케이스를 추가:

```ts
it('워터마크를 쓰고 읽는다', async () => {
  const { getPipelineState, setPipelineState } = await import('../index')
  const key = '__test_watermark'
  try {
    expect(await getPipelineState(key)).toBeNull()
    await setPipelineState(key, '2026-09-27T00:00:00.000Z')
    expect(await getPipelineState(key)).toBe('2026-09-27T00:00:00.000Z')
    await setPipelineState(key, '2026-09-28T00:00:00.000Z')
    expect(await getPipelineState(key)).toBe('2026-09-28T00:00:00.000Z')
  } finally {
    const { db, pipelineState } = await import('../index')
    const { eq } = await import('drizzle-orm')
    await db.delete(pipelineState).where(eq(pipelineState.key, key))
  }
})

it('후보는 더 높은 relevance로만 갱신된다', async () => {
  const { db, papers, upsertCandidates, paperCandidates } = await import('../index')
  const { and, eq } = await import('drizzle-orm')
  const paper = await db.query.papers.findFirst()
  expect(paper).toBeDefined()
  if (!paper) return
  try {
    await upsertCandidates([
      { userId, paperId: paper.id, interestId: null, relevance: 0.6, collectedFor: '2026-09-27' },
    ])
    await upsertCandidates([
      { userId, paperId: paper.id, interestId: null, relevance: 0.4, collectedFor: '2026-09-28' },
    ])
    const low = await db.query.paperCandidates.findFirst({
      where: and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, paper.id)),
    })
    expect(low?.relevance).toBeCloseTo(0.6, 5)
    expect(low?.collectedFor).toBe('2026-09-27')

    await upsertCandidates([
      { userId, paperId: paper.id, interestId: null, relevance: 0.9, collectedFor: '2026-09-29' },
    ])
    const high = await db.query.paperCandidates.findFirst({
      where: and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, paper.id)),
    })
    expect(high?.relevance).toBeCloseTo(0.9, 5)
    expect(high?.collectedFor).toBe('2026-09-29')
  } finally {
    await db.delete(paperCandidates).where(eq(paperCandidates.userId, userId))
  }
})

it('초록이 바뀌면 upsert가 임베딩을 무효화한다', async () => {
  const { db, papers, upsertArxivPapers, setPaperEmbedding } = await import('../index')
  const { EMBEDDING_DIM } = await import('@jogan/core')
  const { eq } = await import('drizzle-orm')
  const arxivId = '__test.00001'
  const base = {
    doi: null, arxivId, title: '제목', authors: [{ name: '저자' }],
    abstract: '첫 초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
    source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
    pdfUrl: null, codeUrl: null, openAccess: true,
  }
  try {
    await upsertArxivPapers([base])
    const row = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
    expect(row).toBeDefined()
    if (!row) return
    await setPaperEmbedding(row.id, Array.from({ length: EMBEDDING_DIM }, () => 0.1))
    expect((await db.query.papers.findFirst({ where: eq(papers.id, row.id) }))?.embedding).not.toBeNull()

    // 초록이 같으면 임베딩이 유지된다
    await upsertArxivPapers([{ ...base, title: '제목 v2' }])
    expect((await db.query.papers.findFirst({ where: eq(papers.id, row.id) }))?.embedding).not.toBeNull()

    // 초록이 바뀌면 임베딩이 null이 된다
    await upsertArxivPapers([{ ...base, abstract: '바뀐 초록' }])
    expect((await db.query.papers.findFirst({ where: eq(papers.id, row.id) }))?.embedding).toBeNull()
  } finally {
    await db.delete(papers).where(eq(papers.arxivId, arxivId))
  }
})
```

- [ ] **Step 4: 통과 확인**

```bash
pnpm db:seed
pnpm --filter @jogan/db test
pnpm typecheck
docker compose exec -T db psql -U jogan -d jogan -tAc "select count(*) from paper_candidates" \
  -tAc "select count(*) from pipeline_state" -tAc "select count(*) from papers"
```
Expected: 테스트 전부 PASS, tsc 오류 0, 세 카운트 모두 시드 상태 그대로(후보 0, 상태 0, 논문 5).

- [ ] **Step 5: 커밋**

```bash
git add packages/db
git commit -m "db: 후보·워터마크·논문 upsert·임베딩·유사도 매칭 쿼리"
```

---

### Task 4: 레이트리밋 · 재시도 래퍼

**Files:**
- Create: `services/collector/src/http.ts`, `services/collector/src/http.test.ts`
- Modify: `services/collector/package.json`

**Interfaces:**
- Produces:
  ```ts
  type HttpDeps = { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number }
  createHttpClient(opts: { minIntervalMs: number; maxRetries: number; timeoutMs?: number }, deps?: HttpDeps):
    { request(url: string, init?: RequestInit): Promise<Response> }
  ```
  - 연속 호출 사이에 최소 `minIntervalMs`를 보장한다.
  - 429·5xx·네트워크 오류는 지수 백오프(1s, 2s, 4s…)로 `maxRetries`까지 재시도한다.
  - 4xx(429 제외)는 **재시도하지 않고** 그대로 반환한다 — 우리 요청이 잘못된 것이라 다시 보내도 같다.

- [ ] **Step 1: package.json에 의존성**

`services/collector/package.json`의 `scripts`는 그대로 두고 추가:

```json
  "dependencies": {
    "@jogan/core": "workspace:*",
    "@jogan/db": "workspace:*",
    "dotenv": "^18.0.2",
    "fast-xml-parser": "^5.11.1",
    "zod": "^4.6.5"
  }
```

- [ ] **Step 2: 실패하는 테스트 작성**

`services/collector/src/http.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createHttpClient } from './http'

function fakeClock() {
  let t = 0
  const sleeps: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms },
    sleeps,
    advance: (ms: number) => { t += ms },
  }
}

const ok = () => new Response('ok', { status: 200 })

describe('createHttpClient', () => {
  it('연속 호출 사이에 최소 간격을 지킨다', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createHttpClient(
      { minIntervalMs: 3000, maxRetries: 0 },
      { fetchImpl: async () => { calls++; return ok() }, sleep: clock.sleep, now: clock.now },
    )
    await client.request('https://x/1')
    await client.request('https://x/2')
    expect(calls).toBe(2)
    expect(clock.sleeps).toEqual([3000])
  })

  it('이미 간격이 지났으면 기다리지 않는다', async () => {
    const clock = fakeClock()
    const client = createHttpClient(
      { minIntervalMs: 3000, maxRetries: 0 },
      { fetchImpl: async () => ok(), sleep: clock.sleep, now: clock.now },
    )
    await client.request('https://x/1')
    clock.advance(5000)
    await client.request('https://x/2')
    expect(clock.sleeps).toEqual([])
  })

  it('429는 지수 백오프로 재시도한다', async () => {
    const clock = fakeClock()
    const statuses = [429, 429, 200]
    let i = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => new Response('', { status: statuses[i++] }), sleep: clock.sleep, now: clock.now },
    )
    const res = await client.request('https://x/1')
    expect(res.status).toBe(200)
    expect(clock.sleeps).toEqual([1000, 2000])
  })

  it('5xx도 재시도한다', async () => {
    const clock = fakeClock()
    const statuses = [503, 200]
    let i = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => new Response('', { status: statuses[i++] }), sleep: clock.sleep, now: clock.now },
    )
    expect((await client.request('https://x/1')).status).toBe(200)
  })

  it('400은 재시도하지 않고 그대로 돌려준다', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => { calls++; return new Response('', { status: 400 }) }, sleep: clock.sleep, now: clock.now },
    )
    expect((await client.request('https://x/1')).status).toBe(400)
    expect(calls).toBe(1)
  })

  it('재시도를 다 써도 실패하면 마지막 응답을 돌려준다', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 2 },
      { fetchImpl: async () => { calls++; return new Response('', { status: 503 }) }, sleep: clock.sleep, now: clock.now },
    )
    expect((await client.request('https://x/1')).status).toBe(503)
    expect(calls).toBe(3) // 최초 1 + 재시도 2
  })

  it('네트워크 오류도 재시도하고, 끝내 실패하면 throw한다', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 1 },
      { fetchImpl: async () => { calls++; throw new Error('boom') }, sleep: clock.sleep, now: clock.now },
    )
    await expect(client.request('https://x/1')).rejects.toThrow('boom')
    expect(calls).toBe(2)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @jogan/collector test`
Expected: FAIL — `./http` 없음. (`test` 스크립트가 없으면 `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`을 `services/collector/package.json`에 추가한다.)

- [ ] **Step 4: 구현**

`services/collector/src/http.ts`:

```ts
export type HttpDeps = {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export type HttpClient = { request(url: string, init?: RequestInit): Promise<Response> }

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 4xx는 우리 요청이 잘못된 것이라 재시도해도 같다. 429와 5xx만 다시 시도한다 */
function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * 외부 API 호출용 래퍼 (CLAUDE.md: 외부 호출은 레이트리밋·재시도를 가진 래퍼를 통해서).
 * arXiv는 요청 간 3초를 요구하고, Voyage는 간격 제한 없이 429/5xx만 재시도하면 된다.
 */
export function createHttpClient(
  opts: { minIntervalMs: number; maxRetries: number; timeoutMs?: number },
  deps: HttpDeps = {},
): HttpClient {
  const fetchImpl = deps.fetchImpl ?? fetch
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? Date.now
  let lastAt: number | null = null

  async function waitForSlot(): Promise<void> {
    if (lastAt === null || opts.minIntervalMs <= 0) return
    const elapsed = now() - lastAt
    if (elapsed < opts.minIntervalMs) await sleep(opts.minIntervalMs - elapsed)
  }

  return {
    async request(url, init) {
      let lastError: unknown = null
      for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        await waitForSlot()
        lastAt = now()
        try {
          const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined
          const res = await fetchImpl(url, { ...init, signal })
          if (!shouldRetry(res.status) || attempt === opts.maxRetries) return res
        } catch (err) {
          lastError = err
          if (attempt === opts.maxRetries) throw err
        }
        await sleep(1000 * 2 ** attempt)
      }
      // 여기 도달하지 않지만 타입을 위해
      throw lastError ?? new Error('요청 실패')
    },
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @jogan/collector test && pnpm typecheck`
Expected: 7개 전부 PASS, tsc 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add services/collector pnpm-lock.yaml
git commit -m "collector: 레이트리밋·재시도 HTTP 래퍼"
```

---

### Task 5: arXiv — 질의 조립 · Atom 파싱 · Paper 매핑

**Files:**
- Create: `services/collector/src/arxiv.ts`, `services/collector/src/arxiv.test.ts`, `services/collector/src/fixtures/arxiv-feed.xml`

**Interfaces:**
- Consumes: Task 1의 `ARXIV_CATEGORIES`·`ARXIV_PAGE_SIZE`, Task 3의 `NewPaper`, Task 4의 `HttpClient`.
- Produces:
  ```ts
  formatArxivDate(d: Date): string                    // 'YYYYMMDDHHmm' (UTC)
  buildArxivQueryUrl(o: { categories: readonly string[]; from: Date; to: Date
                          start: number; pageSize: number }): string
  stripVersion(idUrl: string): { arxivId: string; version: number }
  parseArxivFeed(xml: string): { totalResults: number; entries: unknown[] }
  entryToPaper(entry: unknown): NewPaper | null       // null = 건너뜀 (호출부가 로그)
  dedupeByArxivId(rows: { arxivId: string; version: number; paper: NewPaper }[]): NewPaper[]
  fetchArxivPage(client: HttpClient, url: string): Promise<string>   // 본문 텍스트
  ```

- [ ] **Step 1: 픽스처 저장**

`services/collector/src/fixtures/arxiv-feed.xml` — 실제 응답 구조를 그대로 담는다. 엔트리 세 개: (1) 저자 여럿·DOI 없음, (2) 저자 한 명(단일 요소라 배열이 아니다), (3) DOI와 affiliation 있음.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>107</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <entry>
    <id>http://arxiv.org/abs/2609.30250v1</id>
    <title>Agentic Detection of Online
  Conspiracies</title>
    <updated>2026-09-24T17:58:43Z</updated>
    <published>2026-09-24T17:58:43Z</published>
    <summary>Conspiratorial discourse on social media is not always expressed
  through explicit claims.</summary>
    <link href="https://arxiv.org/abs/2609.30250v1" rel="alternate" type="text/html"/>
    <link href="https://arxiv.org/pdf/2609.30250v1" rel="related" type="application/pdf" title="pdf"/>
    <category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <arxiv:primary_category term="cs.CL"/>
    <author><name>Lior Biton</name></author>
    <author><name>Oren Tsur</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2609.30243v2</id>
    <title>A Single Author Paper</title>
    <updated>2026-09-24T17:57:07Z</updated>
    <published>2026-09-24T17:57:07Z</published>
    <summary>Short abstract.</summary>
    <link href="https://arxiv.org/abs/2609.30243v2" rel="alternate" type="text/html"/>
    <category term="cs.SE" scheme="http://arxiv.org/schemas/atom"/>
    <arxiv:primary_category term="cs.SE"/>
    <author><name>Solo Researcher</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2609.30001v1</id>
    <title>Published Elsewhere</title>
    <updated>2026-09-23T10:00:00Z</updated>
    <published>2026-09-23T10:00:00Z</published>
    <summary>Has a DOI.</summary>
    <link href="https://arxiv.org/abs/2609.30001v1" rel="alternate" type="text/html"/>
    <category term="q-bio.NC" scheme="http://arxiv.org/schemas/atom"/>
    <arxiv:primary_category term="q-bio.NC"/>
    <arxiv:doi>10.1000/example.42</arxiv:doi>
    <author><name>Jane Doe</name><arxiv:affiliation>KAIST</arxiv:affiliation></author>
  </entry>
</feed>
```

- [ ] **Step 2: 실패하는 테스트 작성**

`services/collector/src/arxiv.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildArxivQueryUrl, dedupeByArxivId, entryToPaper, formatArxivDate, parseArxivFeed, stripVersion } from './arxiv'

const xml = readFileSync(join(import.meta.dirname, 'fixtures/arxiv-feed.xml'), 'utf8')

describe('formatArxivDate', () => {
  it('UTC 기준 YYYYMMDDHHmm', () => {
    expect(formatArxivDate(new Date('2026-09-24T17:58:43Z'))).toBe('202609241758')
  })
})

describe('buildArxivQueryUrl', () => {
  const url = buildArxivQueryUrl({
    categories: ['cs.AI', 'cs.CL'],
    from: new Date('2026-09-24T00:00:00Z'),
    to: new Date('2026-09-25T00:00:00Z'),
    start: 0,
    pageSize: 200,
  })
  it('카테고리를 OR로 묶고 날짜 범위를 건다', () => {
    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('cat:cs.AI OR cat:cs.CL')
    expect(decoded).toContain('submittedDate:[202609240000 TO 202609250000]')
  })
  it('제출일 내림차순으로 정렬한다', () => {
    expect(url).toContain('sortBy=submittedDate')
    expect(url).toContain('sortOrder=descending')
  })
  it('페이지네이션 파라미터를 넣는다', () => {
    expect(url).toContain('start=0')
    expect(url).toContain('max_results=200')
  })
})

describe('stripVersion', () => {
  it('URL과 버전 접미사를 떼어낸다', () => {
    expect(stripVersion('http://arxiv.org/abs/2609.30250v1')).toEqual({ arxivId: '2609.30250', version: 1 })
    expect(stripVersion('http://arxiv.org/abs/2609.30243v12')).toEqual({ arxivId: '2609.30243', version: 12 })
  })
  it('버전이 없으면 1로 본다', () => {
    expect(stripVersion('http://arxiv.org/abs/2609.30250')).toEqual({ arxivId: '2609.30250', version: 1 })
  })
})

describe('parseArxivFeed', () => {
  it('총 건수와 엔트리를 읽는다', () => {
    const feed = parseArxivFeed(xml)
    expect(feed.totalResults).toBe(107)
    expect(feed.entries).toHaveLength(3)
  })
  it('엔트리가 하나뿐인 응답도 배열로 돌려준다', () => {
    const single = xml.replace(/<entry>[\s\S]*<\/entry>/, xml.match(/<entry>[\s\S]*?<\/entry>/)![0])
    expect(parseArxivFeed(single).entries).toHaveLength(1)
  })
  it('엔트리가 없는 응답은 빈 배열이다', () => {
    expect(parseArxivFeed('<feed xmlns="http://www.w3.org/2005/Atom"><opensearch:totalResults xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">0</opensearch:totalResults></feed>').entries).toEqual([])
  })
})

describe('entryToPaper', () => {
  const entries = parseArxivFeed(xml).entries

  it('저자 여럿을 매핑하고 제목·초록의 줄바꿈을 정규화한다', () => {
    const p = entryToPaper(entries[0])
    expect(p).not.toBeNull()
    if (!p) return
    expect(p.arxivId).toBe('2609.30250')
    expect(p.title).toBe('Agentic Detection of Online Conspiracies')
    expect(p.abstract).toBe('Conspiratorial discourse on social media is not always expressed through explicit claims.')
    expect(p.authors.map((a) => a.name)).toEqual(['Lior Biton', 'Oren Tsur'])
    expect(p.doi).toBeNull()
    expect(p.source).toBe('arxiv')
    expect(p.venue).toEqual({ name: 'arXiv', kind: 'preprint' })
    expect(p.openAccess).toBe(true)
    expect(p.codeUrl).toBeNull()
    expect(p.pdfUrl).toBe('https://arxiv.org/pdf/2609.30250')
    expect(p.publishedAt.toISOString()).toBe('2026-09-24T17:58:43.000Z')
  })

  it('저자가 한 명이어도 배열로 만든다', () => {
    const p = entryToPaper(entries[1])
    expect(p?.authors).toEqual([{ name: 'Solo Researcher' }])
  })

  it('DOI와 소속을 읽는다', () => {
    const p = entryToPaper(entries[2])
    expect(p?.doi).toBe('10.1000/example.42')
    expect(p?.authors[0]).toEqual({ name: 'Jane Doe', affiliation: 'KAIST' })
  })

  it('필수 필드가 없으면 null을 돌려준다 (건너뛰기)', () => {
    expect(entryToPaper({ id: 'http://arxiv.org/abs/1v1' })).toBeNull()
    expect(entryToPaper({})).toBeNull()
    expect(entryToPaper(null)).toBeNull()
  })
})

describe('dedupeByArxivId', () => {
  it('같은 id는 가장 높은 버전만 남긴다', () => {
    const mk = (arxivId: string, version: number, title: string) => ({
      arxivId, version,
      paper: { arxivId, title } as never,
    })
    const out = dedupeByArxivId([mk('a', 1, 'v1'), mk('a', 3, 'v3'), mk('b', 1, 'b1'), mk('a', 2, 'v2')])
    expect(out).toHaveLength(2)
    expect(out.map((p) => (p as unknown as { title: string }).title).sort()).toEqual(['b1', 'v3'])
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @jogan/collector test arxiv`
Expected: FAIL — `./arxiv` 없음.

- [ ] **Step 4: 구현**

`services/collector/src/arxiv.ts`:

```ts
import { XMLParser } from 'fast-xml-parser'
import { z } from 'zod'
import type { NewPaper } from '@jogan/db'
import type { HttpClient } from './http'

const ARXIV_API = 'https://export.arxiv.org/api/query'

/** arXiv 질의의 날짜 형식: UTC 기준 YYYYMMDDHHmm */
export function formatArxivDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`
}

export function buildArxivQueryUrl(o: {
  categories: readonly string[]
  from: Date
  to: Date
  start: number
  pageSize: number
}): string {
  const cats = o.categories.map((c) => `cat:${c}`).join(' OR ')
  const range = `submittedDate:[${formatArxivDate(o.from)} TO ${formatArxivDate(o.to)}]`
  const params = new URLSearchParams({
    search_query: `(${cats}) AND ${range}`,
    start: String(o.start),
    max_results: String(o.pageSize),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  })
  return `${ARXIV_API}?${params.toString()}`
}

export function stripVersion(idUrl: string): { arxivId: string; version: number } {
  const tail = idUrl.split('/abs/')[1] ?? idUrl
  const m = tail.match(/^(.+?)v(\d+)$/)
  return m ? { arxivId: m[1], version: Number(m[2]) } : { arxivId: tail, version: 1 }
}

/** arXiv는 제목·초록을 줄바꿈과 들여쓰기가 섞인 채로 준다 */
function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // 단일 요소도 항상 배열로 — fast-xml-parser는 기본적으로 하나면 객체를 준다
  isArray: (name) => ['entry', 'author', 'category', 'link'].includes(name),
})

export function parseArxivFeed(xml: string): { totalResults: number; entries: unknown[] } {
  const doc = parser.parse(xml) as Record<string, unknown>
  const feed = (doc.feed ?? {}) as Record<string, unknown>
  const total = Number(feed['opensearch:totalResults'] ?? 0)
  const entries = Array.isArray(feed.entry) ? feed.entry : []
  return { totalResults: Number.isFinite(total) ? total : 0, entries }
}

const AuthorNode = z.object({
  name: z.union([z.string(), z.number()]).transform(String),
  'arxiv:affiliation': z.union([z.string(), z.number()]).transform(String).optional(),
})

const EntryNode = z.object({
  id: z.string(),
  title: z.union([z.string(), z.number()]).transform(String),
  summary: z.union([z.string(), z.number()]).transform(String),
  published: z.string(),
  author: z.array(AuthorNode).min(1),
  'arxiv:doi': z.union([z.string(), z.number()]).transform(String).optional(),
})

/** 매핑할 수 없는 엔트리는 null. 호출부가 로그를 남기고 그 한 편만 건너뛴다 */
export function entryToPaper(entry: unknown): NewPaper | null {
  const parsed = EntryNode.safeParse(entry)
  if (!parsed.success) return null
  const e = parsed.data
  const { arxivId } = stripVersion(e.id)
  if (!arxivId) return null
  const publishedAt = new Date(e.published)
  if (Number.isNaN(publishedAt.getTime())) return null

  return {
    doi: e['arxiv:doi'] ?? null,
    arxivId,
    title: normalizeText(e.title),
    abstract: normalizeText(e.summary),
    authors: e.author.map((a) => {
      const affiliation = a['arxiv:affiliation']
      return affiliation ? { name: a.name, affiliation } : { name: a.name }
    }),
    publishedAt,
    source: 'arxiv',
    venue: { name: 'arXiv', kind: 'preprint' },
    pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
    codeUrl: null,
    openAccess: true,
  }
}

/** 한 배치 안에 v1과 v2가 같이 오면 높은 버전만 남긴다 */
export function dedupeByArxivId(
  rows: { arxivId: string; version: number; paper: NewPaper }[],
): NewPaper[] {
  const best = new Map<string, { version: number; paper: NewPaper }>()
  for (const r of rows) {
    const cur = best.get(r.arxivId)
    if (!cur || r.version > cur.version) best.set(r.arxivId, { version: r.version, paper: r.paper })
  }
  return [...best.values()].map((v) => v.paper)
}

export async function fetchArxivPage(client: HttpClient, url: string): Promise<string> {
  const res = await client.request(url, { headers: { 'User-Agent': 'jogan/0.1 (research digest)' } })
  if (!res.ok) throw new Error(`arXiv 응답 ${res.status}`)
  return res.text()
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @jogan/collector test && pnpm typecheck`
Expected: 전부 PASS, tsc 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add services/collector
git commit -m "collector: arXiv 질의 조립·Atom 파싱·Paper 매핑"
```

---

### Task 6: Voyage 임베딩

**Files:**
- Create: `services/collector/src/embed.ts`, `services/collector/src/embed.test.ts`

**Interfaces:**
- Consumes: Task 1의 `EMBEDDING_DIM`·`VOYAGE_MODEL`·`VOYAGE_BATCH_SIZE`, Task 4의 `HttpClient`.
- Produces:
  ```ts
  paperEmbeddingInput(title: string, abstract: string): string   // 순수, 8000자에서 자름
  chunk<T>(items: T[], size: number): T[][]                      // 순수
  embedTexts(client: HttpClient, apiKey: string, texts: string[],
             inputType: 'document' | 'query'): Promise<number[][]>
  ```
  - 입력 순서와 출력 순서가 1:1로 대응한다.
  - 응답 차원이 `EMBEDDING_DIM`과 다르면 throw한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`services/collector/src/embed.test.ts`:

```ts
import { EMBEDDING_DIM } from '@jogan/core'
import { describe, expect, it } from 'vitest'
import { chunk, embedTexts, paperEmbeddingInput } from './embed'
import type { HttpClient } from './http'

const vec = (v: number) => Array.from({ length: EMBEDDING_DIM }, () => v)

function stubClient(handler: (body: unknown) => unknown): HttpClient {
  return {
    async request(_url, init) {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify(handler(body)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  }
}

describe('paperEmbeddingInput', () => {
  it('제목과 초록을 빈 줄로 잇는다', () => {
    expect(paperEmbeddingInput('제목', '초록')).toBe('제목\n\n초록')
  })
  it('8000자에서 자른다', () => {
    const out = paperEmbeddingInput('t', 'a'.repeat(20000))
    expect(out.length).toBe(8000)
  })
})

describe('chunk', () => {
  it('크기대로 나눈다', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  it('빈 배열은 빈 배열', () => {
    expect(chunk([], 3)).toEqual([])
  })
})

describe('embedTexts', () => {
  it('입력 순서대로 벡터를 돌려준다', async () => {
    const client = stubClient((body) => {
      const input = (body as { input: string[] }).input
      return { data: input.map((_, i) => ({ index: i, embedding: vec(i) })) }
    })
    const out = await embedTexts(client, 'k', ['a', 'b'], 'document')
    expect(out).toHaveLength(2)
    expect(out[0][0]).toBe(0)
    expect(out[1][0]).toBe(1)
  })

  it('배치 크기를 넘으면 나눠 보내고 결과를 이어붙인다', async () => {
    let calls = 0
    const client = stubClient((body) => {
      calls++
      const input = (body as { input: string[] }).input
      expect(input.length).toBeLessThanOrEqual(128)
      return { data: input.map((_, i) => ({ index: i, embedding: vec(1) })) }
    })
    const out = await embedTexts(client, 'k', Array.from({ length: 300 }, (_, i) => `t${i}`), 'document')
    expect(out).toHaveLength(300)
    expect(calls).toBe(3)
  })

  it('응답 순서가 뒤섞여 와도 index로 되돌린다', async () => {
    const client = stubClient(() => ({
      data: [
        { index: 1, embedding: vec(9) },
        { index: 0, embedding: vec(5) },
      ],
    }))
    const out = await embedTexts(client, 'k', ['a', 'b'], 'query')
    expect(out[0][0]).toBe(5)
    expect(out[1][0]).toBe(9)
  })

  it('차원이 다르면 throw한다', async () => {
    const client = stubClient(() => ({ data: [{ index: 0, embedding: [1, 2, 3] }] }))
    await expect(embedTexts(client, 'k', ['a'], 'document')).rejects.toThrow(/차원/)
  })

  it('응답 모양이 다르면 throw한다', async () => {
    const client = stubClient(() => ({ nope: true }))
    await expect(embedTexts(client, 'k', ['a'], 'document')).rejects.toThrow()
  })

  it('빈 입력은 호출하지 않는다', async () => {
    let calls = 0
    const client: HttpClient = { async request() { calls++; return new Response('{}') } }
    expect(await embedTexts(client, 'k', [], 'document')).toEqual([])
    expect(calls).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jogan/collector test embed`
Expected: FAIL — `./embed` 없음.

- [ ] **Step 3: 구현**

`services/collector/src/embed.ts`:

```ts
import { EMBEDDING_DIM, VOYAGE_BATCH_SIZE, VOYAGE_MODEL } from '@jogan/core'
import { z } from 'zod'
import type { HttpClient } from './http'

const VOYAGE_API = 'https://api.voyageai.com/v1/embeddings'
/** 제목+초록이 이보다 길 일은 거의 없지만, 비용이 튀지 않게 잘라둔다 */
const MAX_INPUT_CHARS = 8000

export function paperEmbeddingInput(title: string, abstract: string): string {
  return `${title}\n\n${abstract}`.slice(0, MAX_INPUT_CHARS)
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const VoyageResponse = z.object({
  data: z.array(z.object({ index: z.number().int().min(0), embedding: z.array(z.number()) })).min(1),
})

/**
 * 입력 순서와 같은 순서로 벡터를 돌려준다.
 * 응답 차원이 EMBEDDING_DIM과 다르면 즉시 실패한다 — 조용히 저장하면 pgvector가 나중에 터진다.
 */
export async function embedTexts(
  client: HttpClient,
  apiKey: string,
  texts: string[],
  inputType: 'document' | 'query',
): Promise<number[][]> {
  if (texts.length === 0) return []
  const out: number[][] = []

  for (const batch of chunk(texts, VOYAGE_BATCH_SIZE)) {
    const res = await client.request(VOYAGE_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: batch, input_type: inputType }),
    })
    if (!res.ok) throw new Error(`Voyage 응답 ${res.status}: ${await res.text()}`)

    const parsed = VoyageResponse.parse(await res.json())
    const byIndex = new Map(parsed.data.map((d) => [d.index, d.embedding]))
    for (let i = 0; i < batch.length; i++) {
      const v = byIndex.get(i)
      if (!v) throw new Error(`Voyage 응답에 index ${i}가 없다`)
      if (v.length !== EMBEDDING_DIM) {
        throw new Error(`임베딩 차원이 ${EMBEDDING_DIM}이 아니다: ${v.length}`)
      }
      out.push(v)
    }
  }
  return out
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @jogan/collector test && pnpm typecheck`
Expected: 전부 PASS, tsc 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add services/collector
git commit -m "collector: Voyage 임베딩 클라이언트"
```

---

### Task 7: 후보 선별

**Files:**
- Create: `services/collector/src/match.ts`, `services/collector/src/match.test.ts`

**Interfaces:**
- Consumes: Task 1의 `RELEVANCE_THRESHOLD`·`CANDIDATES_PER_INTEREST`·`COLLECT_WINDOW_DAYS`, Task 3의 `matchPapersForInterest`·`upsertCandidates`·`listInterests`.
- Produces:
  ```ts
  type InterestMatches = { interestId: string; matches: { paperId: string; relevance: number }[] }
  selectBestPerPaper(groups: InterestMatches[], threshold: number, perInterest: number):
    { paperId: string; interestId: string; relevance: number }[]
  ```
  - 임계값 미만은 버린다.
  - 관심사당 상위 `perInterest`편까지만 본다 (입력은 이미 내림차순이라고 가정한다).
  - 한 논문이 여러 관심사에 걸리면 **가장 높은 relevance 하나만** 남기고, 그때 `interestId`도 그 관심사의 것이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`services/collector/src/match.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { selectBestPerPaper } from './match'

describe('selectBestPerPaper', () => {
  it('임계값 미만은 버린다', () => {
    const out = selectBestPerPaper(
      [{ interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.9 }, { paperId: 'p2', relevance: 0.2 }] }],
      0.45,
      50,
    )
    expect(out.map((r) => r.paperId)).toEqual(['p1'])
  })

  it('관심사당 상위 N편까지만 본다', () => {
    const matches = Array.from({ length: 10 }, (_, i) => ({ paperId: `p${i}`, relevance: 0.9 - i * 0.01 }))
    const out = selectBestPerPaper([{ interestId: 'i1', matches }], 0.45, 3)
    expect(out).toHaveLength(3)
    expect(out.map((r) => r.paperId)).toEqual(['p0', 'p1', 'p2'])
  })

  it('한 논문이 두 관심사에 걸리면 더 높은 쪽만 남고 interestId도 그쪽이다', () => {
    const out = selectBestPerPaper(
      [
        { interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.6 }] },
        { interestId: 'i2', matches: [{ paperId: 'p1', relevance: 0.8 }] },
      ],
      0.45,
      50,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ paperId: 'p1', interestId: 'i2', relevance: 0.8 })
  })

  it('순서가 반대로 들어와도 결과는 같다', () => {
    const out = selectBestPerPaper(
      [
        { interestId: 'i2', matches: [{ paperId: 'p1', relevance: 0.8 }] },
        { interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.6 }] },
      ],
      0.45,
      50,
    )
    expect(out[0].interestId).toBe('i2')
  })

  it('빈 입력은 빈 결과', () => {
    expect(selectBestPerPaper([], 0.45, 50)).toEqual([])
    expect(selectBestPerPaper([{ interestId: 'i1', matches: [] }], 0.45, 50)).toEqual([])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @jogan/collector test match`
Expected: FAIL — `./match` 없음.

- [ ] **Step 3: 구현**

`services/collector/src/match.ts`:

```ts
export type InterestMatches = {
  interestId: string
  /** relevance 내림차순으로 정렬돼 있다고 가정한다 (DB가 그렇게 준다) */
  matches: { paperId: string; relevance: number }[]
}

export type SelectedCandidate = { paperId: string; interestId: string; relevance: number }

/**
 * 관심사별 매칭 결과를 논문 단위로 합친다.
 * 한 논문이 여러 관심사에 걸리면 가장 높은 relevance 하나만 남기고, interestId도 그 관심사의 것이다.
 */
export function selectBestPerPaper(
  groups: InterestMatches[],
  threshold: number,
  perInterest: number,
): SelectedCandidate[] {
  const best = new Map<string, SelectedCandidate>()
  for (const g of groups) {
    for (const m of g.matches.filter((m) => m.relevance >= threshold).slice(0, perInterest)) {
      const cur = best.get(m.paperId)
      if (!cur || m.relevance > cur.relevance) {
        best.set(m.paperId, { paperId: m.paperId, interestId: g.interestId, relevance: m.relevance })
      }
    }
  }
  return [...best.values()]
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @jogan/collector test && pnpm typecheck`
Expected: 전부 PASS, tsc 오류 0.

- [ ] **Step 5: 커밋**

```bash
git add services/collector
git commit -m "collector: 후보 선별 로직"
```

---

### Task 8: 오케스트레이션 · 환경변수 · 실제 실행

**Files:**
- Modify: `services/collector/src/index.ts` (전체 교체)
- Modify: `.env.example`, `README.md`

**Interfaces:**
- Consumes: Task 1~7 전부.
- Produces: 없음 (진입점).

- [ ] **Step 1: 환경변수 문서화**

`.env.example`의 `ANTHROPIC_API_KEY` 줄 근처에 추가:

```
# 임베딩(voyage-3). https://voyageai.com 에서 발급.
# 없으면 pipeline:collect가 수집·중복 제거까지만 하고 임베딩 단계에서 멈춘다.
VOYAGE_API_KEY=
```

`README.md`의 `.env 채우기` 절에 한 줄 추가:
- `VOYAGE_API_KEY` — 관심사·논문 임베딩에 쓴다. https://voyageai.com 에서 발급.

- [ ] **Step 2: 오케스트레이션 구현**

`services/collector/src/index.ts` 전체 교체:

```ts
import {
  ARXIV_CATEGORIES,
  ARXIV_MIN_INTERVAL_MS,
  ARXIV_PAGE_SIZE,
  CANDIDATES_PER_INTEREST,
  COLLECT_BACKFILL_DAYS,
  COLLECT_MAX_PER_RUN,
  COLLECT_WINDOW_DAYS,
  RELEVANCE_THRESHOLD,
} from '@jogan/core'
import {
  db,
  getPipelineState,
  listUnembeddedInterests,
  listUnembeddedPapers,
  matchPapersForInterest,
  setInterestEmbedding,
  setPaperEmbedding,
  setPipelineState,
  todayInSeoul,
  upsertArxivPapers,
  upsertCandidates,
  users,
  interests as interestsTable,
} from '@jogan/db'
import { eq, isNotNull } from 'drizzle-orm'
import { buildArxivQueryUrl, dedupeByArxivId, entryToPaper, fetchArxivPage, parseArxivFeed, stripVersion } from './arxiv'
import { embedTexts, paperEmbeddingInput } from './embed'
import { createHttpClient } from './http'
import { selectBestPerPaper } from './match'

const WATERMARK_KEY = 'collector:arxiv:last_submitted_at'
/** 워터마크 경계에서 새는 것을 막는 겹침. upsert라 중복 비용이 없다 */
const OVERLAP_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const log = (stage: string, msg: string) => console.log(`[collector:${stage}] ${msg}`)

/** ①② 수집 + 중복 제거. 반환: 저장한 논문 수와 가장 늦은 published_at */
async function collect(): Promise<{ stored: number; newest: Date | null }> {
  const arxiv = createHttpClient(
    { minIntervalMs: ARXIV_MIN_INTERVAL_MS, maxRetries: 3, timeoutMs: 30_000 },
    {},
  )
  const saved = await getPipelineState(WATERMARK_KEY)
  const to = new Date()
  const from = saved
    ? new Date(Date.parse(saved) - OVERLAP_MS)
    : new Date(to.getTime() - COLLECT_BACKFILL_DAYS * DAY_MS)
  log('fetch', `${from.toISOString()} ~ ${to.toISOString()}, 카테고리 ${ARXIV_CATEGORIES.length}개`)

  let start = 0
  let stored = 0
  let skipped = 0
  let newest: Date | null = null

  while (stored < COLLECT_MAX_PER_RUN) {
    const url = buildArxivQueryUrl({ categories: ARXIV_CATEGORIES, from, to, start, pageSize: ARXIV_PAGE_SIZE })
    const xml = await fetchArxivPage(arxiv, url)
    const { entries, totalResults } = parseArxivFeed(xml)
    if (start === 0) log('fetch', `총 ${totalResults}편`)
    if (entries.length === 0) break

    const rows: { arxivId: string; version: number; paper: ReturnType<typeof entryToPaper> }[] = []
    for (const e of entries) {
      const paper = entryToPaper(e)
      if (!paper) {
        skipped++
        log('fetch', `매핑 실패로 건너뜀: ${JSON.stringify(e).slice(0, 120)}`)
        continue
      }
      const { version } = stripVersion(String((e as { id: string }).id))
      rows.push({ arxivId: paper.arxivId, version, paper })
      if (!newest || paper.publishedAt > newest) newest = paper.publishedAt
    }

    const deduped = dedupeByArxivId(
      rows.filter((r): r is typeof r & { paper: NonNullable<typeof r.paper> } => r.paper !== null),
    )
    try {
      stored += await upsertArxivPapers(deduped)
    } catch (err) {
      // DOI unique 충돌 등. 배치를 한 편씩 재시도해 나쁜 한 편만 건너뛴다
      for (const p of deduped) {
        try {
          stored += await upsertArxivPapers([p])
        } catch (e2) {
          skipped++
          log('store', `저장 실패로 건너뜀 ${p.arxivId}: ${String(e2)}`)
        }
      }
    }

    start += ARXIV_PAGE_SIZE
    if (start >= totalResults) break
  }

  log('fetch', `저장 ${stored}편, 건너뜀 ${skipped}편`)
  return { stored, newest }
}

/** ③ 임베딩 */
async function embed(): Promise<{ papers: number; interests: number }> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    throw new Error(
      'VOYAGE_API_KEY가 없다. .env에 넣어야 임베딩 단계가 돈다 (https://voyageai.com). ' +
        '수집·중복 제거 결과는 이미 DB에 저장됐으니 키를 넣고 다시 실행하면 이어서 진행한다.',
    )
  }
  const voyage = createHttpClient({ minIntervalMs: 0, maxRetries: 3, timeoutMs: 60_000 }, {})

  let paperCount = 0
  for (;;) {
    const batch = await listUnembeddedPapers(256)
    if (batch.length === 0) break
    try {
      const vectors = await embedTexts(
        voyage,
        apiKey,
        batch.map((p) => paperEmbeddingInput(p.title, p.abstract)),
        'document',
      )
      for (let i = 0; i < batch.length; i++) await setPaperEmbedding(batch[i].id, vectors[i])
      paperCount += batch.length
      log('embed', `논문 ${paperCount}편`)
    } catch (err) {
      log('embed', `배치 실패, 건너뜀 (다음 실행에서 재시도): ${String(err)}`)
      break
    }
  }

  const pending = await listUnembeddedInterests()
  let interestCount = 0
  if (pending.length > 0) {
    try {
      const vectors = await embedTexts(voyage, apiKey, pending.map((i) => i.label), 'query')
      for (let i = 0; i < pending.length; i++) await setInterestEmbedding(pending[i].id, vectors[i])
      interestCount = pending.length
    } catch (err) {
      log('embed', `관심사 임베딩 실패 (다음 실행에서 재시도): ${String(err)}`)
    }
  }
  log('embed', `논문 ${paperCount}편, 관심사 ${interestCount}개`)
  return { papers: paperCount, interests: interestCount }
}

/** ④ 관련성 매칭 */
async function match(): Promise<number> {
  const since = new Date(Date.now() - COLLECT_WINDOW_DAYS * DAY_MS)
  const collectedFor = todayInSeoul()
  const allUsers = await db.select({ id: users.id }).from(users)
  let total = 0

  for (const user of allUsers) {
    const owned = await db
      .select({ id: interestsTable.id, embedding: interestsTable.embedding })
      .from(interestsTable)
      .where(eq(interestsTable.userId, user.id))

    const groups = []
    for (const it of owned) {
      if (!it.embedding) {
        log('match', `관심사 ${it.id}는 아직 임베딩이 없어 건너뜀`)
        continue
      }
      groups.push({
        interestId: it.id,
        matches: await matchPapersForInterest(it.embedding, since, CANDIDATES_PER_INTEREST),
      })
    }

    const selected = selectBestPerPaper(groups, RELEVANCE_THRESHOLD, CANDIDATES_PER_INTEREST)
    await upsertCandidates(
      selected.map((s) => ({
        userId: user.id,
        paperId: s.paperId,
        interestId: s.interestId,
        relevance: s.relevance,
        collectedFor,
      })),
    )
    total += selected.length
    log('match', `사용자 ${user.id}: 후보 ${selected.length}편`)
  }
  return total
}

async function main() {
  const started = Date.now()
  const { stored, newest } = await collect()
  if (newest) {
    await setPipelineState(WATERMARK_KEY, newest.toISOString())
    log('fetch', `워터마크 → ${newest.toISOString()}`)
  }
  await embed()
  const candidates = await match()
  log('done', `논문 ${stored}편 저장, 후보 ${candidates}편, ${((Date.now() - started) / 1000).toFixed(1)}초`)
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
```

`isNotNull` import가 쓰이지 않으면 지운다. `todayInSeoul`·`users`·`interests` export 이름이 다르면 `packages/db`의 실제 export를 확인해 맞춘다.

- [ ] **Step 3: 타입·테스트 확인**

Run: `pnpm typecheck && pnpm test`
Expected: tsc 오류 0, 기존·신규 테스트 전부 PASS.

- [ ] **Step 4: VOYAGE_API_KEY 없이 실행 (①②만)**

```bash
docker compose up -d
pnpm db:seed
pnpm pipeline:collect
```
Expected: `[collector:fetch]` 로그가 실제 건수를 찍고, 임베딩 단계에서 **명확한 메시지와 함께 비정상 종료**한다(조용히 건너뛰지 않는다).

```bash
docker compose exec -T db psql -U jogan -d jogan -tAc "select count(*) from papers where source='arxiv'"
docker compose exec -T db psql -U jogan -d jogan -tAc "select value from pipeline_state where key='collector:arxiv:last_submitted_at'"
```
Expected: arXiv 논문이 수백 편 이상, 워터마크가 기록돼 있다.

- [ ] **Step 5: 멱등성 확인**

```bash
pnpm pipeline:collect   # 두 번째 실행
docker compose exec -T db psql -U jogan -d jogan -tAc "select count(*) from papers where source='arxiv'"
docker compose exec -T db psql -U jogan -d jogan -tAc "select count(*) from papers p1 join papers p2 on p1.arxiv_id=p2.arxiv_id and p1.id<>p2.id"
```
Expected: 논문 수가 거의 그대로(겹침 구간만 재처리), 중복 `arxiv_id`가 **0건**.

- [ ] **Step 6: VOYAGE_API_KEY를 넣고 전체 실행**

`.env`에 키를 넣은 뒤:
```bash
pnpm pipeline:collect
docker compose exec -T db psql -U jogan -d jogan \
  -tAc "select count(*) from papers where embedding is null" \
  -tAc "select count(*) from interests where embedding is null" \
  -tAc "select count(*) from paper_candidates" \
  -c "select p.title, c.relevance from paper_candidates c join papers p on p.id=c.paper_id order by c.relevance desc limit 10"
```
Expected: 임베딩이 비어 있는 논문·관심사가 0, `paper_candidates`에 행이 생긴다. **상위 10편의 제목을 리포트에 그대로 붙여라** — `RELEVANCE_THRESHOLD`가 적절한지 사람이 판단할 근거다.

키가 없으면 Step 6은 건너뛰고 리포트에 "키 미제공으로 미검증"이라고 적는다. **키를 만들어내려 하지 마라.**

- [ ] **Step 7: 커밋**

```bash
git add services/collector .env.example README.md
git commit -m "collector: 네 단계 오케스트레이션과 환경변수 문서화"
```

---

### Task 9: 실호출 통합 테스트 (opt-in)

**Files:**
- Create: `services/collector/src/live.test.ts`

**Interfaces:** 없음 (검증 전용).

- [ ] **Step 1: 테스트 작성**

`services/collector/src/live.test.ts`:

```ts
import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { ARXIV_CATEGORIES } from '@jogan/core'
import { buildArxivQueryUrl, entryToPaper, fetchArxivPage, parseArxivFeed } from './arxiv'
import { embedTexts } from './embed'
import { createHttpClient } from './http'

config({ path: ['.env', '../../.env'], quiet: true })

// 실제 외부 API를 부른다. 기본 `pnpm test`에서는 돌지 않는다.
//   COLLECTOR_LIVE_TEST=1 pnpm --filter @jogan/collector test live
const live = process.env.COLLECTOR_LIVE_TEST === '1'

describe.skipIf(!live)('실호출', () => {
  it('arXiv에서 실제 엔트리를 가져와 Paper로 매핑한다', async () => {
    const client = createHttpClient({ minIntervalMs: 3000, maxRetries: 2, timeoutMs: 30_000 }, {})
    const to = new Date()
    const from = new Date(to.getTime() - 2 * 24 * 60 * 60 * 1000)
    const url = buildArxivQueryUrl({ categories: ARXIV_CATEGORIES.slice(0, 2), from, to, start: 0, pageSize: 5 })
    const xml = await fetchArxivPage(client, url)
    const { entries } = parseArxivFeed(xml)
    expect(entries.length).toBeGreaterThan(0)

    const papers = entries.map(entryToPaper).filter((p) => p !== null)
    expect(papers.length).toBeGreaterThan(0)
    for (const p of papers) {
      expect(p.arxivId).toMatch(/^\d{4}\.\d{4,5}$/)
      expect(p.title.length).toBeGreaterThan(0)
      expect(p.authors.length).toBeGreaterThan(0)
      expect(p.source).toBe('arxiv')
    }
  }, 60_000)

  it.skipIf(!process.env.VOYAGE_API_KEY)('Voyage가 EMBEDDING_DIM 차원을 돌려준다', async () => {
    const { EMBEDDING_DIM } = await import('@jogan/core')
    const client = createHttpClient({ minIntervalMs: 0, maxRetries: 2, timeoutMs: 60_000 }, {})
    const out = await embedTexts(client, String(process.env.VOYAGE_API_KEY), ['수면과 기억 공고화'], 'query')
    expect(out).toHaveLength(1)
    expect(out[0]).toHaveLength(EMBEDDING_DIM)
  }, 60_000)
})
```

- [ ] **Step 2: 기본 실행에서 skip되는지 확인**

Run: `pnpm test`
Expected: `live.test.ts`가 skip으로 표시되고 전체는 green.

- [ ] **Step 3: opt-in 실행**

Run: `COLLECTOR_LIVE_TEST=1 pnpm --filter @jogan/collector test live`
Expected: arXiv 테스트 PASS. Voyage 테스트는 키가 있으면 PASS, 없으면 skip.

- [ ] **Step 4: 커밋**

```bash
git add services/collector
git commit -m "collector: arXiv·Voyage 실호출 통합 테스트 (opt-in)"
```

---

### Task 10: 전체 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 클린 실행**

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm test
pnpm build
pnpm pipeline:collect
git status --short
```
Expected: 전부 종료 코드 0, `git status`는 빈 출력.

- [ ] **Step 2: 결과를 사람이 볼 수 있게 정리**

```bash
docker compose exec -T db psql -U jogan -d jogan \
  -c "select count(*) papers, count(embedding) embedded from papers" \
  -c "select i.label, count(*) n, round(max(c.relevance)::numeric,3) best
      from paper_candidates c join interests i on i.id=c.interest_id
      group by i.label order by n desc" \
  -c "select round(c.relevance::numeric,3) rel, left(p.title,70) title
      from paper_candidates c join papers p on p.id=c.paper_id
      order by c.relevance desc limit 15"
```
이 세 표를 리포트에 그대로 붙인다. **`RELEVANCE_THRESHOLD`가 맞는지 판단할 유일한 근거**다.

- [ ] **Step 3: 임계값 소견**

상위 15편을 읽고, 관심사와 실제로 관련이 있는지 한 문단으로 적어라. 무관한 논문이 상위에 많으면 임계값을 올려야 하고, 후보가 너무 적으면 내려야 한다. **값을 바꾸지는 말고 소견만 적어라** — 사람이 보고 정한다.

---

## Self-Review

- **스펙 커버리지:** 결정 사항 9개 → Task 1(상수·모델·카테고리·임계값), Task 2(후보 테이블·워터마크 테이블), Task 5(XML 파서·고정 카테고리·초기 적재), Task 6(Voyage fetch 직접). 흐름 4단계 → Task 5(①②)·6(③)·7(④)·8(오케스트레이션). 스키마 2개 → Task 2. Atom 매핑표 → Task 5 Step 4. 중복 제거 3규칙(버전·초록 변경 시 임베딩 무효화·DOI 충돌 건너뛰기) → Task 3(upsert SQL)·Task 5(`dedupeByArxivId`)·Task 8(한 편씩 재시도). 임베딩 규칙(입력 형태·차원 검증·배치 실패 격리) → Task 6·8. 매칭 규칙 → Task 7·8. 상수 8개 → Task 1. 래퍼 → Task 4. 테스트 3종 → Task 3(DB 통합)·4~7(순수)·9(실호출). 환경변수 → Task 8. 완료 기준 → Task 10.
- **플레이스홀더 스캔:** 없음. `setWhere`·`todayInSeoul` 등 API 이름이 다를 경우의 지시는 "확인해서 맞춰라 + 리포트에 적어라"로 구체적이며, 지켜야 할 동작을 함께 명시했다.
- **타입 일관성:** `NewPaper`가 Task 3에서 정의되고 Task 5·8에서 그 이름으로 쓰인다. `HttpClient`(Task 4) → Task 5·6·9. `InterestMatches`/`SelectedCandidate`(Task 7) → Task 8. `CandidateRow`(Task 3) → Task 8의 `upsertCandidates` 인자. `paperEmbeddingInput`·`embedTexts` 시그니처가 Task 6 정의와 Task 8 호출에서 동일. 워터마크 키 문자열 `collector:arxiv:last_submitted_at`이 스펙·Task 8에서 일치.
