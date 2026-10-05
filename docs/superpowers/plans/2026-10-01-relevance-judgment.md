# collector 관련성 판정 단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** collector가 관심사별 상위 20편 각각에 대해 Haiku로 "이 관심사의 연구 주제인가"를 예/아니오로 판정하고, 통과한 것만 `paper_candidates`에 넣는다.

**Architecture:** 순수 함수 `judgeRelevance`(LLM 주입)와 프롬프트 파일을 `services/collector`에 두고, `(관심사, 논문)` 판정 결과는 새 테이블 `relevance_judgments`에 캐시한다. `match()`는 floor·관심사별 상한을 적용한 뒤 판정하고, 통과한 매치만 기존 `selectBestPerPaper`에 넘긴다. 탈락한 쌍의 기존 후보 행은 upsert 전에 지운다.

**Tech Stack:** TypeScript, Drizzle ORM + PostgreSQL(pgvector), zod 4, `@anthropic-ai/sdk` ^0.68.0, vitest, pnpm workspaces

**Spec:** `docs/superpowers/specs/2026-09-30-relevance-judgment-design.md` (결정 배경: `docs/adr/0001-relevance-belongs-to-collector.md`)

## Global Constraints

- 모델 `claude-haiku-4-5-20251001`, `max_tokens` 256, 호출은 **순차**(동시 요청 없음), SDK 재시도 `maxRetries: 2`
- 프롬프트는 `services/collector/prompts/relevance.md` 파일로 둔다. 코드에 인라인하지 않는다 (CLAUDE.md)
- 서버 로직에 `any` 금지. LLM 응답은 zod `{ relevant: boolean, reason: string.min(1) }`로 파싱
- 판정 실패는 **보류**: 후보에도 캐시에도 넣지 않는다. 판정 없이 통과시키는 경로는 없다
- 빈 자리는 채우지 않는다. floor 아래 쌍에는 LLM을 부르지 않는다
- `selectBestPerPaper`의 동작은 바꾸지 않는다
- evaluator와 `assessments`는 건드리지 않는다
- 마이그레이션은 `pnpm db:generate`로 파일을 만들어 커밋한다. 로컬 DB는 `localhost:5433` (`docker start jogan-db`)
- 커밋 메시지는 한국어, `<영역>: <내용>` 형식(예: `collector: …`, `db: …`), 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 프로세스 종료는 `lsof -ti:PORT`로. `pkill -f` 금지

## Review Focus

1. **기존 `match` 테스트가 실제 Anthropic을 부르는 것** — `index.ts`가 `.env`를 로드하므로 판정 의존성을 주입하지 않은 테스트는 키가 있는 머신에서 진짜 API를 부른다(돈). 모든 match 테스트가 `relevanceDeps()`를 주입해야 한다 → Task 3에서 기존 테스트 전부 수정 + `judge` 미주입 시 키 없으면 던지는 테스트.
2. **캐시에서 꺼낸 "탈락" 판정도 기존 후보를 지워야 한다** — 9/29에 만든 무관한 후보는 다음 실행부터 캐시 적중으로 탈락한다. 새로 판정한 탈락만 지우면 그 행이 영원히 남는다 → Task 3 테스트 "캐시된 탈락 쌍도 deleteCandidates로 넘어간다".
3. **판정이 전량 실패하면 조용히 0편** — 키 만료·크레딧 소진이면 모든 호출이 null이 되어 후보 0편·exit 0, 새벽 cron에 초록불로 보인다. embed 단계와 같은 규칙으로 "시도 > 0, 성공 0"이면 매칭 저장을 마친 뒤 던진다 → Task 3 테스트.
4. **빈 `paperIds`/`pairs`로 쿼리** — 관심사 상위가 전부 floor 아래면 `inArray(…, [])`, `or()`가 빈 채로 나간다 → Task 1에서 빈 입력은 DB를 부르지 않고 바로 반환, 테스트로 고정.
5. **한 논문이 관심사 A에서 탈락, B에서 통과** — 탈락 삭제(`interestId`가 A인 행만)가 B로 새로 선별된 행을 지우면 안 된다. 삭제는 upsert보다 먼저, `(userId, paperId, interestId)` 세 개가 모두 일치할 때만 → Task 1 DB 테스트 + Task 3 테스트.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/db/src/schema/relevance.ts` (신규) | `relevance_judgments` 테이블 |
| `packages/db/src/schema/index.ts` | 위 export 추가 |
| `packages/db/src/queries/relevance.ts` (신규) | 판정 캐시 조회·저장, 탈락 쌍 후보 삭제 |
| `packages/db/src/queries/index.ts` | 위 export 추가 |
| `packages/db/src/queries/interests.ts` | `listInterestEmbeddings`가 `label`도 돌려준다 |
| `packages/db/src/queries/papers.ts` | `matchPapersForInterest`가 `title`, `abstract`도 돌려준다 |
| `packages/db/migrations/0006_*.sql` (생성) | 마이그레이션 |
| `packages/db/src/queries/queries.test.ts` | 새 쿼리 DB 테스트 |
| `services/collector/prompts/relevance.md` (신규) | 판정 프롬프트 |
| `services/collector/src/relevance.ts` (신규) | `judgeRelevance`, `createRelevanceLlm`, `RELEVANCE_MODEL` |
| `services/collector/src/relevance.test.ts` (신규) | 판정 단위 테스트 |
| `services/collector/src/index.ts` | `match()`에 판정 단계 |
| `services/collector/src/index.test.ts` | match 테스트 |
| `services/collector/src/live.test.ts` | 옵트인 실호출 2건 |
| `services/collector/package.json` | `@anthropic-ai/sdk` 의존성 |
| `packages/core/src/constants.ts`, `services/collector/src/match.ts` | 주석 수정 |
| `.env.example`, `README.md` | collector가 `ANTHROPIC_API_KEY`를 쓴다 |
| `HISTORY.md` | 실제 실행 기록 |

---

### Task 1: DB — `relevance_judgments` 테이블, 쿼리 3개, 매칭 입력 넓히기

**Files:**
- Create: `packages/db/src/schema/relevance.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/queries/relevance.ts`
- Modify: `packages/db/src/queries/index.ts`
- Modify: `packages/db/src/queries/interests.ts:162-169`
- Modify: `packages/db/src/queries/papers.ts:138-150`
- Generate: `packages/db/migrations/0006_*.sql` + `meta/`
- Test: `packages/db/src/queries/queries.test.ts`

**Interfaces:**
- Produces:
  - `type NewRelevanceJudgment = { interestId: string; paperId: string; relevant: boolean; reason: string; model: string; judgedAt?: Date }` (`typeof relevanceJudgments.$inferInsert`)
  - `listRelevanceJudgments(interestId: string, paperIds: string[]): Promise<Map<string, boolean>>`
  - `saveRelevanceJudgments(rows: NewRelevanceJudgment[]): Promise<void>`
  - `deleteCandidatesForPairs(userId: string, pairs: { interestId: string; paperId: string }[]): Promise<void>`
  - `listInterestEmbeddings(userId): Promise<{ id: string; label: string; embedding: number[] | null }[]>`
  - `matchPapersForInterest(embedding, since, limit): Promise<{ paperId: string; relevance: number; title: string; abstract: string }[]>`

- [ ] **Step 1: 실패하는 DB 테스트 작성**

`packages/db/src/queries/queries.test.ts`의 `describe.skipIf(!hasDb)(...)` 블록 끝(마지막 `it` 뒤)에 추가한다. 전용 논문 `__test.00006`을 만들어 쓰고 지운다(이 파일의 기존 규칙: 실제 행을 빌리지 않는다).

```ts
  it('관련성 판정을 저장·조회하고, 같은 쌍은 덮어쓴다', async () => {
    const {
      db, papers, listInterests, upsertArxivPapers,
      listRelevanceJudgments, saveRelevanceJudgments,
    } = await import('../index')
    const { eq } = await import('drizzle-orm')
    const arxivId = '__test.00006'
    try {
      await upsertArxivPapers([{
        doi: null, arxivId, title: '관련성 판정 테스트', authors: [{ name: '저자' }],
        abstract: '초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
        source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
        pdfUrl: null, codeUrl: null, openAccess: true,
      }])
      const paper = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
      const [interest] = await listInterests(userId)
      expect(paper).toBeDefined()
      expect(interest).toBeDefined()
      if (!paper || !interest) return

      // 빈 입력은 DB를 부르지 않고 빈 Map
      expect((await listRelevanceJudgments(interest.id, [])).size).toBe(0)
      await saveRelevanceJudgments([])

      await saveRelevanceJudgments([
        { interestId: interest.id, paperId: paper.id, relevant: false, reason: '단어만 겹친다', model: 'm1' },
      ])
      expect((await listRelevanceJudgments(interest.id, [paper.id])).get(paper.id)).toBe(false)

      await saveRelevanceJudgments([
        { interestId: interest.id, paperId: paper.id, relevant: true, reason: '주제가 같다', model: 'm2' },
      ])
      const after = await listRelevanceJudgments(interest.id, [paper.id])
      expect(after.size).toBe(1)
      expect(after.get(paper.id)).toBe(true)
    } finally {
      // relevance_judgments는 papers에 on delete cascade라 논문만 지우면 같이 지워진다
      await db.delete(papers).where(eq(papers.arxivId, arxivId))
    }
  })

  it('탈락 쌍의 후보는 (사용자, 논문, 관심사)가 모두 일치할 때만 지운다', async () => {
    const {
      db, papers, paperCandidates, listInterests, upsertArxivPapers, upsertCandidates,
      deleteCandidatesForPairs,
    } = await import('../index')
    const { and, eq } = await import('drizzle-orm')
    const arxivA = '__test.00007'
    const arxivB = '__test.00008'
    const base = {
      doi: null, authors: [{ name: '저자' }], abstract: '초록',
      publishedAt: new Date('2026-09-20T00:00:00Z'), source: 'arxiv' as const,
      venue: { name: 'arXiv', kind: 'preprint' as const }, pdfUrl: null, codeUrl: null, openAccess: true,
    }
    try {
      await upsertArxivPapers([
        { ...base, arxivId: arxivA, title: '삭제 대상' },
        { ...base, arxivId: arxivB, title: '다른 관심사로 걸린 논문' },
      ])
      const pa = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivA) })
      const pb = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivB) })
      const [i1, i2] = await listInterests(userId)
      if (!pa || !pb || !i1 || !i2) throw new Error('시드 관심사가 2개 이상 있어야 한다')

      await upsertCandidates([
        { userId, paperId: pa.id, interestId: i1.id, relevance: 0.5, collectedFor: '2026-10-01' },
        { userId, paperId: pb.id, interestId: i2.id, relevance: 0.5, collectedFor: '2026-10-01' },
      ])

      await deleteCandidatesForPairs(userId, []) // 빈 입력은 아무것도 지우지 않는다
      // pb는 i1 쌍으로 탈락했지만 후보 행은 i2로 걸려 있다 — 지우면 안 된다
      await deleteCandidatesForPairs(userId, [
        { interestId: i1.id, paperId: pa.id },
        { interestId: i1.id, paperId: pb.id },
      ])

      const rows = await db.query.paperCandidates.findMany({ where: eq(paperCandidates.userId, userId) })
      const ids = rows.map((r) => r.paperId)
      expect(ids).not.toContain(pa.id)
      expect(ids).toContain(pb.id)
    } finally {
      for (const arxivId of [arxivA, arxivB]) {
        const p = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
        if (p) {
          await db
            .delete(paperCandidates)
            .where(and(eq(paperCandidates.userId, userId), eq(paperCandidates.paperId, p.id)))
        }
        await db.delete(papers).where(eq(papers.arxivId, arxivId))
      }
    }
  })

  it('매칭 입력이 판정에 필요한 라벨·제목·초록을 함께 준다', async () => {
    const {
      db, papers, listInterestEmbeddings, upsertArxivPapers, setPaperEmbedding, matchPapersForInterest,
    } = await import('../index')
    const { EMBEDDING_DIM } = await import('@jogan/core')
    const { eq } = await import('drizzle-orm')
    const arxivId = '__test.00009'
    try {
      const owned = await listInterestEmbeddings(userId)
      expect(owned.length).toBeGreaterThan(0)
      expect(typeof owned[0]?.label).toBe('string')

      await upsertArxivPapers([{
        doi: null, arxivId, title: '매칭 입력 테스트', authors: [{ name: '저자' }],
        abstract: '매칭 초록', publishedAt: new Date('2026-09-20T00:00:00Z'),
        source: 'arxiv' as const, venue: { name: 'arXiv', kind: 'preprint' as const },
        pdfUrl: null, codeUrl: null, openAccess: true,
      }])
      const paper = await db.query.papers.findFirst({ where: eq(papers.arxivId, arxivId) })
      if (!paper) throw new Error('테스트 논문 생성 실패')
      const vec = Array.from({ length: EMBEDDING_DIM }, (_, i) => (i === 0 ? 1 : 0))
      await setPaperEmbedding(paper.id, vec)

      const found = (await matchPapersForInterest(vec, new Date('2026-09-19T00:00:00Z'), 5))
        .find((m) => m.paperId === paper.id)
      expect(found?.title).toBe('매칭 입력 테스트')
      expect(found?.abstract).toBe('매칭 초록')
    } finally {
      await db.delete(papers).where(eq(papers.arxivId, arxivId))
    }
  })
```

- [ ] **Step 2: 실패 확인**

Run: `docker start jogan-db; pnpm --filter @jogan/db test`
Expected: FAIL — `listRelevanceJudgments is not a function` 등, 그리고 `found?.title`이 `undefined`

- [ ] **Step 3: 스키마 작성**

`packages/db/src/schema/relevance.ts`:

```ts
import { boolean, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { interests } from './interests'
import { papers } from './papers'

/**
 * collector의 관련성 판정 캐시 (ADR 0001). (관심사, 논문)당 한 행.
 * 매칭은 매일 지난 COLLECT_WINDOW_DAYS를 다시 훑으므로, 캐시가 없으면 같은 쌍을 최대 14번 묻는다.
 * 판정 실패(보류)는 여기에 남기지 않는다 — 다음 실행이 다시 묻는다.
 */
export const relevanceJudgments = pgTable(
  'relevance_judgments',
  {
    interestId: uuid('interest_id').notNull().references(() => interests.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => papers.id, { onDelete: 'cascade' }),
    relevant: boolean('relevant').notNull(),
    /** 탈락 사례를 HISTORY.md에 적을 때 쓰는 관측 자료 */
    reason: text('reason').notNull(),
    /** 판정한 모델 id — 모델을 바꾸면 어느 판정이 옛 모델 것인지 가려낼 수 있게 */
    model: text('model').notNull(),
    judgedAt: timestamp('judged_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.interestId, t.paperId] })],
)
```

`packages/db/src/schema/index.ts` 끝에 추가:

```ts
export * from './relevance'
```

- [ ] **Step 4: 쿼리 작성**

`packages/db/src/queries/relevance.ts`:

```ts
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { paperCandidates, relevanceJudgments } from '../schema'

export type NewRelevanceJudgment = typeof relevanceJudgments.$inferInsert

/** 이 관심사에 대해 이미 판정한 논문들. 키가 없으면 아직 판정하지 않은(또는 보류된) 쌍이다 */
export async function listRelevanceJudgments(
  interestId: string,
  paperIds: string[],
): Promise<Map<string, boolean>> {
  if (paperIds.length === 0) return new Map()
  const rows = await db
    .select({ paperId: relevanceJudgments.paperId, relevant: relevanceJudgments.relevant })
    .from(relevanceJudgments)
    .where(and(eq(relevanceJudgments.interestId, interestId), inArray(relevanceJudgments.paperId, paperIds)))
  return new Map(rows.map((r) => [r.paperId, r.relevant]))
}

/** 같은 쌍을 다시 판정하면 덮어쓴다 */
export async function saveRelevanceJudgments(rows: NewRelevanceJudgment[]): Promise<void> {
  if (rows.length === 0) return
  await db
    .insert(relevanceJudgments)
    .values(rows)
    .onConflictDoUpdate({
      target: [relevanceJudgments.interestId, relevanceJudgments.paperId],
      set: {
        relevant: sql`excluded.relevant`,
        reason: sql`excluded.reason`,
        model: sql`excluded.model`,
        judgedAt: sql`now()`,
      },
    })
}

/**
 * 탈락한 (관심사, 논문) 쌍에 해당하는 기존 후보 행을 지운다.
 * 세 개(userId, paperId, interestId)가 모두 맞을 때만 지운다 — 같은 논문이 다른 관심사로
 * 걸린 행은 그 관심사에서는 통과한 것이므로 남긴다.
 */
export async function deleteCandidatesForPairs(
  userId: string,
  pairs: { interestId: string; paperId: string }[],
): Promise<void> {
  if (pairs.length === 0) return
  await db
    .delete(paperCandidates)
    .where(
      and(
        eq(paperCandidates.userId, userId),
        or(
          ...pairs.map((p) =>
            and(eq(paperCandidates.interestId, p.interestId), eq(paperCandidates.paperId, p.paperId)),
          ),
        ),
      ),
    )
}
```

`packages/db/src/queries/index.ts` 끝에 추가:

```ts
export * from './relevance'
```

- [ ] **Step 5: 매칭 입력 넓히기**

`packages/db/src/queries/interests.ts`의 `listInterestEmbeddings`를 다음으로 바꾼다:

```ts
export async function listInterestEmbeddings(
  userId: string,
): Promise<{ id: string; label: string; embedding: number[] | null }[]> {
  return db
    .select({ id: interests.id, label: interests.label, embedding: interests.embedding })
    .from(interests)
    .where(eq(interests.userId, userId))
}
```

`packages/db/src/queries/papers.ts`의 `matchPapersForInterest`를 다음으로 바꾼다:

```ts
export async function matchPapersForInterest(
  embedding: number[],
  since: Date,
  limit: number,
): Promise<{ paperId: string; relevance: number; title: string; abstract: string }[]> {
  const relevance = sql<number>`1 - (${cosineDistance(papers.embedding, embedding)})`
  return db
    .select({ paperId: papers.id, relevance, title: papers.title, abstract: papers.abstract })
    .from(papers)
    .where(and(isNull(papers.mergedInto), gte(papers.publishedAt, since), sql`${papers.embedding} is not null`))
    .orderBy(desc(relevance))
    .limit(limit)
}
```

- [ ] **Step 6: 마이그레이션 생성·적용**

Run: `pnpm db:generate && pnpm db:migrate`
Expected: `packages/db/migrations/0006_<이름>.sql`이 생기고 내용에 `CREATE TABLE "relevance_judgments"`, 두 FK가 `ON DELETE cascade`, PK `relevance_judgments_interest_id_paper_id_pk`. 적용 성공.

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm --filter @jogan/db test && pnpm typecheck`
Expected: db 테스트 전부 PASS, typecheck 전 패키지 통과. (반환 타입에 필드가 늘었을 뿐이라 collector의 옛 `MatchDeps` 타입에도 그대로 대입된다.)

- [ ] **Step 8: 커밋**

```bash
git add packages/db/src/schema/relevance.ts packages/db/src/schema/index.ts \
  packages/db/src/queries/relevance.ts packages/db/src/queries/index.ts \
  packages/db/src/queries/interests.ts packages/db/src/queries/papers.ts \
  packages/db/src/queries/queries.test.ts packages/db/migrations
git commit -m "db: relevance_judgments 테이블과 판정 캐시·탈락 후보 삭제 쿼리, 매칭 입력에 라벨·제목·초록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: collector — `judgeRelevance`와 프롬프트

**Files:**
- Create: `services/collector/prompts/relevance.md`
- Create: `services/collector/src/relevance.ts`
- Test: `services/collector/src/relevance.test.ts`
- Modify: `services/collector/package.json` (의존성)

**Interfaces:**
- Produces (from `services/collector/src/relevance.ts`):
  - `type LlmFn = (prompt: string, input: string) => Promise<string>`
  - `type Judgment = { relevant: boolean; reason: string }`
  - `const RELEVANCE_MODEL = 'claude-haiku-4-5-20251001'`
  - `loadRelevancePrompt(): string`
  - `judgeRelevance(llm: LlmFn, interestLabel: string, paper: { title: string; abstract: string }): Promise<Judgment | null>`
  - `type LlmUsage = { calls: number; input: number; output: number }`
  - `createRelevanceLlm(apiKey: string, usage: LlmUsage, onTruncated?: () => void): LlmFn`

- [ ] **Step 1: 의존성 추가**

Run: `pnpm --filter @jogan/collector add @anthropic-ai/sdk@^0.68.0`
Expected: `services/collector/package.json` dependencies에 `"@anthropic-ai/sdk": "^0.68.0"`. (evaluator와 같은 버전 범위.)

- [ ] **Step 2: 실패하는 테스트 작성**

`services/collector/src/relevance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { judgeRelevance, loadRelevancePrompt } from './relevance'

const paper = { title: 'Sleep spindles and memory', abstract: 'We record sleep spindles in 40 adults.' }

describe('loadRelevancePrompt', () => {
  it('프롬프트를 파일에서 읽는다 (코드에 인라인하지 않는다)', () => {
    const p = loadRelevancePrompt()
    expect(p).toContain('relevant')
    expect(p.length).toBeGreaterThan(200)
  })
})

describe('judgeRelevance', () => {
  it('정상 JSON을 판정으로 돌려준다', async () => {
    const llm = async () => '{"relevant": true, "reason": "수면 중 기억 공고화를 직접 다룬다"}'
    expect(await judgeRelevance(llm, '수면과 기억 공고화', paper)).toEqual({
      relevant: true,
      reason: '수면 중 기억 공고화를 직접 다룬다',
    })
  })

  it('코드블록으로 감싼 JSON도 벗겨서 읽는다', async () => {
    const llm = async () => '```json\n{"relevant": false, "reason": "단어만 겹친다"}\n```'
    expect(await judgeRelevance(llm, '수면과 기억 공고화', paper)).toEqual({ relevant: false, reason: '단어만 겹친다' })
  })

  it('필드가 빠지면 null이다', async () => {
    expect(await judgeRelevance(async () => '{"relevant": true}', 'x', paper)).toBeNull()
  })

  it('reason이 빈 문자열이면 null이다', async () => {
    expect(await judgeRelevance(async () => '{"relevant": true, "reason": ""}', 'x', paper)).toBeNull()
  })

  it('JSON이 아니면 null이다', async () => {
    expect(await judgeRelevance(async () => '관련 있어 보입니다', 'x', paper)).toBeNull()
  })

  it('llm이 던지면 null이다 (호출자가 보류로 처리한다)', async () => {
    const llm = async (): Promise<string> => {
      throw new Error('529 overloaded')
    }
    expect(await judgeRelevance(llm, 'x', paper)).toBeNull()
  })

  it('입력에 관심사 라벨·제목·초록이 모두 들어가고, 프롬프트는 파일 내용이다', async () => {
    let seenPrompt = ''
    let seenInput = ''
    const llm = async (prompt: string, input: string) => {
      seenPrompt = prompt
      seenInput = input
      return '{"relevant": true, "reason": "r"}'
    }
    await judgeRelevance(llm, '수면과 기억 공고화', paper)
    expect(seenPrompt).toBe(loadRelevancePrompt())
    expect(seenInput).toContain('수면과 기억 공고화')
    expect(seenInput).toContain(paper.title)
    expect(seenInput).toContain(paper.abstract)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @jogan/collector exec vitest run src/relevance.test.ts`
Expected: FAIL — `Cannot find module './relevance'`

- [ ] **Step 4: 프롬프트 작성**

`services/collector/prompts/relevance.md`:

```markdown
너는 연구자의 관심사와 논문이 맞는지 가려내는 사서다.

연구자가 적은 관심사 하나와 논문의 제목·초록이 주어진다. 이 논문이 **그 관심사의 연구 주제 자체**를 다루는지 판정하라.

## 기준

- 관심사의 연구 주제를 직접 다루면 관련 있음.
- **단어만 겹치면 관련 없음.** 예: 관심사가 "수면과 기억 공고화"(사람·동물의 수면 중 기억 형성)인데 논문이 LLM 에이전트의 메모리 모듈을 다룬다면, "기억"이라는 말만 같고 연구 주제는 다르다.
- 방법론만 비슷한 경우도 관련 없음. 예: 관심사가 "인과추론"인데 논문이 인과 개념 없이 같은 통계 도구를 쓸 뿐이라면 관련 없음.
- 인접 분야라도, 그 관심사를 가진 연구자가 이 논문을 읽을 이유가 분명하면 관련 있음.
- 관심사 라벨이 짧거나 약어면(예: `stt`) 그 분야에서 통상 쓰이는 의미로 해석한다(`stt` → 음성 인식).
- 논문의 품질이나 신뢰도는 판단하지 마라. 그건 다른 단계가 한다.

## 출력

JSON만 출력한다. 다른 말을 덧붙이지 마라. `reason`은 한국어 한 문장.

{"relevant": true 또는 false, "reason": "한 문장"}
```

- [ ] **Step 5: 구현**

`services/collector/src/relevance.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export type LlmFn = (prompt: string, input: string) => Promise<string>
export type Judgment = { relevant: boolean; reason: string }
export type LlmUsage = { calls: number; input: number; output: number }

/** 예/아니오 판정이라 가장 싼 모델로 충분하다. relevance_judgments.model에 그대로 저장된다 */
export const RELEVANCE_MODEL = 'claude-haiku-4-5-20251001'

const PROMPT_PATH = join(import.meta.dirname, '..', 'prompts', 'relevance.md')

/** 프롬프트는 파일로 둔다 (CLAUDE.md). 변경이 diff로 보여야 한다 */
export function loadRelevancePrompt(): string {
  return readFileSync(PROMPT_PATH, 'utf8')
}

const Out = z.object({ relevant: z.boolean(), reason: z.string().min(1) })

/** LLM이 코드블록으로 감싸는 일이 흔하다 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  try {
    return JSON.parse((fenced?.[1] ?? raw).trim())
  } catch {
    return null
  }
}

/**
 * 논문이 관심사의 연구 주제 자체를 다루는지 판정한다 (ADR 0001).
 * 응답을 못 읽거나 호출이 던지면 null — 호출자는 이 쌍을 **보류**한다(후보에도 캐시에도 넣지 않는다).
 */
export async function judgeRelevance(
  llm: LlmFn,
  interestLabel: string,
  paper: { title: string; abstract: string },
): Promise<Judgment | null> {
  let raw: string
  try {
    raw = await llm(loadRelevancePrompt(), `관심사: ${interestLabel}\n\n# ${paper.title}\n\n${paper.abstract}`)
  } catch {
    return null
  }
  const parsed = Out.safeParse(extractJson(raw))
  return parsed.success ? parsed.data : null
}

/**
 * 실제 Anthropic 호출. 재시도는 SDK(maxRetries 2)에 맡기고 순차로만 부른다.
 * 토큰 누계는 `usage`에 더한다 — 비용을 HISTORY.md에 남기기 위해서다.
 */
export function createRelevanceLlm(apiKey: string, usage: LlmUsage, onTruncated?: () => void): LlmFn {
  const client = new Anthropic({ apiKey, maxRetries: 2 })
  return async (system, input) => {
    const res = await client.messages.create({
      model: RELEVANCE_MODEL,
      max_tokens: 256,
      system,
      messages: [{ role: 'user', content: input }],
    })
    usage.calls++
    usage.input += res.usage.input_tokens
    usage.output += res.usage.output_tokens
    if (res.stop_reason === 'max_tokens') onTruncated?.()
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  }
}
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm --filter @jogan/collector exec vitest run src/relevance.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 7: 커밋**

```bash
git add services/collector/prompts/relevance.md services/collector/src/relevance.ts \
  services/collector/src/relevance.test.ts services/collector/package.json pnpm-lock.yaml
git commit -m "collector: 관련성 판정 함수와 프롬프트 (Haiku 예/아니오)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: collector — `match()`에 판정 단계 연결

**Files:**
- Modify: `services/collector/src/index.ts` (`MatchDeps`, `match()`, import, 모듈 상단 usage)
- Test: `services/collector/src/index.test.ts` (기존 match 테스트 5개 수정 + 새 테스트)

**Interfaces:**
- Consumes: Task 1의 `NewRelevanceJudgment`, `listRelevanceJudgments`, `saveRelevanceJudgments`, `deleteCandidatesForPairs`, 넓어진 `listInterestEmbeddings`·`matchPapersForInterest`. Task 2의 `judgeRelevance`, `createRelevanceLlm`, `RELEVANCE_MODEL`, `Judgment`, `LlmUsage`.
- Produces:
  ```ts
  export type PaperMatch = { paperId: string; relevance: number; title: string; abstract: string }
  export type MatchDeps = {
    listUserIds?: () => Promise<string[]>
    listInterests?: (userId: string) => Promise<{ id: string; label: string; embedding: number[] | null }[]>
    matchPapers?: (embedding: number[], since: Date, limit: number) => Promise<PaperMatch[]>
    upsertCandidates?: (rows: CandidateRow[]) => Promise<void>
    collectedFor?: string
    judge?: (label: string, paper: { title: string; abstract: string }) => Promise<Judgment | null>
    loadJudgments?: (interestId: string, paperIds: string[]) => Promise<Map<string, boolean>>
    saveJudgments?: (rows: NewRelevanceJudgment[]) => Promise<void>
    deleteCandidates?: (userId: string, pairs: { interestId: string; paperId: string }[]) => Promise<void>
  }
  ```
  `match(deps): Promise<number>` — 반환값(선별된 후보 수)의 의미는 그대로.

- [ ] **Step 1: 기존 match 테스트가 판정 의존성을 주입하게 고친다**

`services/collector/src/index.test.ts`에서 `const interestVec = vec(EMBEDDING_DIM, 0.5)` 바로 아래에 헬퍼를 추가한다:

```ts
/** 매칭 결과 한 줄. 판정에 쓰이는 제목·초록을 함께 준다 */
const pm = (paperId: string, relevance: number) => ({ paperId, relevance, title: `T ${paperId}`, abstract: `A ${paperId}` })

/**
 * 관련성 판정 의존성 전부. **빠뜨리면 기본 구현이 DB와 실제 Anthropic을 부른다** — index.ts가
 * .env를 읽으므로 키가 있는 머신에서는 테스트가 돈을 쓴다. match 테스트는 항상 이걸 펼쳐 넣는다.
 */
function relevanceDeps(over: Partial<MatchDeps> = {}): Partial<MatchDeps> {
  return {
    judge: async () => ({ relevant: true, reason: '테스트' }),
    loadJudgments: async () => new Map(),
    saveJudgments: async () => {},
    deleteCandidates: async () => {},
    ...over,
  }
}
```

파일 상단 import를 `import { collect, embed, match, type InterestListRow, type MatchDeps, type PaperListRow } from './index'`로 바꾼다.

`describe('match — 사용자 단위 격리', ...)` 안의 기존 테스트 5개를 다음 규칙으로 고친다:
- 모든 `match({ ... })` 호출 객체 첫 줄에 `...relevanceDeps(),`를 넣는다.
- `listInterests`가 돌려주는 객체마다 `label: '라벨'`을 넣는다. 예: `[{ id: \`${userId}-i1\`, label: '라벨', embedding: interestVec }]`, `{ id: 'i-null', label: '라벨', embedding: null }`.
- `matchPapers`가 돌려주는 `{ paperId: 'x', relevance: n }`를 모두 `pm('x', n)`로 바꾼다.

- [ ] **Step 2: 새 테스트 작성**

같은 파일 끝에 추가한다:

```ts
describe('match — 관련성 판정', () => {
  const base = (over: Partial<MatchDeps>): MatchDeps => ({
    collectedFor: '2026-10-01',
    listUserIds: async () => ['u1'],
    listInterests: async () => [{ id: 'i1', label: '수면과 기억 공고화', embedding: interestVec }],
    matchPapers: async () => [pm('p1', 0.9)],
    upsertCandidates: async () => {},
    ...relevanceDeps(),
    ...over,
  })

  it('탈락한 쌍은 후보가 되지 않고, 판정은 캐시에 저장된다', async () => {
    const upserted: CandidateRow[] = []
    const saved: { paperId: string; relevant: boolean; model: string }[] = []
    await match(base({
      matchPapers: async () => [pm('keep', 0.9), pm('drop', 0.8)],
      judge: async (_label, paper) => ({ relevant: paper.title === 'T keep', reason: 'r' }),
      saveJudgments: async (rows) => { saved.push(...rows) },
      upsertCandidates: async (rows) => { upserted.push(...rows) },
    }))
    expect(upserted.map((r) => r.paperId)).toEqual(['keep'])
    expect(saved.map((s) => [s.paperId, s.relevant])).toEqual([['keep', true], ['drop', false]])
    expect(saved.every((s) => s.model === 'claude-haiku-4-5-20251001')).toBe(true)
  })

  it('한 관심사에서 탈락한 논문이 다른 관심사에서 통과하면 그 관심사로 선별된다', async () => {
    const upserted: CandidateRow[] = []
    await match(base({
      listInterests: async () => [
        { id: 'sleep', label: '수면', embedding: interestVec },
        { id: 'agent', label: '에이전트 메모리', embedding: interestVec },
      ],
      // sleep 쪽 relevance가 더 높지만 sleep에서는 탈락한다
      matchPapers: async () => [pm('p1', 0.9)],
      judge: async (label) => ({ relevant: label === '에이전트 메모리', reason: 'r' }),
      upsertCandidates: async (rows) => { upserted.push(...rows) },
    }))
    expect(upserted).toHaveLength(1)
    expect(upserted[0]?.interestId).toBe('agent')
  })

  it('캐시에 있으면 judge를 부르지 않는다', async () => {
    let calls = 0
    const upserted: CandidateRow[] = []
    await match(base({
      matchPapers: async () => [pm('cached-yes', 0.9), pm('new', 0.8)],
      loadJudgments: async () => new Map([['cached-yes', true]]),
      judge: async () => { calls++; return { relevant: true, reason: 'r' } },
      upsertCandidates: async (rows) => { upserted.push(...rows) },
    }))
    expect(calls).toBe(1)
    expect(upserted.map((r) => r.paperId).sort()).toEqual(['cached-yes', 'new'])
  })

  it('판정 실패는 보류 — 후보도 아니고 캐시에도 들어가지 않으며 로그를 남긴다', async () => {
    const upserted: CandidateRow[] = []
    const saved: string[] = []
    const { logs, restore } = captureLogs()
    try {
      await match(base({
        matchPapers: async () => [pm('ok', 0.9), pm('fail', 0.8)],
        judge: async (_l, paper) => (paper.title === 'T fail' ? null : { relevant: true, reason: 'r' }),
        saveJudgments: async (rows) => { saved.push(...rows.map((r) => r.paperId)) },
        upsertCandidates: async (rows) => { upserted.push(...rows) },
      }))
    } finally {
      restore()
    }
    expect(upserted.map((r) => r.paperId)).toEqual(['ok'])
    expect(saved).toEqual(['ok'])
    expect(logs.some((m) => m.includes('판정 실패로 보류 i1/fail'))).toBe(true)
  })

  it('새로 탈락한 쌍과 캐시된 탈락 쌍 모두 deleteCandidates로 넘어가고, 삭제가 upsert보다 먼저다', async () => {
    const order: string[] = []
    let deleted: { interestId: string; paperId: string }[] = []
    await match(base({
      matchPapers: async () => [pm('old-drop', 0.9), pm('new-drop', 0.8), pm('keep', 0.7)],
      loadJudgments: async () => new Map([['old-drop', false]]),
      judge: async (_l, paper) => ({ relevant: paper.title === 'T keep', reason: 'r' }),
      deleteCandidates: async (_u, pairs) => { order.push('delete'); deleted = pairs },
      upsertCandidates: async () => { order.push('upsert') },
    }))
    expect(deleted).toEqual([
      { interestId: 'i1', paperId: 'old-drop' },
      { interestId: 'i1', paperId: 'new-drop' },
    ])
    expect(order).toEqual(['delete', 'upsert'])
  })

  it('floor 아래 쌍은 judge를 부르지 않는다', async () => {
    const judged: string[] = []
    await match(base({
      matchPapers: async () => [pm('high', 0.9), pm('low', RELEVANCE_FLOOR - 0.01)],
      judge: async (_l, paper) => { judged.push(paper.title); return { relevant: true, reason: 'r' } },
    }))
    expect(judged).toEqual(['T high'])
  })

  it('judge를 주입하지 않았는데 ANTHROPIC_API_KEY가 없으면 사용자 루프 전에 던진다', async () => {
    const saved = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    let listed = false
    try {
      await expect(
        match({
          ...base({}),
          judge: undefined,
          listUserIds: async () => { listed = true; return ['u1'] },
        }),
      ).rejects.toThrow('ANTHROPIC_API_KEY')
      expect(listed).toBe(false)
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
    }
  })

  it('판정을 시도했는데 전부 실패하면, 저장을 마친 뒤 던진다 (조용히 0편으로 끝내지 않는다)', async () => {
    const upserted: CandidateRow[] = []
    await expect(
      match(base({
        matchPapers: async () => [pm('cached', 0.9), pm('a', 0.8)],
        loadJudgments: async () => new Map([['cached', true]]),
        judge: async () => null,
        upsertCandidates: async (rows) => { upserted.push(...rows) },
      })),
    ).rejects.toThrow('관련성 판정이 전량 실패')
    // 캐시로 통과한 후보는 이미 저장됐다
    expect(upserted.map((r) => r.paperId)).toEqual(['cached'])
  })

  it('관심사마다 판정·통과·탈락·보류·캐시 수를 로그로 남긴다', async () => {
    const { logs, restore } = captureLogs()
    try {
      await match(base({
        matchPapers: async () => [pm('c', 0.9), pm('y', 0.8), pm('n', 0.7), pm('f', 0.6)],
        loadJudgments: async () => new Map([['c', true]]),
        judge: async (_l, paper) =>
          paper.title === 'T f' ? null : { relevant: paper.title === 'T y', reason: 'r' },
      }))
    } finally {
      restore()
    }
    expect(logs.some((m) => m.includes('판정 3 · 통과 2 · 탈락 1 · 보류 1 · 캐시 1'))).toBe(true)
  })
})
```

`captureLogs`는 이 파일에 이미 있다(기존 match 테스트가 쓴다). `judge: undefined`는 `tsconfig.base.json`에 `exactOptionalPropertyTypes`가 없어 타입상 허용된다.

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @jogan/collector exec vitest run src/index.test.ts`
Expected: 새 테스트 FAIL(판정이 없어 'drop'도 후보가 됨 등). 기존 테스트도 타입이 안 맞을 수 있으나 vitest는 타입을 검사하지 않으므로 런타임 결과로 판단한다.

- [ ] **Step 4: `match()` 구현**

`services/collector/src/index.ts`:

import 추가(기존 import 묶음 아래):

```ts
import type { CandidateRow, NewPaper, NewRelevanceJudgment } from '@jogan/db'
import { createRelevanceLlm, judgeRelevance, RELEVANCE_MODEL, type Judgment, type LlmUsage } from './relevance'
```
(기존 `import type { CandidateRow, NewPaper } from '@jogan/db'` 줄을 위 첫 줄로 바꾼다.)

`log` 정의 아래에 추가:

```ts
/** 관련성 판정 LLM 누계. 비용을 HISTORY.md에 남기기 위해 match 끝에 한 번 찍는다 */
const relevanceUsage: LlmUsage = { calls: 0, input: 0, output: 0 }
```

기존 `export type MatchDeps = {...}`와 `match()` 전체를 다음으로 바꾼다:

```ts
export type PaperMatch = { paperId: string; relevance: number; title: string; abstract: string }

export type MatchDeps = {
  listUserIds?: () => Promise<string[]>
  listInterests?: (userId: string) => Promise<{ id: string; label: string; embedding: number[] | null }[]>
  matchPapers?: (embedding: number[], since: Date, limit: number) => Promise<PaperMatch[]>
  upsertCandidates?: (rows: CandidateRow[]) => Promise<void>
  /** KST 기준 수집일. 주입하지 않으면 `@jogan/db`의 todayInSeoul() */
  collectedFor?: string
  /** 관련성 판정. 주입하지 않으면 Haiku를 부른다(ANTHROPIC_API_KEY 필요) */
  judge?: (label: string, paper: { title: string; abstract: string }) => Promise<Judgment | null>
  loadJudgments?: (interestId: string, paperIds: string[]) => Promise<Map<string, boolean>>
  saveJudgments?: (rows: NewRelevanceJudgment[]) => Promise<void>
  deleteCandidates?: (userId: string, pairs: { interestId: string; paperId: string }[]) => Promise<void>
}

/**
 * ④ 관련성 매칭 + 판정 (ADR 0001).
 * 임베딩 순위로 관심사별 상위 CANDIDATES_PER_INTEREST편(RELEVANCE_FLOOR 이상)을 뽑고, 각 쌍을
 * LLM이 "이 관심사의 연구 주제인가"로 판정한다. 통과한 것만 selectBestPerPaper로 넘긴다.
 * 빈 자리는 채우지 않는다 — 관련 논문이 없는 날 그 관심사는 0편이다.
 *
 * 사용자 한 명의 실패가 나머지 사용자까지 죽이지 않도록 사용자 단위로 격리한다
 * (CLAUDE.md: 파이프라인 전체를 죽이지 않는다). 예외는 `EmbeddingDimensionError`다.
 */
export async function match(deps: MatchDeps = {}): Promise<number> {
  // 판정 없이 통과시키는 경로는 없다 — 키가 없으면 아무것도 하기 전에 멈춘다
  let judge = deps.judge
  if (!judge) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY가 없다. 관련성 판정(④)에 필요하다. .env에 넣고 다시 실행하면 ' +
          '수집·임베딩 결과는 DB에 남아 있으니 매칭부터 이어서 진행한다.',
      )
    }
    const llm = createRelevanceLlm(apiKey, relevanceUsage, () => log('relevance', 'max_tokens에서 잘렸다'))
    judge = (label, paper) => judgeRelevance(llm, label, paper)
  }

  const listUserIds = deps.listUserIds ?? (async () => (await loadDb()).listUserIds())
  const listInterests =
    deps.listInterests ?? (async (userId: string) => (await loadDb()).listInterestEmbeddings(userId))
  const matchPapers =
    deps.matchPapers ??
    (async (embedding: number[], since: Date, limit: number) =>
      (await loadDb()).matchPapersForInterest(embedding, since, limit))
  const upsert = deps.upsertCandidates ?? (async (rows: CandidateRow[]) => (await loadDb()).upsertCandidates(rows))
  const loadJudgments =
    deps.loadJudgments ??
    (async (interestId: string, paperIds: string[]) => (await loadDb()).listRelevanceJudgments(interestId, paperIds))
  const saveJudgments =
    deps.saveJudgments ?? (async (rows: NewRelevanceJudgment[]) => (await loadDb()).saveRelevanceJudgments(rows))
  const deleteCandidates =
    deps.deleteCandidates ??
    (async (userId: string, pairs: { interestId: string; paperId: string }[]) =>
      (await loadDb()).deleteCandidatesForPairs(userId, pairs))
  const collectedFor = deps.collectedFor ?? (await loadDb()).todayInSeoul()

  const since = new Date(Date.now() - COLLECT_WINDOW_DAYS * DAY_MS)
  const userIds = await listUserIds()
  let total = 0
  let failedUsers = 0
  /** 새로 LLM에 물은 수와 그중 답을 받은 수 — 전량 실패를 가려내는 데 쓴다 */
  let attempted = 0
  let answered = 0

  for (const userId of userIds) {
    try {
      const owned = await listInterests(userId)

      const groups: InterestMatches[] = []
      const rejected: { interestId: string; paperId: string }[] = []
      for (const it of owned) {
        if (!it.embedding) {
          log('match', `관심사 ${it.id}는 아직 임베딩이 없어 건너뜀`)
          continue
        }
        // floor·관심사별 상한은 판정 전에 적용한다 — floor 아래 쌍에 LLM을 쓰지 않는다
        const top = (await matchPapers(it.embedding, since, CANDIDATES_PER_INTEREST))
          .filter((m) => m.relevance >= RELEVANCE_FLOOR)
          .slice(0, CANDIDATES_PER_INTEREST)
        const cached = await loadJudgments(it.id, top.map((m) => m.paperId))

        const passed: { paperId: string; relevance: number }[] = []
        const fresh: NewRelevanceJudgment[] = []
        const n = { judged: 0, pass: 0, reject: 0, held: 0, cached: 0 }
        for (const m of top) {
          let relevant = cached.get(m.paperId)
          if (relevant === undefined) {
            n.judged++
            attempted++
            const j = await judge(it.label, m)
            if (j === null) {
              n.held++
              log('relevance', `판정 실패로 보류 ${it.id}/${m.paperId}`)
              continue
            }
            answered++
            relevant = j.relevant
            fresh.push({ interestId: it.id, paperId: m.paperId, relevant: j.relevant, reason: j.reason, model: RELEVANCE_MODEL })
          } else {
            n.cached++
          }
          if (relevant) {
            n.pass++
            passed.push({ paperId: m.paperId, relevance: m.relevance })
          } else {
            n.reject++
            rejected.push({ interestId: it.id, paperId: m.paperId })
          }
        }
        // 관심사마다 바로 저장한다 — 뒤에서 실패해도 이미 낸 판정 비용은 다음 실행이 재사용한다
        await saveJudgments(fresh)
        groups.push({ interestId: it.id, matches: passed })
        log(
          'relevance',
          `관심사 ${it.label}: 판정 ${n.judged} · 통과 ${n.pass} · 탈락 ${n.reject} · 보류 ${n.held} · 캐시 ${n.cached}`,
        )
      }

      // 삭제가 upsert보다 먼저다 — 같은 실행에서 다른 관심사로 선별되면 이어지는 upsert가 새 행을 넣는다
      await deleteCandidates(userId, rejected)
      const selected = selectBestPerPaper(groups, RELEVANCE_FLOOR, CANDIDATES_PER_INTEREST, CANDIDATES_PER_USER)
      await upsert(
        selected.map((s) => ({
          userId,
          paperId: s.paperId,
          interestId: s.interestId,
          relevance: s.relevance,
          collectedFor,
        })),
      )
      total += selected.length
      log('match', `사용자 ${userId}: 후보 ${selected.length}편 (탈락 쌍 ${rejected.length}개 정리)`)
    } catch (err) {
      if (err instanceof EmbeddingDimensionError) throw err
      failedUsers++
      log('match', `사용자 ${userId} 처리 실패로 건너뜀: ${String(err)}`)
    }
  }

  if (failedUsers > 0) log('match', `사용자 ${failedUsers}명은 실패로 건너뛰었다 (위 로그 참고)`)
  if (relevanceUsage.calls > 0) {
    log(
      'relevance',
      `LLM ${relevanceUsage.calls}회 · 입력 ${relevanceUsage.input} · 출력 ${relevanceUsage.output} 토큰`,
    )
  }
  // 임베딩 단계와 같은 규칙 — 전량 실패는 항목 문제가 아니라 단계 장애다(키 만료·크레딧 소진).
  // 저장은 이미 끝났으니 캐시로 통과한 후보는 살아 있고, 여기서 던져 exit 1로 알린다.
  if (attempted > 0 && answered === 0) {
    throw new Error(
      `관련성 판정이 전량 실패했다 (${attempted}건 시도, 응답 0건). Anthropic 키/크레딧/네트워크를 확인할 것.`,
    )
  }
  return total
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @jogan/collector test && pnpm typecheck`
Expected: collector 테스트 전부 PASS(기존 + 새 9개), typecheck 전 패키지 통과.

- [ ] **Step 6: 커밋**

```bash
git add services/collector/src/index.ts services/collector/src/index.test.ts
git commit -m "collector: 매칭 후보를 관련성 판정으로 거르고, 탈락 쌍의 기존 후보를 정리한다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 문서·주석 정리와 옵트인 실호출 테스트

**Files:**
- Modify: `packages/core/src/constants.ts:54-61`
- Modify: `services/collector/src/match.ts:9-18`
- Modify: `.env.example`, `README.md` (`.env 채우기` 절)
- Modify: `services/collector/src/live.test.ts`

**Interfaces:**
- Consumes: Task 2의 `judgeRelevance`, `createRelevanceLlm`

- [ ] **Step 1: 옵트인 실호출 테스트 추가**

`services/collector/src/live.test.ts` 상단 import에 추가:

```ts
import { createRelevanceLlm, judgeRelevance } from './relevance'
```

`describe.skipIf(!live)('실호출', () => {` 블록 안 끝에 추가:

```ts
  describe.skipIf(!process.env.ANTHROPIC_API_KEY)('관련성 판정 (Haiku)', () => {
    const usage = { calls: 0, input: 0, output: 0 }
    const llm = () => createRelevanceLlm(String(process.env.ANTHROPIC_API_KEY), usage)

    it('명백히 관련 있는 쌍은 relevant: true', async () => {
      const j = await judgeRelevance(llm(), '인과추론', {
        title: 'Causal Discovery from Observational Data with Latent Confounders',
        abstract:
          'We propose a method to identify causal structure from observational data when latent ' +
          'confounders are present, and prove identifiability under faithfulness assumptions.',
      })
      expect(j?.relevant).toBe(true)
    }, 60_000)

    it('단어만 겹치는 쌍은 relevant: false', async () => {
      const j = await judgeRelevance(llm(), '수면과 기억 공고화', {
        title: 'Long-Term Memory for LLM Agents via Hierarchical Retrieval',
        abstract:
          'We introduce a memory module for large language model agents that stores past interactions ' +
          'and retrieves them hierarchically, improving multi-session task success.',
      })
      expect(j?.relevant).toBe(false)
    }, 60_000)
  })
```

- [ ] **Step 2: 실호출 테스트 실행**

Run: `COLLECTOR_LIVE_TEST=1 pnpm --filter @jogan/collector exec vitest run src/live.test.ts`
Expected: PASS (Haiku 호출 2회). 실패하면 프롬프트(`prompts/relevance.md`)의 기준 문장을 고치고 다시 돌린다 — 코드를 고치지 않는다.

- [ ] **Step 3: 주석 수정 (ADR 0001과 모순 제거)**

`packages/core/src/constants.ts`의 `RELEVANCE_FLOOR` 주석 마지막 두 줄
```
 * 구분할 수 없다. 그래서 이 값은 "그 관심사에 정말 아무것도 없을 때 쓰레기를 막는"
 * 용도로만 남기고, 애매한 것을 걸러내는 일은 초록을 읽는 evaluator가 맡는다.
```
을 다음으로 바꾼다:
```
 * 구분할 수 없다. 그래서 이 값은 "그 관심사에 정말 아무것도 없을 때 쓰레기를 막는"
 * 용도로만 남기고, 애매한 것을 걸러내는 일은 collector의 관련성 판정 단계
 * (`services/collector/src/relevance.ts`, ADR 0001)가 맡는다.
```

`services/collector/src/match.ts` `selectBestPerPaper` 독스트링의
```
 * 상위 `perInterest`편을 가져가게 하고 `floor`는 쓰레기만 막는다. 애매한 것을 걸러내는
 * 일은 초록을 읽는 evaluator가 맡는다 — 이 단계는 재현율을 맡는다.
```
를 다음으로 바꾼다:
```
 * 상위 `perInterest`편을 가져가게 하고 `floor`는 쓰레기만 막는다. 애매한 것을 걸러내는
 * 일은 관련성 판정 단계(`relevance.ts`)가 맡는다 — 이 함수에는 판정을 통과한 매치만 들어온다.
```

- [ ] **Step 4: 환경 변수 문서**

`.env.example`의
```
# 파이프라인 세션부터 사용
ANTHROPIC_API_KEY=
```
를 다음으로 바꾼다:
```
# collector(관련성 판정, Haiku)와 evaluator(신뢰도 평가)가 쓴다.
# 없으면 pipeline:collect가 수집·임베딩까지만 하고 매칭(④)에서 멈춘다.
ANTHROPIC_API_KEY=
```

`README.md`의 `## .env 채우기` 목록에서 `VOYAGE_API_KEY` 줄 바로 아래에 추가:
```
- `ANTHROPIC_API_KEY` — `pnpm pipeline:collect`의 관련성 판정(Haiku)과 `pnpm pipeline:evaluate`의 신뢰도 평가에 쓴다. https://console.anthropic.com 에서 발급.
```

- [ ] **Step 5: 전체 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/constants.ts services/collector/src/match.ts .env.example README.md \
  services/collector/src/live.test.ts
git commit -m "collector: 관련성 판정 실호출 테스트(opt-in), 주석·환경 변수 문서를 ADR 0001에 맞춘다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 실제 실행과 기록

**Files:**
- Modify: `HISTORY.md` (맨 위 `---` 아래에 새 항목)

이 Task는 실제 비용이 든다(Voyage는 새 논문분만, Haiku 최대 약 120회). 실행 전에 사람에게 확인받는다.

- [ ] **Step 1: 실행 전 상태 기록**

Run:
```bash
docker exec jogan-db psql -U jogan -d jogan -c "select i.label, count(*) from paper_candidates c join interests i on i.id=c.interest_id group by i.label order by 1;"
```
Expected: 관심사별 기존 후보 수. 표로 옮겨 적는다(9/29 실행분, `수면과 기억 공고화` 17편 포함).

- [ ] **Step 2: 실행**

Run: `pnpm pipeline:collect`
Expected: `[collector:relevance] 관심사 …: 판정 n · 통과 n · 탈락 n · 보류 n · 캐시 n` 줄이 관심사마다, 끝에 `LLM n회 · 입력 · 출력 토큰`, exit 0.

- [ ] **Step 3: 실행 후 상태와 판정 샘플 수집**

Run:
```bash
docker exec jogan-db psql -U jogan -d jogan -c "select i.label, count(*) from paper_candidates c join interests i on i.id=c.interest_id group by i.label order by 1;"
docker exec jogan-db psql -U jogan -d jogan -c "select i.label, p.title, r.reason from relevance_judgments r join interests i on i.id=r.interest_id join papers p on p.id=r.paper_id where not r.relevant order by random() limit 5;"
docker exec jogan-db psql -U jogan -d jogan -c "select i.label, p.title, r.reason from relevance_judgments r join interests i on i.id=r.interest_id join papers p on p.id=r.paper_id where r.relevant and i.label like '%수면%';"
```

- [ ] **Step 4: HISTORY.md 기록**

`HISTORY.md` 맨 위 머리말 다음 `---` 아래에 `## 2026-10-0X · 관련성 판정 첫 실제 실행` 항목을 추가한다. 스펙 「실제 실행과 기록」의 항목을 **관측한 값만** 채운다:
- 관심사별 판정·통과·탈락·보류·캐시 수 표, 특히 `수면과 기억 공고화`에 남은 편수
- 실행 전후 후보 수(삭제된 기존 후보 수)
- 탈락 사유 샘플 3~5개와 맞게 뺐는지에 대한 판단, 통과했지만 의심스러운 것
- LLM 호출 수·입력·출력 토큰·소요 시간

추측(예: "아마 프롬프트가…")은 적지 않는다. 판단이 필요한 이상(예: 진짜 관련 논문이 탈락)은 "관측 + 미결"로 적는다.

- [ ] **Step 5: 커밋**

```bash
git add HISTORY.md
git commit -m "docs: 관련성 판정 첫 실제 실행 결과 기록

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
