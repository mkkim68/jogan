# evaluator ①②③단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `services/evaluator`를 만들어 후보 논문에 신뢰도 판정과 **근거 문장**을 붙인다.

**Architecture:** 독립 실행 스크립트. `paper_candidates`에서 아직 평가되지 않은 논문을 가져와 ①규칙(비용 0) → ②OpenAlex(무료) → ③LLM 2패스(초록 트리아지 후 상위 6편만 본문) 순으로 거르고 `assessments`에 남긴다. 싼 필터가 앞에 오는 깔때기다. 각 단계가 DB에 결과를 남기므로 중간에 죽어도 재실행으로 이어간다.

**Tech Stack:** TypeScript · zod 4 · Drizzle ORM · PostgreSQL 17 · Anthropic API · OpenAlex API · Crossref API · vitest 5 · tsx

**Spec:** `docs/superpowers/specs/2026-09-29-evaluator-design.md`

## Global Constraints

- **서버 로직에 `any` 금지.** `@ts-ignore`·`as unknown as`·`as never` 금지 — **테스트 코드에도 적용된다.** 타입을 우회해야 할 것 같으면 실제 타입에 맞는 값을 만들거나 `satisfies`를 쓴다.
- **외부 API 응답은 zod로 파싱한다.** 파싱 실패는 로그와 함께 **해당 논문만** 건너뛴다. 파이프라인 전체를 죽이지 않는다.
- **외부 API 호출은 반드시 레이트리밋·재시도 래퍼(`createHttpClient`)를 통해서.** OpenAlex는 요청 간 100ms, `mailto` 파라미터 필수(polite pool).
- **LLM 프롬프트는 `services/evaluator/prompts/` 아래 파일로 분리한다.** 코드에 인라인하지 않는다.
- **절대 규칙 1**: 근거 문장의 수치·고유명사를 원문과 대조하고, 실패한 문장은 버린다.
- **절대 규칙 2**: 점수 하나로 노출하지 않는다. 모든 단계가 `Evidence` 근거 문장을 남긴다. 확인하지 않은 것을 확인했다고 적지 않는다.
- **절대 규칙 4 (저작권)**: 본문은 **메모리에서만 쓰고 DB에 저장하지 않는다.**
- **`noUncheckedIndexedAccess: true`** — 배열·`Map.get` 인덱싱은 `T | undefined`다. 캐스팅이 아니라 실제 가드로 처리한다.
- **zod 4** — `z.iso.date()`, `z.uuid()`, `z.email()`. `z.string().date()`는 이 레포에 없다.
- 마이그레이션은 **파일로 남겨 커밋**한다.
- 커밋 메시지는 **한국어**. 트레일러는 각자의 지시를 따른다.
- 스테이징 금지: `.env*`(`.env.example`은 허용), `.next/`, `next-env.d.ts`, `*.tsbuildinfo`, `.superpowers/`. `git add <paths>`만 쓰고 `git add -A`는 쓰지 않는다.
- **포트 3100만** 사용. **`pkill`로 이름 패턴 종료 금지** — PID는 포트로 특정한다. 3000번은 사용자의 다른 프로젝트다.
- 로컬 DB는 호스트 포트 **5433**(Docker `jogan-db`). **삭제·truncate·리셋 금지.** 논문 3455편과 사용자 시드가 들어 있다.
- **`ANTHROPIC_API_KEY`는 현재 `.env`에 없다.** ③단계는 모킹으로만 검증 가능하다. 실제 키가 필요한 검증은 Task 10에서 명시적으로 미검증이라고 보고한다.

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `packages/core/src/http.ts` | collector에서 옮겨온 레이트리밋·재시도 래퍼. 두 서비스가 공유 |
| `packages/core/src/constants.ts` | 평가 상수 추가 |
| `packages/core/src/assessment.ts` | `stage3`·`stage4`를 nullable로 |
| `packages/db/src/schema/assessments.ts` | 같은 컬럼 nullable + 마이그레이션 |
| `packages/db/src/queries/assessments.ts` | 미평가 후보 조회 · 판정 upsert |
| `services/evaluator/src/stage1.ts` | 규칙 필터 (순수 함수) |
| `services/evaluator/src/tortured.ts` | tortured phrases 사전 |
| `services/evaluator/src/stage2.ts` | OpenAlex 조회와 매핑 |
| `services/evaluator/src/fulltext.ts` | arXiv HTML → 텍스트 |
| `services/evaluator/src/verify.ts` | 근거 문장 수치 대조 |
| `services/evaluator/src/stage3.ts` | LLM 2패스 |
| `services/evaluator/src/index.ts` | 오케스트레이션 |
| `services/evaluator/prompts/triage.md` | ③a 프롬프트 |
| `services/evaluator/prompts/deep-eval.md` | ③b 프롬프트 |

---

### Task 1: 상수 · 타입 nullable · `http.ts`를 core로 이동

**Files:**
- Modify: `packages/core/src/constants.ts`
- Modify: `packages/core/src/assessment.ts`
- Create: `packages/core/src/http.ts` (이동)
- Delete: `services/collector/src/http.ts`, `services/collector/src/http.test.ts`
- Create: `packages/core/src/http.test.ts` (이동)
- Modify: `services/collector/src/index.ts`, `services/collector/src/arxiv.ts`, `services/collector/src/embed.ts`, `services/collector/src/live.test.ts` (import 경로)
- Test: `packages/core/src/assessment.test.ts`

**Interfaces:**
- Produces (`@jogan/core`): `TRIAGE_DEEP_CUT`, `STAGE1_MIN_ABSTRACT`, `OPENALEX_MIN_INTERVAL_MS`, `EVAL_MAX_PER_RUN`, `EVALUATOR_LOCK_KEY`, `OPENALEX_API`, `CROSSREF_API`; `createHttpClient(opts, deps)` → `HttpClient`; `Stage3`·`Stage4`가 `Assessment`에서 nullable.

- [ ] **Step 1: `http.ts`를 core로 옮긴다**

```bash
cd /Users/kimminkyoung/Desktop/PLAYGROUND/jogan
git mv services/collector/src/http.ts packages/core/src/http.ts
git mv services/collector/src/http.test.ts packages/core/src/http.test.ts
```

`packages/core/src/index.ts`에 한 줄 추가한다 (`export * from './constants'` 바로 아래):

```ts
export * from './http'
```

- [ ] **Step 2: collector의 import 경로를 고친다**

`services/collector/src/` 아래 네 파일에서 `from './http'`를 `from '@jogan/core'`로 바꾼다. 이미 `@jogan/core`를 import하는 파일은 기존 import 목록에 합친다.

```bash
grep -rn "from './http'" services/collector/src
```

`createHttpClient`와 `type HttpClient`가 대상이다. 예: `services/collector/src/arxiv.ts`의

```ts
import type { HttpClient } from './http'
```

는 파일 상단의 `@jogan/core` import에 `type HttpClient`를 합쳐 넣는다. `services/collector/package.json`의 의존성은 이미 `@jogan/core`를 포함하므로 손대지 않는다.

- [ ] **Step 3: 상수를 추가한다**

`packages/core/src/constants.ts` 맨 아래에 붙인다.

```ts
/** ③b(본문 정밀 평가)로 넘길 편수. **첫 실행 결과를 보고 조정할 값이다** — 하루 2편 배달에 여유를 둔 추측값 */
export const TRIAGE_DEEP_CUT = 6
/** 이보다 짧은 초록은 메타데이터 부실로 본다 (글자 수) */
export const STAGE1_MIN_ABSTRACT = 200
/** OpenAlex polite pool 기준 요청 간격 */
export const OPENALEX_MIN_INTERVAL_MS = 100
/** 한 실행에서 평가할 논문 수 상한 */
export const EVAL_MAX_PER_RUN = 200
/** 중복 실행 가드. collector(610_927)와 달라야 한다 */
export const EVALUATOR_LOCK_KEY = 610_928
export const OPENALEX_API = 'https://api.openalex.org/works'
export const CROSSREF_API = 'https://api.crossref.org/works'
```

- [ ] **Step 4: 실패하는 테스트를 쓴다**

`packages/core/src/assessment.test.ts`를 만든다.

```ts
import { describe, expect, it } from 'vitest'
import { Assessment, EVALUATOR_LOCK_KEY, TRIAGE_DEEP_CUT } from './index'

const base = {
  paperId: '00000000-0000-4000-8000-000000000001',
  track: 'notable',
  field: 'cs',
  stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
  stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0.2 },
  evidence: [{ stage: 1, verdict: 'pass', text: '철회 기록이 없다' }],
  caveats: [],
  assessedAt: new Date('2026-09-29T00:00:00Z'),
}

describe('Assessment', () => {
  it('stage3·stage4가 null이어도 통과한다 (평가하지 않은 단계)', () => {
    const parsed = Assessment.parse({ ...base, stage3: null, stage4: null })
    expect(parsed.stage3).toBeNull()
    expect(parsed.stage4).toBeNull()
  })

  it('stage3에 값이 있으면 그대로 검증한다', () => {
    const stage3 = {
      reproducibility: { value: 0.8, reason: '코드 저장소가 논문에 명시돼 있다' },
      design: { value: null, reason: '본문을 확인하지 못했다' },
      statistics: { value: 0.5, reason: '신뢰구간을 보고하지 않았다' },
      claimVsEvidence: { value: 0.7, reason: '초록의 주장이 결과 범위 안이다' },
      limitations: { value: 0.6, reason: '한계 섹션이 있다' },
      preregistered: null,
      studyDesign: null,
    }
    const parsed = Assessment.parse({ ...base, stage3, stage4: null })
    expect(parsed.stage3?.design.value).toBeNull()
  })

  it('근거 문장이 하나도 없으면 거부한다 (절대 규칙 2)', () => {
    expect(Assessment.safeParse({ ...base, stage3: null, stage4: null, evidence: [] }).success).toBe(false)
  })
})

describe('상수', () => {
  it('평가 상수가 제정신인 범위다', () => {
    expect(TRIAGE_DEEP_CUT).toBeGreaterThan(0)
    expect(TRIAGE_DEEP_CUT).toBeLessThan(50)
  })

  it('evaluator 잠금 키가 collector와 다르다', () => {
    expect(EVALUATOR_LOCK_KEY).not.toBe(610_927)
  })
})
```

- [ ] **Step 5: 실패를 확인한다**

Run: `pnpm --filter @jogan/core test assessment`
Expected: FAIL — `stage3: null`이 거부된다 (`Expected object, received null`)

- [ ] **Step 6: 타입을 nullable로 바꾼다**

`packages/core/src/assessment.ts`의 `Assessment` 정의에서 두 줄을 바꾼다.

```ts
  /** ③b를 돌리지 않은 논문은 null이다. "평가하지 않았다"와 "0점"은 다르다 (절대 규칙 2) */
  stage3: Stage3.nullable(),
  /** ④단계는 아직 만들지 않았다. 확인하지 않은 것을 0으로 적지 않는다 */
  stage4: Stage4.nullable(),
```

- [ ] **Step 7: 통과를 확인한다**

Run: `pnpm --filter @jogan/core test && pnpm --filter @jogan/collector test && pnpm typecheck`
Expected: 전부 PASS, tsc 에러 0. collector 테스트가 깨지면 import 경로를 덜 고친 것이다.

- [ ] **Step 8: 커밋**

```bash
git add packages/core/src services/collector/src
git commit -m "core: 평가 상수 추가, stage3·stage4 nullable, http 래퍼를 core로 이동

evaluator도 OpenAlex·Crossref·arXiv를 부르는데 서비스가 다른 서비스를
import하게 둘 수 없어 래퍼를 core로 옮긴다.

stage3·stage4를 nullable로 바꾼다. ④는 아직 만들지 않고 ③b는 상위 몇 편에만
돌리므로, 나머지는 null이 정직한 값이다. stage4에 0을 넣으면 '확인했더니
0회'로 읽히는데 확인한 적이 없다."
```

---

### Task 2: 스키마 nullable · 마이그레이션 · 조회 쿼리

**Files:**
- Modify: `packages/db/src/schema/assessments.ts`
- Create: `packages/db/src/queries/assessments.ts`
- Modify: `packages/db/src/queries/index.ts` (export 한 줄)
- Test: `packages/db/src/queries/queries.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1의 `EVAL_MAX_PER_RUN`.
- Produces (`@jogan/db`):
  - `listUnassessedCandidatePapers(limit: number): Promise<UnassessedPaper[]>`
    여기서 `UnassessedPaper = { id: string; arxivId: string | null; doi: string | null; title: string; abstract: string; authors: Author[]; categories: string[] | null }`
  - `upsertAssessment(row: NewAssessment): Promise<void>` — `paperId` 충돌 시 전체 갱신
  - `NewAssessment` 타입 (`typeof assessments.$inferInsert`)

- [ ] **Step 1: 스키마를 nullable로 바꾼다**

`packages/db/src/schema/assessments.ts`에서 두 줄:

```ts
  /** ③b를 돌리지 않았으면 null. "평가하지 않았다"와 "0점"은 다르다 */
  stage3: jsonb('stage3').$type<Stage3>(),
  /** ④단계는 아직 만들지 않았다 */
  stage4: jsonb('stage4').$type<Stage4>(),
```

(`.notNull()`을 뗀다.)

- [ ] **Step 2: 마이그레이션을 생성하고 적용한다**

```bash
pnpm db:generate
pnpm db:migrate
```

생성된 `packages/db/drizzle/00NN_*.sql`이 `ALTER COLUMN ... DROP NOT NULL` 두 줄인지 확인한다. 데이터를 지우는 구문이 있으면 멈추고 보고한다.

- [ ] **Step 3: 실패하는 테스트를 쓴다**

`packages/db/src/queries/queries.test.ts`의 마지막 `it` 뒤, `describe` 닫기 전에 붙인다.

```ts
  it('아직 평가되지 않은 후보 논문만 가져온다', async () => {
    const { listUnassessedCandidatePapers, upsertAssessment, db, assessments } = await import('../index')
    const { eq } = await import('drizzle-orm')

    const before = await listUnassessedCandidatePapers(500)
    expect(before.length).toBeGreaterThan(0)
    const [first] = before
    if (first === undefined) throw new Error('후보가 비어 있다')
    expect(first.title.length).toBeGreaterThan(0)

    try {
      await upsertAssessment({
        paperId: first.id,
        track: 'notable',
        field: 'cs',
        stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
        stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
        stage3: null,
        stage4: null,
        evidence: [{ stage: 1, verdict: 'pass', text: '철회 기록이 없다' }],
        caveats: [],
      })
      const after = await listUnassessedCandidatePapers(500)
      expect(after.map((p) => p.id)).not.toContain(first.id)
      expect(after.length).toBe(before.length - 1)
    } finally {
      await db.delete(assessments).where(eq(assessments.paperId, first.id))
    }
  })

  it('같은 논문을 다시 upsert하면 덮어쓴다', async () => {
    const { upsertAssessment, listUnassessedCandidatePapers, db, assessments } = await import('../index')
    const { eq } = await import('drizzle-orm')
    const [paper] = await listUnassessedCandidatePapers(1)
    if (paper === undefined) throw new Error('후보가 비어 있다')
    const row = {
      paperId: paper.id,
      track: 'notable' as const,
      field: 'cs' as const,
      stage1: { passed: true, retracted: false, predatoryVenue: false, paperMillSignals: [] },
      stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
      stage3: null,
      stage4: null,
      evidence: [{ stage: 1 as const, verdict: 'pass' as const, text: '처음' }],
      caveats: [],
    }
    try {
      await upsertAssessment(row)
      await upsertAssessment({ ...row, evidence: [{ stage: 1, verdict: 'caution', text: '나중' }] })
      const saved = await db.query.assessments.findFirst({ where: eq(assessments.paperId, paper.id) })
      expect(saved?.evidence).toEqual([{ stage: 1, verdict: 'caution', text: '나중' }])
    } finally {
      await db.delete(assessments).where(eq(assessments.paperId, paper.id))
    }
  })
```

- [ ] **Step 4: 실패를 확인한다**

Run: `pnpm --filter @jogan/db test`
Expected: FAIL — `listUnassessedCandidatePapers is not a function`

- [ ] **Step 5: 쿼리를 구현한다**

`packages/db/src/queries/assessments.ts`를 만든다.

```ts
import type { Author } from '@jogan/core'
import { isNull, sql } from 'drizzle-orm'
import { db } from '../client'
import { assessments } from '../schema/assessments'
import { paperCandidates } from '../schema/candidates'
import { papers } from '../schema/papers'

export type NewAssessment = typeof assessments.$inferInsert

export type UnassessedPaper = {
  id: string
  arxivId: string | null
  doi: string | null
  title: string
  abstract: string
  authors: Author[]
  categories: string[] | null
}

/**
 * 후보로 올라왔지만 아직 판정이 없는 논문. 사용자가 여럿이어도 논문당 한 번만 평가한다
 * (assessments는 paperId가 PK라 사용자 간에 공유된다).
 */
export async function listUnassessedCandidatePapers(limit: number): Promise<UnassessedPaper[]> {
  const rows = await db
    .selectDistinct({
      id: papers.id,
      arxivId: papers.arxivId,
      doi: papers.doi,
      title: papers.title,
      abstract: papers.abstract,
      authors: papers.authors,
      categories: papers.categories,
    })
    .from(paperCandidates)
    .innerJoin(papers, sql`${papers.id} = ${paperCandidates.paperId}`)
    .leftJoin(assessments, sql`${assessments.paperId} = ${papers.id}`)
    .where(isNull(assessments.paperId))
    .limit(limit)
  return rows
}

/** 판정은 논문당 1행. 다시 평가하면 덮어쓴다 */
export async function upsertAssessment(row: NewAssessment): Promise<void> {
  await db
    .insert(assessments)
    .values(row)
    .onConflictDoUpdate({
      target: assessments.paperId,
      set: {
        track: row.track,
        field: row.field,
        stage1: row.stage1,
        stage2: row.stage2,
        stage3: row.stage3 ?? null,
        stage4: row.stage4 ?? null,
        evidence: row.evidence,
        caveats: row.caveats,
        assessedAt: new Date(),
      },
    })
}
```

`papers` 스키마에 `categories` 컬럼이 없으면 그 필드를 빼고, 대신 `UnassessedPaper`에서도 지운 뒤 리포트에 적어라 — Task 4의 `field` 판정이 이 값을 쓰므로, 없으면 Task 4는 `'other'`로 떨어뜨린다.

`packages/db/src/queries/index.ts`에 추가한다:

```ts
export * from './assessments'
```

- [ ] **Step 6: 통과를 확인한다**

Run: `pnpm --filter @jogan/db test && pnpm typecheck`
Expected: PASS, tsc 에러 0

- [ ] **Step 7: 커밋**

```bash
git add packages/db/src packages/db/drizzle
git commit -m "db: assessments의 stage3·stage4를 nullable로, 미평가 후보 조회 쿼리

평가하지 않은 단계를 null로 남기기 위한 마이그레이션과, 후보 중 아직
판정이 없는 논문만 가져오는 쿼리."
```

---

### Task 3: ①단계 규칙 필터

**Files:**
- Create: `services/evaluator/src/tortured.ts`, `services/evaluator/src/stage1.ts`
- Test: `services/evaluator/src/stage1.test.ts`

**Interfaces:**
- Consumes: Task 1의 `STAGE1_MIN_ABSTRACT`, Task 2의 `UnassessedPaper`.
- Produces:
  - `TORTURED_PHRASES: readonly string[]`
  - `runStage1(paper: Stage1Input): Stage1Result`
    - `Stage1Input = { title: string; abstract: string; authors: { name: string }[]; doi: string | null }`
    - `Stage1Result = { stage1: Stage1; evidence: Evidence[]; caveats: string[] }`

- [ ] **Step 1: tortured phrases 사전을 만든다**

`services/evaluator/src/tortured.ts`:

```ts
/**
 * 페이퍼밀이 표절 탐지를 피하려고 동의어 치환기를 돌렸을 때 남는 흔적.
 * 정상적인 논문은 이런 표현을 쓰지 않는다. Cabanac 등의 Problematic Paper Screener가
 * 모은 목록에서 널리 알려진 것만 추렸다 — 길게 가져갈수록 오탐이 는다.
 */
export const TORTURED_PHRASES: readonly string[] = [
  'colossal information', // big data
  'huge information',
  'counterfeit consciousness', // artificial intelligence
  'counterfeit neural organization', // artificial neural network
  'profound learning', // deep learning
  'machine learning calculation', // machine learning algorithm
  'irregular woodland', // random forest
  'support vector machine calculation',
  'bosom malignancy', // breast cancer
  'lung malignancy',
  'mean square blunder', // mean squared error
  'flag commotion proportion', // signal to noise ratio
  'underlying condition', // structural equation
  'bunching calculation', // clustering algorithm
  'choice tree', // decision tree — 오탐 위험이 있어 소문자 완전일치로만 본다
]
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`services/evaluator/src/stage1.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { runStage1 } from './stage1'

const ok = {
  title: 'A Study of Long-Term Memory in Language Agents',
  abstract: 'x'.repeat(400),
  authors: [{ name: 'Jane Doe' }],
  doi: null,
}

describe('runStage1', () => {
  // arXiv 논문의 98%가 DOI가 없다. PRD의 "DOI 없음 = 메타데이터 부실"을 그대로
  // 적용하면 전부 탈락한다 — 프리프린트는 DOI가 없는 게 정상이다.
  it('DOI가 없어도 통과한다', () => {
    const r = runStage1(ok)
    expect(r.stage1.passed).toBe(true)
  })

  it('DOI가 없으면 철회 확인 불가를 caveat으로 남긴다', () => {
    const r = runStage1(ok)
    expect(r.caveats.join(' ')).toContain('철회')
  })

  it('DOI가 있으면 철회 확인 불가 caveat이 없다', () => {
    const r = runStage1({ ...ok, doi: '10.1234/abcd' })
    expect(r.caveats.join(' ')).not.toContain('철회')
  })

  it('초록이 너무 짧으면 탈락한다', () => {
    const r = runStage1({ ...ok, abstract: '짧다' })
    expect(r.stage1.passed).toBe(false)
  })

  it('초록이 없으면 탈락한다', () => {
    const r = runStage1({ ...ok, abstract: '' })
    expect(r.stage1.passed).toBe(false)
  })

  it('저자가 없으면 탈락한다', () => {
    const r = runStage1({ ...ok, authors: [] })
    expect(r.stage1.passed).toBe(false)
  })

  it('제목이 없으면 탈락한다', () => {
    const r = runStage1({ ...ok, title: '   ' })
    expect(r.stage1.passed).toBe(false)
  })

  it('tortured phrase가 있으면 신호로 남기고 탈락시킨다', () => {
    const r = runStage1({ ...ok, abstract: `We apply counterfeit consciousness to ${'x'.repeat(400)}` })
    expect(r.stage1.paperMillSignals).toContain('counterfeit consciousness')
    expect(r.stage1.passed).toBe(false)
  })

  it('tortured phrase 판정은 대소문자를 가리지 않는다', () => {
    const r = runStage1({ ...ok, abstract: `COLOSSAL INFORMATION pipelines ${'x'.repeat(400)}` })
    expect(r.stage1.paperMillSignals).toContain('colossal information')
  })

  it('통과하면 pass 근거 문장이 남는다 (절대 규칙 2)', () => {
    const r = runStage1(ok)
    expect(r.evidence.length).toBeGreaterThan(0)
    expect(r.evidence.every((e) => e.stage === 1)).toBe(true)
    expect(r.evidence.some((e) => e.verdict === 'pass')).toBe(true)
  })

  it('탈락하면 caution 근거 문장이 남는다', () => {
    const r = runStage1({ ...ok, authors: [] })
    expect(r.evidence.some((e) => e.verdict === 'caution')).toBe(true)
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @jogan/evaluator test stage1`
Expected: FAIL — `Cannot find module './stage1'`

- [ ] **Step 4: 구현한다**

`services/evaluator/src/stage1.ts`:

```ts
import { STAGE1_MIN_ABSTRACT, type Evidence, type Stage1 } from '@jogan/core'
import { TORTURED_PHRASES } from './tortured'

export type Stage1Input = {
  title: string
  abstract: string
  authors: { name: string }[]
  doi: string | null
}

export type Stage1Result = { stage1: Stage1; evidence: Evidence[]; caveats: string[] }

/**
 * 비용 0의 하드 필터. 여기서 탈락하면 뒤 단계를 돌리지 않는다.
 *
 * PRD §3.2 ①의 "메타데이터 부실 — DOI 없음"은 뺐다. arXiv 논문의 98%가 DOI가 없는데,
 * 프리프린트는 저널에 실리기 전까지 DOI가 없는 게 정상이라 부실이 아니라 정의다.
 * 대신 철회 조회를 못 한다는 사실을 caveat으로 남긴다.
 *
 * 철회 자체의 조회(Crossref)는 이 함수 밖에서 한다 — 여기는 순수 함수로 둔다.
 */
export function runStage1(paper: Stage1Input): Stage1Result {
  const evidence: Evidence[] = []
  const caveats: string[] = []
  const problems: string[] = []

  const abstract = paper.abstract.trim()
  if (abstract.length < STAGE1_MIN_ABSTRACT) {
    problems.push(abstract.length === 0 ? '초록이 없다' : `초록이 ${abstract.length}자로 너무 짧다`)
  }
  if (paper.authors.length === 0) problems.push('저자 정보가 없다')
  if (paper.title.trim().length === 0) problems.push('제목이 없다')

  const haystack = `${paper.title} ${abstract}`.toLowerCase()
  const paperMillSignals = TORTURED_PHRASES.filter((p) => haystack.includes(p))

  const passed = problems.length === 0 && paperMillSignals.length === 0

  if (paperMillSignals.length > 0) {
    evidence.push({
      stage: 1,
      verdict: 'caution',
      text: `동의어 치환 흔적이 보인다: ${paperMillSignals.join(', ')}`,
    })
  }
  if (problems.length > 0) {
    evidence.push({ stage: 1, verdict: 'caution', text: `메타데이터가 부실하다 — ${problems.join(', ')}` })
  }
  if (passed) {
    evidence.push({ stage: 1, verdict: 'pass', text: '메타데이터가 갖춰져 있고 동의어 치환 흔적이 없다' })
  }

  if (paper.doi === null) {
    caveats.push('DOI가 없어 철회 여부를 조회하지 못했다 (프리프린트에서는 정상이다)')
  }

  return {
    stage1: { passed, retracted: false, predatoryVenue: false, paperMillSignals },
    evidence,
    caveats,
  }
}
```

`services/evaluator/package.json`의 `dependencies`에 추가하고 `scripts`에 `test`를 넣는다:

```json
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@jogan/core": "workspace:*",
    "@jogan/db": "workspace:*",
    "dotenv": "^17.2.3",
    "zod": "^4.1.13"
  }
```

정확한 버전은 `services/collector/package.json`에서 그대로 복사한다. `pnpm install`을 돌린다.

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @jogan/evaluator test && pnpm typecheck`
Expected: 11개 PASS, tsc 에러 0

- [ ] **Step 6: 커밋**

```bash
git add services/evaluator packages pnpm-lock.yaml
git commit -m "evaluator: ①단계 규칙 필터

PRD의 '메타데이터 부실 — DOI 없음'은 뺐다. arXiv 논문의 98%가 DOI가 없어
그대로 적용하면 전부 탈락한다. 대신 철회 조회를 못 한다는 사실을 caveat으로
남긴다."
```

---

### Task 4: ②단계 OpenAlex 조회

**Files:**
- Create: `services/evaluator/src/stage2.ts`, `services/evaluator/src/fixtures/openalex-work.json`
- Test: `services/evaluator/src/stage2.test.ts`

**Interfaces:**
- Consumes: Task 1의 `createHttpClient`·`HttpClient`·`OPENALEX_API`·`OPENALEX_MIN_INTERVAL_MS`.
- Produces:
  - `parseOpenAlexWork(json: unknown): OpenAlexWork | null` — zod 파싱 실패 시 `null`
  - `toStage2(work: OpenAlexWork | null): Stage2Result`
    - `Stage2Result = { stage2: Stage2; track: Track; evidence: Evidence[]; caveats: string[] }`
  - `fetchOpenAlexByArxivId(client: HttpClient, arxivId: string, mailto: string): Promise<unknown | null>` — 404면 `null`
  - `fieldFromCategories(categories: string[] | null): Field`

- [ ] **Step 1: 픽스처를 저장한다**

`services/evaluator/src/fixtures/openalex-work.json`. OpenAlex 응답에서 우리가 쓰는 필드만 남긴 것이다.

```json
{
  "id": "https://openalex.org/W4400000001",
  "doi": "https://doi.org/10.1000/example",
  "cited_by_count": 12,
  "publication_year": 2026,
  "primary_location": {
    "source": {
      "id": "https://openalex.org/S137773608",
      "display_name": "Nature",
      "type": "journal"
    }
  },
  "authorships": [
    { "author": { "id": "https://openalex.org/A1", "display_name": "Jane Doe" } },
    { "author": { "id": "https://openalex.org/A2", "display_name": "John Roe" } }
  ]
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`services/evaluator/src/stage2.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchOpenAlexByArxivId, fieldFromCategories, parseOpenAlexWork, toStage2 } from './stage2'

const work = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures/openalex-work.json'), 'utf8')) as unknown

describe('parseOpenAlexWork', () => {
  it('픽스처를 파싱한다', () => {
    const w = parseOpenAlexWork(work)
    expect(w?.citedByCount).toBe(12)
    expect(w?.venueName).toBe('Nature')
    expect(w?.isJournal).toBe(true)
    expect(w?.authorCount).toBe(2)
  })

  it('preprint 저장소는 저널로 보지 않는다', () => {
    const repo = { ...(work as Record<string, unknown>), primary_location: { source: { display_name: 'arXiv', type: 'repository' } } }
    const w = parseOpenAlexWork(repo)
    expect(w?.isJournal).toBe(false)
    expect(w?.venueName).toBe('arXiv')
  })

  it('primary_location이 없어도 파싱된다', () => {
    const none = { ...(work as Record<string, unknown>), primary_location: null }
    expect(parseOpenAlexWork(none)?.isJournal).toBe(false)
  })

  it('모양이 다르면 null을 돌려준다 (파이프라인을 죽이지 않는다)', () => {
    expect(parseOpenAlexWork({ nope: true })).toBeNull()
    expect(parseOpenAlexWork(null)).toBeNull()
  })
})

describe('toStage2', () => {
  it('저널에 실렸으면 검증 트랙이다', () => {
    const r = toStage2(parseOpenAlexWork(work))
    expect(r.track).toBe('verified')
    expect(r.stage2.reviewStatus).toBe('published')
    expect(r.stage2.venueTier).toBe('Nature')
  })

  it('저널이 아니면 주목 트랙이고 프리프린트 경고가 붙는다', () => {
    const repo = { ...(work as Record<string, unknown>), primary_location: { source: { display_name: 'arXiv', type: 'repository' } } }
    const r = toStage2(parseOpenAlexWork(repo))
    expect(r.track).toBe('notable')
    expect(r.stage2.reviewStatus).toBe('preprint')
    expect(r.evidence.some((e) => e.verdict === 'caution')).toBe(true)
  })

  // OpenAlex에 아직 없는 논문(며칠 전 올라온 것)은 흔하다. 탈락이 아니다.
  it('OpenAlex에 없으면 주목 트랙 + caveat이고 탈락이 아니다', () => {
    const r = toStage2(null)
    expect(r.track).toBe('notable')
    expect(r.caveats.join(' ')).toContain('색인')
    expect(r.evidence.length).toBeGreaterThan(0)
  })

  it('인용 수를 근거 문장에 쓴다', () => {
    const r = toStage2(parseOpenAlexWork(work))
    expect(r.evidence.map((e) => e.text).join(' ')).toContain('12')
  })

  it('authorTrackRecord는 0~1이고 가중치가 낮다는 것을 주석이 아니라 값으로 보인다', () => {
    const r = toStage2(parseOpenAlexWork(work))
    expect(r.stage2.authorTrackRecord).toBeGreaterThanOrEqual(0)
    expect(r.stage2.authorTrackRecord).toBeLessThanOrEqual(1)
  })
})

describe('fieldFromCategories', () => {
  it('q-bio는 bio_med다', () => {
    expect(fieldFromCategories(['q-bio.NC', 'cs.LG'])).toBe('bio_med')
  })

  it('cs와 stat.ME는 cs다', () => {
    expect(fieldFromCategories(['cs.CL'])).toBe('cs')
    expect(fieldFromCategories(['stat.ME'])).toBe('cs')
  })

  it('모르면 other다', () => {
    expect(fieldFromCategories(['math.AG'])).toBe('other')
    expect(fieldFromCategories(null)).toBe('other')
    expect(fieldFromCategories([])).toBe('other')
  })
})

describe('fetchOpenAlexByArxivId', () => {
  it('404면 null이다', async () => {
    const client = { request: async () => new Response('', { status: 404 }) }
    expect(await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')).toBeNull()
  })

  it('mailto를 붙인다 (polite pool)', async () => {
    let seen = ''
    const client = {
      request: async (url: string) => {
        seen = url
        return new Response(JSON.stringify(work), { status: 200 })
      },
    }
    await fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')
    expect(seen).toContain('mailto=a%40b.com')
    expect(seen).toContain('2609.00001')
  })

  it('200이 아니고 404도 아니면 던진다', async () => {
    const client = { request: async () => new Response('', { status: 500 }) }
    await expect(fetchOpenAlexByArxivId(client, '2609.00001', 'a@b.com')).rejects.toThrow()
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @jogan/evaluator test stage2`
Expected: FAIL — `Cannot find module './stage2'`

- [ ] **Step 4: 구현한다**

`services/evaluator/src/stage2.ts`:

```ts
import { OPENALEX_API, type Evidence, type Field, type HttpClient, type Stage2, type Track } from '@jogan/core'
import { z } from 'zod'

const Source = z.object({
  display_name: z.string(),
  type: z.string().nullish(),
})

const Work = z.object({
  cited_by_count: z.number().int().min(0),
  publication_year: z.number().int().nullish(),
  primary_location: z.object({ source: Source.nullish() }).nullish(),
  authorships: z.array(z.object({ author: z.object({ display_name: z.string() }) })).default([]),
})

export type OpenAlexWork = {
  citedByCount: number
  venueName: string | null
  isJournal: boolean
  authorCount: number
}

export function parseOpenAlexWork(json: unknown): OpenAlexWork | null {
  const parsed = Work.safeParse(json)
  if (!parsed.success) return null
  const source = parsed.data.primary_location?.source ?? null
  return {
    citedByCount: parsed.data.cited_by_count,
    venueName: source?.display_name ?? null,
    isJournal: source?.type === 'journal',
    authorCount: parsed.data.authorships.length,
  }
}

export type Stage2Result = { stage2: Stage2; track: Track; evidence: Evidence[]; caveats: string[] }

/**
 * 출처 신호를 Stage2로 옮기고 트랙을 정한다.
 *
 * `authorTrackRecord`는 PRD §3.2 ②의 지시대로 **가중치를 낮게** 둔다. 명성 편향을 피하려고
 * 트랙 결정과 ③단계 점수에 쓰지 않고, 근거 문장에서도 단독으로 내세우지 않는다.
 * 지금은 저자 수만 아는 상태라 0.2를 상한으로 하는 약한 신호로만 기록한다.
 */
export function toStage2(work: OpenAlexWork | null): Stage2Result {
  if (work === null) {
    return {
      stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
      track: 'notable',
      evidence: [{ stage: 2, verdict: 'caution', text: '심사를 거치지 않은 프리프린트다' }],
      caveats: ['OpenAlex에 아직 색인되지 않아 출처 신호를 확인하지 못했다'],
    }
  }

  const published = work.isJournal
  const evidence: Evidence[] = []

  if (published && work.venueName !== null) {
    evidence.push({ stage: 2, verdict: 'pass', text: `동료심사를 거쳐 ${work.venueName}에 게재됐다` })
  } else {
    evidence.push({ stage: 2, verdict: 'caution', text: '심사를 거치지 않은 프리프린트다' })
  }

  if (work.citedByCount > 0) {
    evidence.push({ stage: 2, verdict: 'pass', text: `다른 논문에 ${work.citedByCount}회 인용됐다` })
  }

  return {
    stage2: {
      venueTier: published ? work.venueName : null,
      reviewStatus: published ? 'published' : 'preprint',
      reviewScore: null,
      authorTrackRecord: Math.min(0.2, work.authorCount / 50),
    },
    track: published ? 'verified' : 'notable',
    evidence,
    caveats: [],
  }
}

/** arXiv 카테고리 → 분야. 지금 코퍼스는 7개 카테고리뿐이라 이 매핑으로 충분하다 */
export function fieldFromCategories(categories: string[] | null): Field {
  if (categories === null || categories.length === 0) return 'other'
  if (categories.some((c) => c.startsWith('q-bio'))) return 'bio_med'
  if (categories.some((c) => c.startsWith('cs.') || c === 'stat.ME')) return 'cs'
  return 'other'
}

/** 색인 전이면 404다 — 그건 실패가 아니라 정보다 */
export async function fetchOpenAlexByArxivId(
  client: HttpClient,
  arxivId: string,
  mailto: string,
): Promise<unknown | null> {
  const url = `${OPENALEX_API}/https://arxiv.org/abs/${encodeURIComponent(arxivId)}?mailto=${encodeURIComponent(mailto)}`
  const res = await client.request(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`OpenAlex 응답 ${res.status}`)
  return res.json()
}
```

`fetchOpenAlexByArxivId`의 URL 형식이 404만 계속 돌려주면, Task 9의 라이브 테스트에서 실제 응답을 보고 `?filter=ids.openalex:...` 또는 `?filter=locations.landing_page_url:...` 형식으로 바꾼다. **바꿨으면 리포트에 적어라.**

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @jogan/evaluator test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add services/evaluator/src
git commit -m "evaluator: ②단계 OpenAlex 조회와 트랙 판정

저널 게재가 확인되면 검증 트랙, 아니면 주목 트랙이다. 색인 전이라 404가
나는 건 흔한 일이고 탈락 사유가 아니다 — caveat으로 남기고 통과시킨다."
```

---

### Task 5: 본문 가져오기

**Files:**
- Create: `services/evaluator/src/fulltext.ts`, `services/evaluator/src/fixtures/arxiv-html.html`
- Test: `services/evaluator/src/fulltext.test.ts`

**Interfaces:**
- Consumes: Task 1의 `HttpClient`.
- Produces: `htmlToText(html: string): string`; `fetchFullText(client: HttpClient, arxivId: string): Promise<string | null>` — HTML이 없으면 `null`

- [ ] **Step 1: 픽스처를 만든다**

`services/evaluator/src/fixtures/arxiv-html.html` — arXiv HTML의 구조만 흉내 낸 작은 파일이다. 실제 논문을 저장하지 않는다 (절대 규칙 4).

```html
<!DOCTYPE html>
<html><head><title>Test Paper</title>
<style>.ltx_p { margin: 0 }</style>
<script>console.log('nav')</script>
</head>
<body>
<div class="ltx_page_main">
  <h1 class="ltx_title">A Study of Something</h1>
  <div class="ltx_abstract"><p>We propose   a method.</p></div>
  <section><h2>1 Introduction</h2><p>Prior work &amp; ours.</p></section>
  <section><h2>5 Limitations</h2><p>Our sample size is 12.</p></section>
</div>
</body></html>
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`services/evaluator/src/fulltext.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fetchFullText, htmlToText } from './fulltext'

const html = readFileSync(join(import.meta.dirname, 'fixtures/arxiv-html.html'), 'utf8')

describe('htmlToText', () => {
  it('본문 텍스트를 뽑는다', () => {
    const t = htmlToText(html)
    expect(t).toContain('We propose a method.')
    expect(t).toContain('Our sample size is 12.')
  })

  it('script와 style은 버린다', () => {
    const t = htmlToText(html)
    expect(t).not.toContain('console.log')
    expect(t).not.toContain('margin: 0')
  })

  it('HTML 엔티티를 되돌린다', () => {
    expect(htmlToText('<p>Prior work &amp; ours &lt;here&gt;</p>')).toBe('Prior work & ours <here>')
  })

  it('공백을 하나로 줄인다', () => {
    expect(htmlToText('<p>a\n\n   b</p>')).toBe('a b')
  })

  it('태그가 없으면 빈 문자열이다', () => {
    expect(htmlToText('<html><head></head><body></body></html>')).toBe('')
  })
})

describe('fetchFullText', () => {
  it('200이면 텍스트를 돌려준다', async () => {
    const client = { request: async () => new Response(html, { status: 200 }) }
    const t = await fetchFullText(client, '2609.00001')
    expect(t).toContain('We propose a method.')
  })

  it('HTML이 없으면(404) null이다 — 탈락이 아니다', async () => {
    const client = { request: async () => new Response('', { status: 404 }) }
    expect(await fetchFullText(client, '2609.00001')).toBeNull()
  })

  it('서버 오류도 null이다 — 본문 없이 진행한다', async () => {
    const client = { request: async () => new Response('', { status: 500 }) }
    expect(await fetchFullText(client, '2609.00001')).toBeNull()
  })

  it('네트워크 오류도 null이다', async () => {
    const client = { request: async () => { throw new Error('boom') } }
    expect(await fetchFullText(client, '2609.00001')).toBeNull()
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @jogan/evaluator test fulltext`
Expected: FAIL — `Cannot find module './fulltext'`

- [ ] **Step 4: 구현한다**

`services/evaluator/src/fulltext.ts`:

```ts
import type { HttpClient } from '@jogan/core'

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
}

/** arXiv HTML에서 읽을 수 있는 텍스트만 남긴다 */
export function htmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
  const stripped = withoutScripts.replace(/<[^>]+>/g, ' ')
  const decoded = stripped.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
  return decoded.replace(/\s+/g, ' ').trim()
}

/**
 * arXiv HTML 본문. 없으면 null이고, 그건 실패가 아니다 —
 * 호출자는 초록만으로 평가하되 본문을 봐야 답할 수 있는 항목을 null로 남긴다.
 *
 * **받아온 본문은 메모리에서만 쓴다. DB에 저장하지 않는다** (CLAUDE.md 절대 규칙 4).
 */
export async function fetchFullText(client: HttpClient, arxivId: string): Promise<string | null> {
  try {
    const res = await client.request(`https://arxiv.org/html/${arxivId}`)
    if (!res.ok) return null
    const text = htmlToText(await res.text())
    return text.length === 0 ? null : text
  } catch {
    return null
  }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @jogan/evaluator test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add services/evaluator/src
git commit -m "evaluator: arXiv HTML 본문 가져오기

본문은 메모리에서만 쓰고 DB에 저장하지 않는다 (절대 규칙 4).
HTML이 없는 논문은 흔하고, 그건 탈락이 아니라 초록만으로 평가할 신호다."
```

---

### Task 6: 근거 문장 수치 대조 (절대 규칙 1)

**Files:**
- Create: `services/evaluator/src/verify.ts`
- Test: `services/evaluator/src/verify.test.ts`

**Interfaces:**
- Produces: `verifyAgainstSource(sentence: string, source: string): boolean`; `keepVerifiedEvidence(items: Evidence[], source: string): Evidence[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`services/evaluator/src/verify.test.ts`:

```ts
import type { Evidence } from '@jogan/core'
import { describe, expect, it } from 'vitest'
import { keepVerifiedEvidence, verifyAgainstSource } from './verify'

const source = 'We evaluate on 12 datasets with 3 seeds. Accuracy reaches 87.5% on ImageNet.'

describe('verifyAgainstSource', () => {
  it('원문에 있는 수치는 통과한다', () => {
    expect(verifyAgainstSource('12개 데이터셋에서 평가했다', source)).toBe(true)
    expect(verifyAgainstSource('정확도 87.5%에 도달했다', source)).toBe(true)
  })

  it('원문에 없는 수치는 막는다', () => {
    expect(verifyAgainstSource('40개 데이터셋에서 평가했다', source)).toBe(false)
    expect(verifyAgainstSource('정확도 92.1%에 도달했다', source)).toBe(false)
  })

  it('수치가 없는 문장은 통과한다', () => {
    expect(verifyAgainstSource('한계 섹션이 성실하다', source)).toBe(true)
  })

  it('여러 수치 중 하나라도 원문에 없으면 막는다', () => {
    expect(verifyAgainstSource('12개 데이터셋에서 92% 정확도', source)).toBe(false)
  })

  it('원문이 비어 있으면 수치가 든 문장을 전부 막는다', () => {
    expect(verifyAgainstSource('12개 데이터셋', '')).toBe(false)
    expect(verifyAgainstSource('한계가 성실하다', '')).toBe(true)
  })

  it('소수점 표기가 같아야 한다', () => {
    expect(verifyAgainstSource('87.50%를 기록했다', source)).toBe(false)
  })
})

describe('keepVerifiedEvidence', () => {
  it('검증 실패한 문장만 버린다', () => {
    const items: Evidence[] = [
      { stage: 3, verdict: 'pass', text: '12개 데이터셋에서 평가했다' },
      { stage: 3, verdict: 'pass', text: '40개 데이터셋에서 평가했다' },
      { stage: 3, verdict: 'caution', text: '한계를 적지 않았다' },
    ]
    const kept = keepVerifiedEvidence(items, source)
    expect(kept.map((e) => e.text)).toEqual(['12개 데이터셋에서 평가했다', '한계를 적지 않았다'])
  })

  it('전부 실패하면 빈 배열이다', () => {
    const items: Evidence[] = [{ stage: 3, verdict: 'pass', text: '99개를 썼다' }]
    expect(keepVerifiedEvidence(items, source)).toEqual([])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @jogan/evaluator test verify`
Expected: FAIL — `Cannot find module './verify'`

- [ ] **Step 3: 구현한다**

`services/evaluator/src/verify.ts`:

```ts
import type { Evidence } from '@jogan/core'

/** 3, 87.5, 1,234 같은 것. 퍼센트 기호와 단위는 뗀 숫자만 본다 */
const NUMBER = /\d[\d,]*(?:\.\d+)?/g

/**
 * 근거 문장에 나온 수치가 원문에 실제로 있는지 대조한다 (CLAUDE.md 절대 규칙 1).
 *
 * LLM이 만들어낸 숫자를 막는 게 목적이다. 수치가 없는 문장("한계 섹션이 성실하다")은
 * 이 검사로 거를 수 없으므로 통과시킨다 — 그건 판단이지 사실 주장이 아니다.
 *
 * 표기가 다르면 막는다(87.5 vs 87.50). 느슨하게 맞추면 검사의 의미가 없다.
 */
export function verifyAgainstSource(sentence: string, source: string): boolean {
  const numbers = sentence.match(NUMBER)
  if (numbers === null) return true
  const normalizedSource = source.replace(/,/g, '')
  return numbers.every((n) => normalizedSource.includes(n.replace(/,/g, '')))
}

/** 검증에 실패한 문장은 버린다. 남은 게 없으면 빈 배열이고, 호출자가 점수를 null로 떨어뜨린다 */
export function keepVerifiedEvidence(items: Evidence[], source: string): Evidence[] {
  return items.filter((e) => verifyAgainstSource(e.text, source))
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm --filter @jogan/evaluator test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add services/evaluator/src
git commit -m "evaluator: 근거 문장의 수치를 원문과 대조한다 (절대 규칙 1)

LLM이 만들어낸 숫자를 막는다. 수치가 없는 판단 문장은 이 검사로 거를 수
없으므로 통과시킨다."
```

---

### Task 7: ③단계 LLM 2패스

**Files:**
- Create: `services/evaluator/prompts/triage.md`, `services/evaluator/prompts/deep-eval.md`
- Create: `services/evaluator/src/stage3.ts`
- Test: `services/evaluator/src/stage3.test.ts`

**Interfaces:**
- Consumes: Task 6의 `keepVerifiedEvidence`.
- Produces:
  - `type LlmFn = (prompt: string, input: string) => Promise<string>`
  - `triage(llm: LlmFn, paper: { title: string; abstract: string }): Promise<number | null>`
  - `deepEval(llm: LlmFn, paper: { title: string; abstract: string }, fullText: string | null): Promise<DeepResult | null>`
    - `DeepResult = { stage3: Stage3; evidence: Evidence[]; caveats: string[] }`
  - `loadPrompt(name: 'triage' | 'deep-eval'): string`

- [ ] **Step 1: 프롬프트 파일을 쓴다**

`services/evaluator/prompts/triage.md`:

```markdown
너는 학술 논문의 신뢰도를 1차로 걸러내는 심사자다. 초록만 보고 판단한다.

이 판단은 **순위를 매기기 위한 것**이다. 여기서 높은 점수를 받은 논문만 본문을
읽는 정밀 평가로 넘어간다.

## 볼 것

- 주장이 구체적인가, 아니면 막연한 홍보 문구인가
- 무엇을 어떻게 측정했는지가 초록에 드러나는가
- 결과를 수치로 말하는가
- 초록의 주장 강도가 방법의 규모에 비해 과하지 않은가

## 보지 말 것

- 저자와 소속의 명성 — 점수에 반영하지 마라
- 주제가 유행인지 — 유행이 신뢰도는 아니다

## 출력

JSON만 출력한다. 다른 말을 덧붙이지 마라.

{"score": 0.0~1.0, "reason": "한 문장"}

판단이 어려우면 낮은 점수 대신 score를 null로 두고 reason에 이유를 적어라.
```

`services/evaluator/prompts/deep-eval.md` — PRD §9의 루브릭을 그대로 옮긴다:

```markdown
너는 학술 논문의 신뢰도를 정밀하게 평가하는 심사자다.

## 평가 항목

각 항목에 0~1 점수와 **근거 문장 하나**를 함께 내라. 근거 없는 점수는 버려진다.

1. **reproducibility** — 코드·데이터 링크가 있는가. 환경·시드가 명시되었나
2. **design** — 표본 크기와 대조군/베이스라인이 주장에 비해 충분한가. ablation이 있나
3. **statistics** — 효과크기·신뢰구간을 보고했나. 다중 비교 보정을 했나
4. **claimVsEvidence** — 초록의 주장 강도가 결과 범위를 넘지 않는가. 인과를 과하게 주장하지 않는가
5. **limitations** — 한계를 성실히 적었는가. 적지 않은 한계를 네가 발견했다면 caveats에 넣어라

## 금지

- **본문에 없는 수치를 만들지 마라.** 네가 쓴 숫자는 원문과 기계적으로 대조되고, 대조에 실패한 문장은 버려진다.
- 저자·소속의 명성을 점수에 반영하지 마라. 그건 다른 단계에서 다룬다.
- 판단이 어려우면 낮은 점수 대신 **value를 null로 두고 이유를 적어라.**
- **본문을 받지 못했다면**, 본문을 봐야 답할 수 있는 항목은 반드시 value를 null로 두고 "본문을 확인하지 못했다"를 이유에 적어라. 초록으로 추측하지 마라.

## 출력

JSON만 출력한다. 다른 말을 덧붙이지 마라.

{
  "reproducibility": {"value": 0.0~1.0 또는 null, "reason": "..."},
  "design": {"value": ..., "reason": "..."},
  "statistics": {"value": ..., "reason": "..."},
  "claimVsEvidence": {"value": ..., "reason": "..."},
  "limitations": {"value": ..., "reason": "..."},
  "caveats": ["..."],
  "evidence": [{"verdict": "pass" 또는 "caution", "text": "사용자에게 그대로 보여줄 한 문장"}]
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`services/evaluator/src/stage3.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deepEval, loadPrompt, triage } from './stage3'

const paper = { title: 'A Study', abstract: 'We evaluate on 12 datasets.' }
const source = 'We evaluate on 12 datasets with 3 seeds.'

const deepJson = JSON.stringify({
  reproducibility: { value: 0.8, reason: '코드 저장소가 명시돼 있다' },
  design: { value: 0.6, reason: '12개 데이터셋에서 평가했다' },
  statistics: { value: null, reason: '신뢰구간 보고를 찾지 못했다' },
  claimVsEvidence: { value: 0.7, reason: '주장이 결과 범위 안이다' },
  limitations: { value: 0.5, reason: '한계 섹션이 짧다' },
  caveats: ['재현 환경이 명시되지 않았다'],
  evidence: [
    { verdict: 'pass', text: '12개 데이터셋에서 검증했다' },
    { verdict: 'pass', text: '40개 데이터셋에서 검증했다' },
  ],
})

describe('loadPrompt', () => {
  it('프롬프트를 파일에서 읽는다 (코드에 인라인하지 않는다)', () => {
    expect(loadPrompt('triage').length).toBeGreaterThan(100)
    expect(loadPrompt('deep-eval')).toContain('reproducibility')
  })
})

describe('triage', () => {
  it('점수를 뽑는다', async () => {
    const llm = async () => '{"score": 0.72, "reason": "구체적이다"}'
    expect(await triage(llm, paper)).toBe(0.72)
  })

  it('코드블록으로 감싸 와도 파싱한다', async () => {
    const llm = async () => '```json\n{"score": 0.4, "reason": "막연하다"}\n```'
    expect(await triage(llm, paper)).toBe(0.4)
  })

  it('score가 null이면 null이다', async () => {
    const llm = async () => '{"score": null, "reason": "판단 불가"}'
    expect(await triage(llm, paper)).toBeNull()
  })

  it('JSON이 아니면 null이다 (그 논문만 건너뛴다)', async () => {
    const llm = async () => '미안하지만 판단할 수 없습니다'
    expect(await triage(llm, paper)).toBeNull()
  })

  it('범위를 벗어난 점수는 null이다', async () => {
    const llm = async () => '{"score": 1.5, "reason": "x"}'
    expect(await triage(llm, paper)).toBeNull()
  })
})

describe('deepEval', () => {
  it('루브릭 5항목을 채운다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, paper, source)
    expect(r?.stage3.reproducibility.value).toBe(0.8)
    expect(r?.stage3.statistics.value).toBeNull()
  })

  // 절대 규칙 1
  it('원문에 없는 수치가 든 근거 문장을 버린다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, paper, source)
    expect(r?.evidence.map((e) => e.text)).toEqual(['12개 데이터셋에서 검증했다'])
  })

  it('버려진 문장은 caveat으로 남긴다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, paper, source)
    expect(r?.caveats.join(' ')).toContain('원문과 대조')
  })

  it('근거 문장이 전부 버려지면 stage3 점수를 전부 null로 떨어뜨린다', async () => {
    const llm = async () =>
      JSON.stringify({
        ...JSON.parse(deepJson),
        evidence: [{ verdict: 'pass', text: '99개 데이터셋에서 검증했다' }],
      })
    const r = await deepEval(llm, paper, source)
    expect(r?.stage3.reproducibility.value).toBeNull()
    expect(r?.evidence).toEqual([])
  })

  it('본문이 없으면 그 사실을 caveat에 남긴다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, paper, null)
    expect(r?.caveats.join(' ')).toContain('본문')
  })

  it('본문이 없으면 초록을 대조 원문으로 쓴다', async () => {
    const llm = async () => deepJson
    const r = await deepEval(llm, { ...paper, abstract: 'We evaluate on 12 datasets.' }, null)
    expect(r?.evidence.map((e) => e.text)).toEqual(['12개 데이터셋에서 검증했다'])
  })

  it('스키마에 맞지 않으면 null이다 (그 논문만 건너뛴다)', async () => {
    const llm = async () => '{"reproducibility": "높음"}'
    expect(await deepEval(llm, paper, source)).toBeNull()
  })

  it('LLM이 던지면 그대로 올린다 (호출자가 논문 단위로 건너뛴다)', async () => {
    const llm = async () => { throw new Error('rate limit') }
    await expect(deepEval(llm, paper, source)).rejects.toThrow('rate limit')
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @jogan/evaluator test stage3`
Expected: FAIL — `Cannot find module './stage3'`

- [ ] **Step 4: 구현한다**

`services/evaluator/src/stage3.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Evidence, Score, Stage3 } from '@jogan/core'
import { z } from 'zod'
import { keepVerifiedEvidence } from './verify'

export type LlmFn = (prompt: string, input: string) => Promise<string>

const PROMPT_DIR = join(import.meta.dirname, '..', 'prompts')

/** 프롬프트는 파일로 둔다 (CLAUDE.md). 변경이 diff로 보여야 한다 */
export function loadPrompt(name: 'triage' | 'deep-eval'): string {
  return readFileSync(join(PROMPT_DIR, `${name}.md`), 'utf8')
}

/** LLM이 코드블록으로 감싸는 일이 흔하다 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced?.[1] ?? raw).trim()
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

const TriageOut = z.object({ score: z.number().min(0).max(1).nullable() })

export async function triage(llm: LlmFn, paper: { title: string; abstract: string }): Promise<number | null> {
  const raw = await llm(loadPrompt('triage'), `# ${paper.title}\n\n${paper.abstract}`)
  const parsed = TriageOut.safeParse(extractJson(raw))
  return parsed.success ? parsed.data.score : null
}

const ScoreOut = z.object({ value: z.number().min(0).max(1).nullable(), reason: z.string().min(1) })
const DeepOut = z.object({
  reproducibility: ScoreOut,
  design: ScoreOut,
  statistics: ScoreOut,
  claimVsEvidence: ScoreOut,
  limitations: ScoreOut,
  caveats: z.array(z.string()).default([]),
  evidence: z.array(z.object({ verdict: z.enum(['pass', 'caution']), text: z.string().min(1) })).default([]),
})

export type DeepResult = { stage3: Stage3; evidence: Evidence[]; caveats: string[] }

const BLANK: Score = { value: null, reason: '근거 문장이 원문 대조를 통과하지 못해 점수를 남기지 않는다' }

/**
 * 본문(없으면 초록)을 근거로 루브릭 5항목을 채운다.
 *
 * 절대 규칙 1: LLM이 돌려준 근거 문장의 수치를 원문과 대조하고, 실패한 문장은 버린다.
 * 문장이 전부 버려지면 그 논문의 ③단계 점수를 신뢰할 수 없으므로 **전부 null로 떨어뜨린다** —
 * 검증되지 않은 근거 위에 점수만 남기는 것이 절대 규칙 2가 금지하는 바로 그것이다.
 */
export async function deepEval(
  llm: LlmFn,
  paper: { title: string; abstract: string },
  fullText: string | null,
): Promise<DeepResult | null> {
  const body = fullText ?? paper.abstract
  const header = fullText === null ? '(본문을 받지 못했다. 초록만 주어진다.)\n\n' : ''
  const raw = await llm(loadPrompt('deep-eval'), `${header}# ${paper.title}\n\n${body}`)
  const parsed = DeepOut.safeParse(extractJson(raw))
  if (!parsed.success) return null
  const d = parsed.data

  const proposed: Evidence[] = d.evidence.map((e) => ({ stage: 3, verdict: e.verdict, text: e.text }))
  const kept = keepVerifiedEvidence(proposed, body)
  const dropped = proposed.length - kept.length

  const caveats = [...d.caveats]
  if (dropped > 0) caveats.push(`근거 문장 ${dropped}개가 원문과 대조에 실패해 버렸다`)
  if (fullText === null) caveats.push('본문을 받지 못해 초록만으로 평가했다')

  const verified = kept.length > 0
  const stage3: Stage3 = {
    reproducibility: verified ? d.reproducibility : BLANK,
    design: verified ? d.design : BLANK,
    statistics: verified ? d.statistics : BLANK,
    claimVsEvidence: verified ? d.claimVsEvidence : BLANK,
    limitations: verified ? d.limitations : BLANK,
    preregistered: null,
    studyDesign: null,
  }

  return { stage3, evidence: kept, caveats }
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @jogan/evaluator test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add services/evaluator
git commit -m "evaluator: ③단계 LLM 2패스와 프롬프트

초록 트리아지로 순위를 매기고 상위 몇 편만 본문으로 정밀 평가한다.
근거 문장이 원문 대조를 전부 통과하지 못하면 점수도 남기지 않는다 —
검증되지 않은 근거 위의 점수는 절대 규칙 2가 금지하는 것이다."
```

---

### Task 8: 오케스트레이션 · Anthropic 연결 · 실제 실행

**Files:**
- Modify: `services/evaluator/src/index.ts` (전체 교체)
- Modify: `services/evaluator/package.json`, `.env.example`, `README.md`
- Test: `services/evaluator/src/index.test.ts`

**Interfaces:**
- Consumes: Task 2~7 전부.
- Produces: `evaluate(deps?: EvaluateDeps): Promise<{ assessed: number; failed: number; deep: number }>`

- [ ] **Step 1: 환경변수를 문서화한다**

`.env.example`에 추가한다 (`ANTHROPIC_API_KEY=`는 이미 있다):

```
# evaluator
# OpenAlex polite pool에 쓸 연락처. 없으면 공용 풀로 떨어져 느려진다
OPENALEX_MAILTO=
```

`README.md`의 명령어 목록에 `pnpm pipeline:evaluate` 설명을 한 줄 넣는다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`services/evaluator/src/index.test.ts`. DB와 LLM을 전부 주입해 네트워크·DB 없이 돈다.

```ts
import { describe, expect, it } from 'vitest'
import { evaluate } from './index'

const paper = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  arxivId: `2609.0000${id}`,
  doi: null,
  title: `Paper ${id}`,
  abstract: 'We evaluate on 12 datasets. '.repeat(20),
  authors: [{ name: 'Jane Doe' }],
  categories: ['cs.LG'],
  ...overrides,
})

const deepJson = JSON.stringify({
  reproducibility: { value: 0.8, reason: '코드가 있다' },
  design: { value: 0.6, reason: '12개 데이터셋' },
  statistics: { value: 0.5, reason: '신뢰구간 없음' },
  claimVsEvidence: { value: 0.7, reason: '적절하다' },
  limitations: { value: 0.5, reason: '짧다' },
  caveats: [],
  evidence: [{ verdict: 'pass', text: '12개 데이터셋에서 검증했다' }],
})

function deps(over: Partial<Parameters<typeof evaluate>[0]> = {}) {
  const saved: { paperId: string; [k: string]: unknown }[] = []
  return {
    saved,
    value: {
      listPapers: async () => [paper('1'), paper('2')],
      saveAssessment: async (row: { paperId: string }) => { saved.push(row) },
      fetchWork: async () => null,
      fetchBody: async () => 'We evaluate on 12 datasets with 3 seeds.',
      llm: async (prompt: string) => (prompt.includes('reproducibility') ? deepJson : '{"score": 0.7, "reason": "ok"}'),
      lock: async () => true,
      mailto: 'a@b.com',
      ...over,
    },
  }
}

describe('evaluate', () => {
  it('후보 전부에 판정을 남긴다', async () => {
    const d = deps()
    const r = await evaluate(d.value)
    expect(r.assessed).toBe(2)
    expect(d.saved).toHaveLength(2)
  })

  it('①단계에서 탈락하면 뒤 단계를 돌리지 않는다', async () => {
    let llmCalls = 0
    const d = deps({
      listPapers: async () => [paper('1', { authors: [] })],
      llm: async () => { llmCalls++; return '{"score": 0.5, "reason": "x"}' },
    })
    const r = await evaluate(d.value)
    expect(llmCalls).toBe(0)
    expect(r.assessed).toBe(1)
    const [row] = d.saved
    if (row === undefined) throw new Error('저장된 판정이 없다')
    expect(row.stage1).toMatchObject({ passed: false })
    expect(row.stage3).toBeNull()
  })

  it('한 논문이 실패해도 나머지는 계속한다', async () => {
    let n = 0
    const d = deps({
      llm: async (prompt: string) => {
        n++
        if (n === 1) throw new Error('rate limit')
        return prompt.includes('reproducibility') ? deepJson : '{"score": 0.7, "reason": "ok"}'
      },
    })
    const r = await evaluate(d.value)
    expect(r.failed).toBe(1)
    expect(r.assessed).toBe(1)
  })

  it('본문 정밀 평가는 상한만큼만 돌린다', async () => {
    let deepCalls = 0
    const many = Array.from({ length: 20 }, (_, i) => paper(String(i)))
    const d = deps({
      listPapers: async () => many,
      llm: async (prompt: string) => {
        if (prompt.includes('reproducibility')) { deepCalls++; return deepJson }
        return '{"score": 0.7, "reason": "ok"}'
      },
    })
    const r = await evaluate(d.value)
    expect(deepCalls).toBeLessThanOrEqual(6)
    expect(r.deep).toBe(deepCalls)
    expect(r.assessed).toBe(20)
  })

  it('잠금을 잡지 못하면 아무것도 하지 않는다', async () => {
    const d = deps({ lock: async () => false })
    const r = await evaluate(d.value)
    expect(r.assessed).toBe(0)
    expect(d.saved).toHaveLength(0)
  })

  it('평가할 논문이 없으면 조용히 끝난다', async () => {
    const d = deps({ listPapers: async () => [] })
    const r = await evaluate(d.value)
    expect(r.assessed).toBe(0)
  })

  it('저널 게재가 확인되면 검증 트랙으로 저장한다', async () => {
    const d = deps({
      listPapers: async () => [paper('1')],
      fetchWork: async () => ({
        cited_by_count: 5,
        primary_location: { source: { display_name: 'Nature', type: 'journal' } },
        authorships: [{ author: { display_name: 'Jane Doe' } }],
      }),
    })
    await evaluate(d.value)
    const [row] = d.saved
    if (row === undefined) throw new Error('저장된 판정이 없다')
    expect(row.track).toBe('verified')
  })
})
```

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm --filter @jogan/evaluator test index`
Expected: FAIL — `evaluate is not a function`

- [ ] **Step 4: 구현한다**

`services/evaluator/src/index.ts`를 통째로 바꾼다.

```ts
import { pathToFileURL } from 'node:url'
import {
  EVALUATOR_LOCK_KEY,
  EVAL_MAX_PER_RUN,
  OPENALEX_MIN_INTERVAL_MS,
  TRIAGE_DEEP_CUT,
  createHttpClient,
  type Evidence,
} from '@jogan/core'
import type { NewAssessment, UnassessedPaper } from '@jogan/db'
import Anthropic from '@anthropic-ai/sdk'
import { config } from 'dotenv'
import { fetchFullText } from './fulltext'
import { runStage1 } from './stage1'
import { fetchOpenAlexByArxivId, fieldFromCategories, parseOpenAlexWork, toStage2 } from './stage2'
import { deepEval, triage, type LlmFn } from './stage3'

config({ path: ['.env', '../../.env'], quiet: true })

function log(stage: string, msg: string): void {
  console.log(`[evaluator:${stage}] ${msg}`)
}

async function loadDb() {
  return import('@jogan/db')
}

export type EvaluateDeps = {
  listPapers?: (limit: number) => Promise<UnassessedPaper[]>
  saveAssessment?: (row: NewAssessment) => Promise<void>
  fetchWork?: (arxivId: string) => Promise<unknown | null>
  fetchBody?: (arxivId: string) => Promise<string | null>
  llm?: LlmFn
  lock?: () => Promise<boolean>
  mailto?: string
}

function anthropicLlm(): LlmFn {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY가 없다. .env에 넣어라 (console.anthropic.com에서 발급)')
  const client = new Anthropic({ apiKey: key })
  return async (prompt, input) => {
    const res = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      system: prompt,
      messages: [{ role: 'user', content: input }],
    })
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  }
}

/**
 * ①규칙 → ②OpenAlex → ③a 트리아지 → ③b 본문 정밀.
 * 논문 하나가 실패해도 나머지를 계속한다 (CLAUDE.md).
 */
export async function evaluate(deps: EvaluateDeps = {}): Promise<{ assessed: number; failed: number; deep: number }> {
  const lock = deps.lock ?? (async () => (await loadDb()).tryAdvisoryLock(EVALUATOR_LOCK_KEY))
  if (!(await lock())) {
    log('lock', '다른 평가 실행이 돌고 있다 — 이번 실행은 비켜준다')
    return { assessed: 0, failed: 0, deep: 0 }
  }

  const listPapers = deps.listPapers ?? (async (n: number) => (await loadDb()).listUnassessedCandidatePapers(n))
  const saveAssessment = deps.saveAssessment ?? (async (r: NewAssessment) => (await loadDb()).upsertAssessment(r))
  const mailto = deps.mailto ?? process.env.OPENALEX_MAILTO ?? ''

  const openalex = createHttpClient({ minIntervalMs: OPENALEX_MIN_INTERVAL_MS, maxRetries: 2, timeoutMs: 30_000 }, {})
  const arxiv = createHttpClient({ minIntervalMs: 3000, maxRetries: 2, timeoutMs: 90_000 }, {})
  const fetchWork = deps.fetchWork ?? ((id: string) => fetchOpenAlexByArxivId(openalex, id, mailto))
  const fetchBody = deps.fetchBody ?? ((id: string) => fetchFullText(arxiv, id))

  const papers = await listPapers(EVAL_MAX_PER_RUN)
  if (papers.length === 0) {
    log('done', '평가할 후보가 없다')
    return { assessed: 0, failed: 0, deep: 0 }
  }
  log('start', `후보 ${papers.length}편`)

  const llm = deps.llm ?? anthropicLlm()

  // ①②③a — 통과한 것만 모아 순위를 매긴다
  type Pending = {
    paper: UnassessedPaper
    row: NewAssessment
    evidence: Evidence[]
    caveats: string[]
    score: number
  }
  const pending: Pending[] = []
  let assessed = 0
  let failed = 0

  for (const p of papers) {
    try {
      const s1 = runStage1({ title: p.title, abstract: p.abstract, authors: p.authors, doi: p.doi })
      const field = fieldFromCategories(p.categories)

      if (!s1.stage1.passed) {
        await saveAssessment({
          paperId: p.id,
          track: 'notable',
          field,
          stage1: s1.stage1,
          stage2: { venueTier: null, reviewStatus: 'preprint', reviewScore: null, authorTrackRecord: 0 },
          stage3: null,
          stage4: null,
          evidence: s1.evidence,
          caveats: s1.caveats,
        })
        assessed++
        continue
      }

      const work = p.arxivId === null ? null : await fetchWork(p.arxivId).catch(() => null)
      const s2 = toStage2(parseOpenAlexWork(work))
      const score = (await triage(llm, p)) ?? 0

      pending.push({
        paper: p,
        row: {
          paperId: p.id,
          track: s2.track,
          field,
          stage1: s1.stage1,
          stage2: s2.stage2,
          stage3: null,
          stage4: null,
          evidence: [...s1.evidence, ...s2.evidence],
          caveats: [...s1.caveats, ...s2.caveats],
        },
        evidence: [...s1.evidence, ...s2.evidence],
        caveats: [...s1.caveats, ...s2.caveats],
        score,
      })
    } catch (err) {
      failed++
      log('stage', `평가 실패로 건너뜀 ${p.id}: ${String(err)}`)
    }
  }

  // ③b — 상위 몇 편만 본문을 읽는다
  const ranked = [...pending].sort((a, b) => b.score - a.score)
  const deepSet = new Set(ranked.slice(0, TRIAGE_DEEP_CUT).map((x) => x.paper.id))
  let deep = 0

  for (const item of pending) {
    try {
      if (deepSet.has(item.paper.id)) {
        const body = item.paper.arxivId === null ? null : await fetchBody(item.paper.arxivId)
        const d = await deepEval(llm, item.paper, body)
        if (d !== null) {
          item.row.stage3 = d.stage3
          item.row.evidence = [...item.evidence, ...d.evidence]
          item.row.caveats = [...item.caveats, ...d.caveats]
          deep++
        }
      }
      await saveAssessment(item.row)
      assessed++
    } catch (err) {
      failed++
      log('stage3', `정밀 평가 실패로 건너뜀 ${item.paper.id}: ${String(err)}`)
    }
  }

  log('done', `판정 ${assessed}편 · 본문 평가 ${deep}편 · 실패 ${failed}편`)
  return { assessed, failed, deep }
}

async function main(): Promise<void> {
  const started = Date.now()
  const r = await evaluate()
  log('done', `${((Date.now() - started) / 1000).toFixed(1)}초`)
  if (r.assessed === 0 && r.failed > 0) throw new Error('전부 실패했다 — API 키나 연결을 확인해라')
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
}
```

`services/evaluator/package.json`의 `dependencies`에 `"@anthropic-ai/sdk": "^0.68.0"`을 추가하고 `pnpm install`을 돌린다. 설치된 실제 버전이 다르면 그 버전을 쓴다.

모델 이름 `claude-sonnet-5`가 SDK에서 거부되면 리포트에 적고, SDK가 받는 이름으로 맞춘다.

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @jogan/evaluator test && pnpm typecheck`
Expected: 전부 PASS, tsc 에러 0

- [ ] **Step 6: `ANTHROPIC_API_KEY` 없이 실행한다**

```bash
pnpm pipeline:evaluate
```

Expected: ①②는 돌고 ③a에서 `ANTHROPIC_API_KEY가 없다`로 죽는다(exit 1). **이게 의도된 동작이다.** 죽기 전에 ①단계 탈락 논문이 저장됐는지 확인한다:

```bash
docker exec jogan-db psql -U jogan -d jogan -c "select count(*) from assessments"
```

- [ ] **Step 7: 커밋**

```bash
git add services/evaluator .env.example README.md pnpm-lock.yaml
git commit -m "evaluator: 오케스트레이션과 Anthropic 연결

①규칙에서 탈락하면 뒤 단계를 돌리지 않고, 통과분만 ②③으로 보낸다.
본문 정밀 평가는 트리아지 상위 TRIAGE_DEEP_CUT편으로 제한한다.
논문 하나가 실패해도 나머지를 계속한다."
```

---

### Task 9: 옵트인 라이브 테스트

**Files:**
- Create: `services/evaluator/src/live.test.ts`

- [ ] **Step 1: 라이브 테스트를 쓴다**

```ts
import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { OPENALEX_MIN_INTERVAL_MS, createHttpClient } from '@jogan/core'
import { fetchFullText } from './fulltext'
import { fetchOpenAlexByArxivId, parseOpenAlexWork } from './stage2'

config({ path: ['.env', '../../.env'], quiet: true })

// 실제 외부 API를 부른다. 기본 `pnpm test`에서는 돌지 않는다.
//   EVALUATOR_LIVE_TEST=1 pnpm --filter @jogan/evaluator test live
const live = process.env.EVALUATOR_LIVE_TEST === '1'

describe.skipIf(!live)('실호출', () => {
  // 널리 알려진 arXiv 논문 (Attention Is All You Need). OpenAlex에 확실히 색인돼 있다.
  it('OpenAlex에서 실제 논문을 찾는다', async () => {
    const client = createHttpClient({ minIntervalMs: OPENALEX_MIN_INTERVAL_MS, maxRetries: 2, timeoutMs: 30_000 }, {})
    const json = await fetchOpenAlexByArxivId(client, '1706.03762', process.env.OPENALEX_MAILTO ?? 'test@example.com')
    expect(json).not.toBeNull()
    const work = parseOpenAlexWork(json)
    expect(work).not.toBeNull()
    expect(work?.citedByCount).toBeGreaterThan(1000)
  }, 60_000)

  it('색인되지 않은 id는 null이다', async () => {
    const client = createHttpClient({ minIntervalMs: OPENALEX_MIN_INTERVAL_MS, maxRetries: 2, timeoutMs: 30_000 }, {})
    expect(await fetchOpenAlexByArxivId(client, '9999.99999', 'test@example.com')).toBeNull()
  }, 60_000)

  it('arXiv에서 실제 본문을 가져온다', async () => {
    const client = createHttpClient({ minIntervalMs: 3000, maxRetries: 2, timeoutMs: 90_000 }, {})
    const text = await fetchFullText(client, '1706.03762')
    if (text === null) {
      // 오래된 논문은 HTML이 없을 수 있다. 그건 실패가 아니다
      expect(text).toBeNull()
      return
    }
    expect(text.length).toBeGreaterThan(5000)
  }, 120_000)
})
```

- [ ] **Step 2: 기본 실행에서 전부 스킵되는지 확인한다**

Run: `pnpm test`
Expected: evaluator에서 3개 skipped. 네트워크 호출 없음. 실행 시간이 1초 미만이어야 한다.

- [ ] **Step 3: 옵트인 실행으로 확인한다**

Run: `EVALUATOR_LIVE_TEST=1 pnpm --filter @jogan/evaluator test live`
Expected: 3개 PASS. **`fetchOpenAlexByArxivId`의 URL 형식이 틀려서 첫 테스트가 404를 받으면, OpenAlex 문서를 보고 형식을 고친 뒤 Task 4의 구현도 함께 고친다. 리포트에 무엇을 바꿨는지 적어라.**

- [ ] **Step 4: 커밋**

```bash
git add services/evaluator/src/live.test.ts services/evaluator/src/stage2.ts
git commit -m "evaluator: OpenAlex·arXiv 실호출 테스트 (opt-in)

EVALUATOR_LIVE_TEST=1일 때만 돈다. 기본 테스트는 네트워크 없이 유지한다."
```

---

### Task 10: 전체 검증과 기록

**Files:** 없음 (검증만) — 단 `HISTORY.md`에 항목 추가

- [ ] **Step 1: 클린 실행**

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm test
pnpm build
git status --short
```
Expected: 전부 종료 코드 0, `git status`는 빈 출력.

- [ ] **Step 2: `ANTHROPIC_API_KEY`가 있으면 실제 실행**

```bash
pnpm pipeline:evaluate
```

키가 없으면 ③에서 죽는다. **그 경우 이 단계는 "미검증"으로 보고하고 넘어간다. 모킹으로 통과했다고 실제로 돈 것처럼 적지 마라.**

- [ ] **Step 3: 결과를 사람이 볼 수 있게 정리한다**

```bash
docker exec jogan-db psql -U jogan -d jogan \
  -c "select count(*) 판정, count(*) filter (where (stage1->>'passed')::bool) 통과, count(stage3) 본문평가 from assessments" \
  -c "select track, count(*) from assessments group by track" \
  -c "select left(p.title,55) title, jsonb_array_length(a.evidence) 근거수, a.caveats
      from assessments a join papers p on p.id=a.paper_id
      where a.stage3 is not null order by p.title limit 6" \
  -c "select e->>'text' 근거문장 from assessments a, jsonb_array_elements(a.evidence) e
      where a.stage3 is not null limit 12"
```

이 네 표를 리포트에 그대로 붙인다.

- [ ] **Step 4: 재현율 우선 설계를 검증한다**

이게 이번 작업의 **가장 중요한 확인**이다. 관련성 단계에서 `수면과 기억 공고화` 관심사에
걸린 후보 17편은 대부분 "기억"이라는 단어만 겹친 무관한 논문이다 (`HISTORY.md` 2026-09-29).

```bash
docker exec jogan-db psql -U jogan -d jogan -c "
select left(p.title,50) title,
       (a.stage1->>'passed')::bool 통과,
       round(((a.stage3->'claimVsEvidence'->>'value')::numeric),2) 주장대증거
from paper_candidates c
join interests i on i.id = c.interest_id
join papers p on p.id = c.paper_id
left join assessments a on a.paper_id = p.id
where i.label = '수면과 기억 공고화'
order by c.relevance desc limit 10"
```

**evaluator가 이 논문들을 낮게 평가하는가?** 답을 리포트에 명확히 적어라.
걸러내지 못한다면 그 사실이 관련성 단계로 돌아가야 한다는 신호다 — 숨기지 마라.

- [ ] **Step 5: `HISTORY.md`에 기록한다**

파일 맨 위 `---` 바로 다음에 날짜 항목을 추가한다 (최신이 위). 담을 것:

- 판정한 편수, ①단계 통과/탈락, 본문 평가 편수, 트랙 분포
- 실제 근거 문장 샘플 3~5개 (사용자에게 보일 문장이다 — 읽을 만한가?)
- 원문 대조로 버려진 근거 문장이 있었는지, 몇 개인지
- 실제 토큰 사용량과 소요 시간
- Step 4의 답
- `TRIAGE_DEEP_CUT = 6`이 적절해 보이는지에 대한 소견. **값은 바꾸지 말고 소견만 적어라**

- [ ] **Step 6: 커밋**

```bash
git add HISTORY.md
git commit -m "docs: evaluator 첫 실행 결과 기록"
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | 담당 Task |
|---|---|
| ①단계 4가지 검사, "DOI 없음" 제외 | Task 3 |
| 철회 조회(Crossref) | **Task 3에서 caveat만 남기고 실제 조회는 하지 않는다** — DOI가 2%뿐이라 조회할 대상이 거의 없다. `CROSSREF_API` 상수만 Task 1에서 만들어 두고, 다른 출처가 붙어 DOI 비율이 올라갈 때 붙인다. 스펙 대비 축소이므로 Task 10 리포트에 적는다 |
| ②단계 OpenAlex 매핑·트랙·색인 전 처리 | Task 4 |
| `field` 판정 | Task 4 (`fieldFromCategories`) |
| ①단계 탈락 논문의 track | Task 8 (`'notable'`로 저장) |
| ③a 트리아지 · ③b 정밀 | Task 7 |
| 본문 없을 때 `value: null` | Task 7 (`deepEval`의 `header`와 caveat) |
| 절대 규칙 1 대조 | Task 6 + Task 7 |
| 절대 규칙 4 본문 미저장 | Task 5 (주석 + `fetchFullText`가 반환만 함, 저장 경로 없음) |
| 스키마 nullable + 마이그레이션 | Task 2 |
| `http.ts` 이동 | Task 1 |
| 상수 5개 | Task 1 |
| 실패 처리 (논문 단위 skip) | Task 8 |
| 중복 실행 가드 | Task 8 |
| 테스트 4종 | Task 3~7 단위, Task 9 라이브, Task 10 실행 |
| 완료 기준 · `수면과 기억 공고화` 검증 | Task 10 |

**2. 플레이스홀더 스캔**: 없음. Task 4의 OpenAlex URL 형식과 Task 8의 모델 이름은 "틀리면 고치고 리포트에 적어라"로 구체적 지시를 달았다.

**3. 타입 일관성**: `UnassessedPaper`(Task 2) → Task 8이 그 이름으로 소비. `Stage1Result`(Task 3) → Task 8이 `.stage1`·`.evidence`·`.caveats`로 접근. `Stage2Result`(Task 4)도 같은 모양. `LlmFn`(Task 7) → Task 8의 `EvaluateDeps.llm`. `NewAssessment`(Task 2) → Task 8의 `saveAssessment`. `keepVerifiedEvidence`(Task 6) → Task 7이 호출. `HttpClient`(Task 1) → Task 4·5가 소비. `fieldFromCategories`가 Task 4에서 정의되고 Task 8에서 같은 이름으로 쓰인다.

**4. 알려진 축소**: 철회 조회(Crossref)는 상수만 만들고 구현하지 않는다 — 위 표에 근거를 적었다.
