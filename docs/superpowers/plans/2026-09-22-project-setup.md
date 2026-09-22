# 프로젝트 세팅 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈 레포에서 `docker compose up -d && pnpm install && pnpm db:migrate && pnpm db:seed && pnpm typecheck && pnpm test && pnpm dev`가 전부 성공하고, Google 로그인 후 플레이스홀더 홈이 뜨는 상태를 만든다.

**Architecture:** pnpm 워크스페이스 모노레포. `packages/core`는 zod 스키마(의존성 zod만), `packages/db`는 Drizzle 스키마·마이그레이션·시드, `apps/web`은 Next.js App Router + Tailwind v3 + Auth.js, `services/*`는 tsx로 실행되는 독립 스크립트(이번엔 스텁). 공유 패키지는 빌드 없이 `.ts` 소스를 직접 export한다.

**Tech Stack:** Node 22, pnpm 12, TypeScript 5.9, Next.js 16.3, React 19.3, next-auth 5.0.0-beta.32 + @auth/drizzle-adapter 1.11, drizzle-orm 0.45 + drizzle-kit 0.31, postgres 3.4, zod 4.6, tailwindcss 3.4, vitest 5, tsx 4, Docker `pgvector/pgvector:pg17`.

**Spec:** `docs/superpowers/specs/2026-09-22-project-setup-design.md`

## Global Constraints

- 서버 로직에 `any` 금지. `tsconfig.base.json`은 `strict` + `noUncheckedIndexedAccess`.
- 컴포넌트에 hex 직접 쓰지 않는다. 색은 전부 `tailwind.config.ts` 토큰(`docs/DESIGN.md` §1 값 그대로).
- 실제 `<button>`/`<a>`/`<input>`+`<label>`. `div`에 `onClick` 금지. 터치 타깃 44px 이상.
- 마이그레이션은 파일로 남겨 커밋한다.
- 시드 데이터는 전부 허구. 파일 상단에 명시한다.
- 임베딩 차원은 `EMBEDDING_DIM = 1024` 한 곳에서만.
- 커밋 메시지는 한국어. 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- 패키지 이름: `@jogan/web` `@jogan/core` `@jogan/db` `@jogan/collector` `@jogan/evaluator` `@jogan/briefer`.
- `.env`는 레포 루트 하나. 각 패키지가 `../../.env`를 읽는다.

---

## 파일 구조

```
jogan/
├── package.json                      루트 스크립트, 공용 devDeps(typescript, vitest, tsx, @types/node)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md                         시작하기 + Google OAuth 절차
├── apps/web/
│   ├── package.json
│   ├── next.config.ts                dotenv 로드, transpilePackages, turbopack.root
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   ├── tailwind.config.ts            DESIGN.md 토큰
│   ├── auth.ts                       NextAuth 설정
│   ├── proxy.ts                      로그인 안 된 요청을 /login으로
│   ├── public/icon.svg
│   └── app/
│       ├── globals.css
│       ├── layout.tsx                폰트 <link>, 메타
│       ├── manifest.ts
│       ├── page.tsx                  플레이스홀더 홈
│       ├── login/page.tsx
│       └── api/auth/[...nextauth]/route.ts
├── packages/core/
│   ├── package.json, tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── constants.ts              EMBEDDING_DIM, enum 튜플들
│       ├── paper.ts  assessment.ts  interest.ts  brief.ts  saved.ts  user.ts
│       └── schemas.test.ts
├── packages/db/
│   ├── package.json, tsconfig.json, drizzle.config.ts
│   ├── migrations/                   drizzle-kit generate 결과
│   └── src/
│       ├── index.ts                  client + schema re-export
│       ├── env.ts                    dotenv 로드, DATABASE_URL
│       ├── client.ts
│       ├── schema/{index,auth,settings,papers,assessments,interests,briefs,saved}.ts
│       ├── seed-data.ts              순수 데이터 (DB 없음) — 테스트 대상
│       ├── seed-data.test.ts
│       └── seed.ts                   insert
└── services/
    ├── collector/{package.json,tsconfig.json,src/index.ts}
    ├── evaluator/{package.json,tsconfig.json,src/index.ts,prompts/deep-eval.md}
    └── briefer/{package.json,tsconfig.json,src/index.ts,prompts/README.md}
```

---

### Task 1: 워크스페이스 골격과 로컬 DB

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`, `.gitignore`

**Interfaces:**
- Produces: 루트 스크립트 이름(`dev`, `db:*`, `pipeline:*`, `test`, `typecheck`) — 이후 태스크는 이 이름으로 `--filter` 대상 패키지에 같은 이름의 스크립트를 만든다. `tsconfig.base.json`을 모든 패키지가 extends한다. `DATABASE_URL=postgres://jogan:jogan@localhost:5432/jogan`.

- [ ] **Step 1: 루트 package.json**

```json
{
  "name": "jogan",
  "private": true,
  "packageManager": "pnpm@12.5.1",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "pnpm --filter @jogan/web dev",
    "db:generate": "pnpm --filter @jogan/db generate",
    "db:migrate": "pnpm --filter @jogan/db migrate",
    "db:push": "pnpm --filter @jogan/db push",
    "db:seed": "pnpm --filter @jogan/db seed",
    "pipeline:collect": "pnpm --filter @jogan/collector start",
    "pipeline:evaluate": "pnpm --filter @jogan/evaluator start",
    "pipeline:brief": "pnpm --filter @jogan/briefer start",
    "pipeline:run": "pnpm pipeline:collect && pnpm pipeline:evaluate && pnpm pipeline:brief",
    "test": "pnpm -r --if-present test",
    "typecheck": "pnpm -r --if-present typecheck"
  },
  "devDependencies": {
    "@types/node": "^22.13.0",
    "tsx": "^4.23.15",
    "typescript": "^5.9.3",
    "vitest": "^5.0.1"
  }
}
```

- [ ] **Step 2: pnpm-workspace.yaml**

```yaml
packages:
  - apps/*
  - packages/*
  - services/*
onlyBuiltDependencies:
  - esbuild
  - sharp
```

- [ ] **Step 3: tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 4: docker-compose.yml**

```yaml
services:
  db:
    image: pgvector/pgvector:pg17
    container_name: jogan-db
    environment:
      POSTGRES_USER: jogan
      POSTGRES_PASSWORD: jogan
      POSTGRES_DB: jogan
    ports:
      - "5432:5432"
    volumes:
      - jogan-db:/var/lib/postgresql/data
volumes:
  jogan-db:
```

- [ ] **Step 5: .env.example 과 .gitignore**

`.env.example`:
```
# 로컬 Docker Postgres (docker-compose.yml)
DATABASE_URL=postgres://jogan:jogan@localhost:5432/jogan

# Auth.js — `openssl rand -base64 32`
AUTH_SECRET=

# Google Cloud 콘솔 > OAuth 클라이언트 (README.md 참고)
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# 시드 사용자. Google 로그인에 쓸 본인 이메일
SEED_USER_EMAIL=

# 파이프라인 세션부터 사용
ANTHROPIC_API_KEY=
```

`.gitignore`:
```
node_modules/
.next/
.env
*.tsbuildinfo
next-env.d.ts
.DS_Store
```

- [ ] **Step 6: 설치·DB 기동 확인**

```bash
cp .env.example .env
pnpm install
docker compose up -d
docker compose exec db psql -U jogan -d jogan -c "select 1"
```
Expected: `pnpm install` 성공(아직 워크스페이스 패키지 없음), psql이 `1` 한 행 출력.

- [ ] **Step 7: 커밋**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json docker-compose.yml .env.example .gitignore
git commit -m "pnpm 워크스페이스 골격과 로컬 pgvector 컨테이너

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `packages/core` — 도메인 스키마

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/constants.ts`, `packages/core/src/paper.ts`, `packages/core/src/assessment.ts`, `packages/core/src/interest.ts`, `packages/core/src/brief.ts`, `packages/core/src/saved.ts`, `packages/core/src/user.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/schemas.test.ts`

**Interfaces:**
- Produces (모두 `@jogan/core`에서 import):
  - 상수: `EMBEDDING_DIM: 1024`, `PAPER_SOURCES`, `VENUE_KINDS`, `TRACKS`, `FIELDS` (readonly 튜플 — Drizzle `pgEnum`에 그대로 전달)
  - zod 스키마와 동명 타입: `Paper`, `Author`, `Venue`, `Embedding`, `Assessment`, `Score`, `Stage1`~`Stage4`, `Evidence`, `Interest`, `Brief`, `BriefItem`, `SavedItem`, `FollowUp`, `User`, `UserSettings`
  - 스키마 값은 `Paper.parse(x)`, 타입은 `type Paper`. 같은 이름을 값과 타입으로 둘 다 export한다.

- [ ] **Step 1: 패키지 설정**

`packages/core/package.json`:
```json
{
  "name": "@jogan/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^4.6.5" }
}
```

`packages/core/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/core/src/schemas.test.ts`:
```ts
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
```

- [ ] **Step 3: 실패 확인**

```bash
pnpm install
pnpm --filter @jogan/core test
```
Expected: FAIL — `./index` 모듈 없음.

- [ ] **Step 4: 상수와 스키마 구현**

`packages/core/src/constants.ts`:
```ts
/** 임베딩 벡터 차원. 모델을 바꾸면 이 값과 DB 마이그레이션을 함께 바꾼다. */
export const EMBEDDING_DIM = 1024

export const PAPER_SOURCES = ['arxiv', 'biorxiv', 'medrxiv', 'pubmed', 'openalex'] as const
export const VENUE_KINDS = ['conference', 'journal', 'preprint'] as const
export const TRACKS = ['verified', 'notable'] as const
export const FIELDS = ['cs', 'bio_med', 'social', 'other'] as const
```

`packages/core/src/paper.ts`:
```ts
import { z } from 'zod'
import { EMBEDDING_DIM, PAPER_SOURCES, VENUE_KINDS } from './constants'

export const PaperSource = z.enum(PAPER_SOURCES)
export type PaperSource = z.infer<typeof PaperSource>

export const VenueKind = z.enum(VENUE_KINDS)
export type VenueKind = z.infer<typeof VenueKind>

export const Author = z.object({
  name: z.string().min(1),
  affiliation: z.string().optional(),
})
export type Author = z.infer<typeof Author>

export const Venue = z.object({
  name: z.string().min(1),
  kind: VenueKind,
})
export type Venue = z.infer<typeof Venue>

export const Embedding = z.array(z.number()).length(EMBEDDING_DIM)
export type Embedding = z.infer<typeof Embedding>

export const Paper = z.object({
  id: z.uuid(),
  doi: z.string().nullable(),
  arxivId: z.string().nullable(),
  title: z.string().min(1),
  authors: z.array(Author).min(1),
  abstract: z.string(),
  publishedAt: z.coerce.date(),
  source: PaperSource,
  venue: Venue.nullable(),
  pdfUrl: z.url().nullable(),
  codeUrl: z.url().nullable(),
  openAccess: z.boolean(),
  /** 수집 직후에는 없고 관련성 필터 전에 채워진다 */
  embedding: Embedding.nullable(),
  /** 프리프린트 ↔ 출판본 병합. 병합된 쪽이 살아남은 쪽의 id를 가리킨다 */
  mergedInto: z.uuid().nullable(),
})
export type Paper = z.infer<typeof Paper>
```

`packages/core/src/assessment.ts`:
```ts
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
```

`packages/core/src/interest.ts`:
```ts
import { z } from 'zod'
import { Embedding } from './paper'

export const Interest = z.object({
  id: z.uuid(),
  userId: z.string().min(1),
  label: z.string().min(1),
  embedding: Embedding.nullable(),
  seedPaperIds: z.array(z.uuid()),
})
export type Interest = z.infer<typeof Interest>
```

`packages/core/src/brief.ts`:
```ts
import { z } from 'zod'

export const BriefItem = z.object({
  paperId: z.uuid(),
  /** 곁가지(isSerendipity)는 관심사가 없다 */
  interestId: z.uuid().nullable(),
  position: z.number().int().min(0),
  oneLine: z.string().min(1),
  whyItMatters: z.string().min(1),
  method: z.string(),
  results: z.array(z.object({ label: z.string(), value: z.string() })),
  limitations: z.array(z.object({ bySource: z.enum(['author', 'ai']), text: z.string() })),
  quotes: z.array(z.object({ text: z.string(), locator: z.string() })),
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
```

`packages/core/src/saved.ts`:
```ts
import { z } from 'zod'

export const FollowUp = z.object({
  kind: z.enum(['accepted', 'refuted', 'updated']),
  text: z.string().min(1),
  at: z.coerce.date(),
})
export type FollowUp = z.infer<typeof FollowUp>

export const SavedItem = z.object({
  userId: z.string().min(1),
  paperId: z.uuid(),
  savedAt: z.coerce.date(),
  readAt: z.coerce.date().nullable(),
  memo: z.string().nullable(),
  followUp: FollowUp.nullable(),
})
export type SavedItem = z.infer<typeof SavedItem>
```

`packages/core/src/user.ts`:
```ts
import { z } from 'zod'

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
```

`packages/core/src/index.ts`:
```ts
export * from './constants'
export * from './paper'
export * from './assessment'
export * from './interest'
export * from './brief'
export * from './saved'
export * from './user'
```

- [ ] **Step 5: 테스트·타입 통과 확인**

```bash
pnpm --filter @jogan/core test
pnpm --filter @jogan/core typecheck
```
Expected: 테스트 전부 PASS, tsc 오류 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "core: PRD §4 데이터 모델을 zod 스키마로 정의

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `packages/db` — Drizzle 스키마와 첫 마이그레이션

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/env.ts`, `packages/db/src/client.ts`, `packages/db/src/schema/auth.ts`, `packages/db/src/schema/settings.ts`, `packages/db/src/schema/papers.ts`, `packages/db/src/schema/assessments.ts`, `packages/db/src/schema/interests.ts`, `packages/db/src/schema/briefs.ts`, `packages/db/src/schema/saved.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, `packages/db/migrations/0000_*.sql` (생성)

**Interfaces:**
- Consumes: `@jogan/core`의 `EMBEDDING_DIM`, `PAPER_SOURCES`, `TRACKS`, `FIELDS`와 jsonb `$type`용 타입들.
- Produces (`@jogan/db`에서 import): `db` (drizzle 인스턴스), `Db` 타입, 테이블 `users` `accounts` `sessions` `verificationTokens` `userSettings` `papers` `assessments` `interests` `briefs` `briefItems` `savedItems`, enum `paperSource` `assessmentTrack` `paperField`.

- [ ] **Step 1: 패키지 설정**

`packages/db/package.json`:
```json
{
  "name": "@jogan/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "push": "drizzle-kit push",
    "seed": "tsx src/seed.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@jogan/core": "workspace:*",
    "dotenv": "^18.0.2",
    "drizzle-orm": "^0.45.3",
    "postgres": "^3.4.9"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.11"
  }
}
```

`packages/db/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "drizzle.config.ts"] }
```

- [ ] **Step 2: env와 client**

`packages/db/src/env.ts`:
```ts
import { config } from 'dotenv'

// 레포 루트의 .env 하나를 모든 패키지가 공유한다
config({ path: ['.env', '../../.env'], quiet: true })

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL이 없습니다. 레포 루트에서 `cp .env.example .env` 후 값을 채우세요.')
}

export const env = { DATABASE_URL: url }
```

`packages/db/src/client.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from './env'
import * as schema from './schema'

// prepare: false — Neon 풀링(pgbouncer) 호환
const sql = postgres(env.DATABASE_URL, { prepare: false })

export const db = drizzle(sql, { schema })
export type Db = typeof db
```

`packages/db/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit'
import { env } from './src/env'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url: env.DATABASE_URL },
  strict: true,
  verbose: true,
})
```

- [ ] **Step 3: Auth.js 테이블**

`packages/db/src/schema/auth.ts` (컬럼 키 이름은 `@auth/drizzle-adapter`가 요구하는 그대로, DB 컬럼명만 snake_case):
```ts
import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
)
```

`AdapterAccountType`을 쓰기 위해 db 패키지 devDependencies에 `"next-auth": "5.0.0-beta.32"`를 추가한다 (타입만 사용).

- [ ] **Step 4: 도메인 테이블**

`packages/db/src/schema/settings.ts`:
```ts
import { boolean, integer, pgTable, text, time, timestamp } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  departureTime: time('departure_time').notNull(),
  papersPerDay: integer('papers_per_day').notNull().default(4),
  includePreprints: boolean('include_preprints').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`packages/db/src/schema/papers.ts`:
```ts
import { EMBEDDING_DIM, PAPER_SOURCES, type Author, type Venue } from '@jogan/core'
import {
  boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid, vector, type AnyPgColumn,
} from 'drizzle-orm/pg-core'

export const paperSource = pgEnum('paper_source', PAPER_SOURCES)

export const papers = pgTable('papers', {
  id: uuid('id').primaryKey().defaultRandom(),
  doi: text('doi').unique(),
  arxivId: text('arxiv_id').unique(),
  title: text('title').notNull(),
  authors: jsonb('authors').$type<Author[]>().notNull(),
  abstract: text('abstract').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  source: paperSource('source').notNull(),
  venue: jsonb('venue').$type<Venue>(),
  pdfUrl: text('pdf_url'),
  codeUrl: text('code_url'),
  openAccess: boolean('open_access').notNull().default(false),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
  mergedInto: uuid('merged_into').references((): AnyPgColumn => papers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`packages/db/src/schema/assessments.ts`:
```ts
import {
  FIELDS, TRACKS, type Evidence, type Stage1, type Stage2, type Stage3, type Stage4,
} from '@jogan/core'
import { jsonb, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { papers } from './papers'

export const assessmentTrack = pgEnum('assessment_track', TRACKS)
export const paperField = pgEnum('paper_field', FIELDS)

/** 논문당 1행. 같은 논문을 두 번 평가하지 않도록 사용자 간 공유한다 */
export const assessments = pgTable('assessments', {
  paperId: uuid('paper_id').primaryKey().references(() => papers.id, { onDelete: 'cascade' }),
  track: assessmentTrack('track').notNull(),
  field: paperField('field').notNull(),
  stage1: jsonb('stage1').$type<Stage1>().notNull(),
  stage2: jsonb('stage2').$type<Stage2>().notNull(),
  stage3: jsonb('stage3').$type<Stage3>().notNull(),
  stage4: jsonb('stage4').$type<Stage4>().notNull(),
  evidence: jsonb('evidence').$type<Evidence[]>().notNull(),
  caveats: jsonb('caveats').$type<string[]>().notNull(),
  assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`packages/db/src/schema/interests.ts`:
```ts
import { EMBEDDING_DIM } from '@jogan/core'
import { jsonb, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core'
import { users } from './auth'

export const interests = pgTable('interests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
  seedPaperIds: jsonb('seed_paper_ids').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

`packages/db/src/schema/briefs.ts`:
```ts
import type { BriefItem } from '@jogan/core'
import {
  boolean, date, integer, pgTable, primaryKey, text, timestamp, unique, uuid, jsonb,
} from 'drizzle-orm/pg-core'
import { users } from './auth'
import { interests } from './interests'
import { papers } from './papers'

export const briefs = pgTable(
  'briefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    issueNumber: integer('issue_number').notNull(),
    readMinutes: integer('read_minutes').notNull().default(0),
    audioUrl: text('audio_url'),
    audioSeconds: integer('audio_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('briefs_user_date').on(t.userId, t.date)],
)

export const briefItems = pgTable(
  'brief_items',
  {
    briefId: uuid('brief_id').notNull().references(() => briefs.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    interestId: uuid('interest_id').references(() => interests.id, { onDelete: 'set null' }),
    oneLine: text('one_line').notNull(),
    whyItMatters: text('why_it_matters').notNull(),
    method: text('method').notNull(),
    results: jsonb('results').$type<BriefItem['results']>().notNull(),
    limitations: jsonb('limitations').$type<BriefItem['limitations']>().notNull(),
    quotes: jsonb('quotes').$type<BriefItem['quotes']>().notNull(),
    isSerendipity: boolean('is_serendipity').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.briefId, t.position] })],
)
```

`packages/db/src/schema/saved.ts`:
```ts
import type { FollowUp } from '@jogan/core'
import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './auth'
import { papers } from './papers'

export const savedItems = pgTable(
  'saved_items',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    paperId: uuid('paper_id').notNull().references(() => papers.id),
    savedAt: timestamp('saved_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    memo: text('memo'),
    followUp: jsonb('follow_up').$type<FollowUp>(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.paperId] })],
)
```

`packages/db/src/schema/index.ts`:
```ts
export * from './auth'
export * from './settings'
export * from './papers'
export * from './assessments'
export * from './interests'
export * from './briefs'
export * from './saved'
```

`packages/db/src/index.ts`:
```ts
export { db, type Db } from './client'
export * from './schema'
```

- [ ] **Step 5: 타입 확인**

```bash
pnpm install
pnpm --filter @jogan/db typecheck
```
Expected: 오류 0.

- [ ] **Step 6: 마이그레이션 생성 + vector 확장 추가**

```bash
pnpm db:generate
f=$(ls packages/db/migrations/0000_*.sql)
printf 'CREATE EXTENSION IF NOT EXISTS vector;\n--> statement-breakpoint\n%s\n' "$(cat "$f")" > "$f"
head -3 "$f"
```
Expected: `migrations/0000_<이름>.sql`과 `migrations/meta/` 생성. 첫 줄이 `CREATE EXTENSION IF NOT EXISTS vector;`.

- [ ] **Step 7: 마이그레이션 적용 확인**

```bash
pnpm db:migrate
docker compose exec db psql -U jogan -d jogan -c "\dt" -c "\d papers"
```
Expected: 11개 테이블(`__drizzle_migrations` 제외) 목록. `papers.embedding`이 `vector(1024)`.

- [ ] **Step 8: 커밋**

```bash
git add packages/db pnpm-lock.yaml
git commit -m "db: Drizzle 스키마와 첫 마이그레이션 (Auth.js 테이블 + 도메인 테이블 + pgvector)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `packages/db` — 시드 데이터

**Files:**
- Create: `packages/db/src/seed-data.ts`, `packages/db/src/seed.ts`
- Test: `packages/db/src/seed-data.test.ts`

**Interfaces:**
- Consumes: Task 2의 core 스키마, Task 3의 테이블.
- Produces: `buildSeed(userId: string, today: string): SeedData` — `{ interests: Interest[]; papers: Paper[]; assessments: Assessment[]; brief: Brief; saved: SavedItem[]; settings: UserSettings }`. `fakeEmbedding(seed: string): number[]`.

- [ ] **Step 1: 실패하는 테스트**

`packages/db/src/seed-data.test.ts`:
```ts
import { Assessment, Brief, EMBEDDING_DIM, Interest, Paper, SavedItem, UserSettings } from '@jogan/core'
import { describe, expect, it } from 'vitest'
import { buildSeed, fakeEmbedding } from './seed-data'

const seed = buildSeed('user_test', '2026-09-22')

describe('buildSeed', () => {
  it('모든 시드 객체가 core 스키마를 통과한다', () => {
    for (const p of seed.papers) Paper.parse(p)
    for (const a of seed.assessments) Assessment.parse(a)
    for (const i of seed.interests) Interest.parse(i)
    for (const s of seed.saved) SavedItem.parse(s)
    Brief.parse(seed.brief)
    UserSettings.parse(seed.settings)
  })

  it('관심사 3개, 오늘 브리핑 4편, 그중 곁가지 1편', () => {
    expect(seed.interests).toHaveLength(3)
    expect(seed.brief.items).toHaveLength(4)
    expect(seed.brief.items.filter((i) => i.isSerendipity)).toHaveLength(1)
    expect(seed.brief.date).toBe('2026-09-22')
  })

  it('브리핑 항목과 평가는 존재하는 논문만 가리킨다', () => {
    const ids = new Set(seed.papers.map((p) => p.id))
    for (const item of seed.brief.items) expect(ids.has(item.paperId)).toBe(true)
    for (const a of seed.assessments) expect(ids.has(a.paperId)).toBe(true)
    for (const s of seed.saved) expect(ids.has(s.paperId)).toBe(true)
  })

  it('심사 전 논문은 notable 트랙이고 하루 최대 2편', () => {
    const notable = seed.assessments.filter((a) => a.track === 'notable')
    expect(notable.length).toBeGreaterThanOrEqual(1)
    expect(notable.length).toBeLessThanOrEqual(2)
    for (const a of notable) {
      const paper = seed.papers.find((p) => p.id === a.paperId)
      expect(paper?.venue?.kind).toBe('preprint')
    }
  })

  it('저장 항목에 후속 소식이 하나 있다', () => {
    expect(seed.saved.some((s) => s.followUp?.kind === 'accepted')).toBe(true)
  })

  it('모든 userId가 인자로 받은 값이다', () => {
    for (const i of seed.interests) expect(i.userId).toBe('user_test')
    expect(seed.brief.userId).toBe('user_test')
    expect(seed.settings.userId).toBe('user_test')
  })
})

describe('fakeEmbedding', () => {
  it('길이가 EMBEDDING_DIM이고 결정적이며 단위 벡터다', () => {
    const a = fakeEmbedding('x')
    expect(a).toHaveLength(EMBEDDING_DIM)
    expect(fakeEmbedding('x')).toEqual(a)
    expect(fakeEmbedding('y')).not.toEqual(a)
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
    expect(norm).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
pnpm --filter @jogan/db test
```
Expected: FAIL — `./seed-data` 없음.

- [ ] **Step 3: 시드 데이터 구현**

`packages/db/src/seed-data.ts`:
```ts
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
        quotes: [{ text: 'stage-2 spindle density predicts overnight improvement (β = 0.31, 95% CI 0.12–0.50)', locator: 'Abstract' }],
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
        whyItMatters: '관심사 바깥의 곁가지. 딥워크 시간을 다루는 드문 현장 데이터다.',
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
pnpm --filter @jogan/db test
```
Expected: 전부 PASS.

- [ ] **Step 5: seed 스크립트**

`packages/db/src/seed.ts`:
```ts
import { eq } from 'drizzle-orm'
import { db } from './client'
import {
  assessments, briefItems, briefs, interests, papers, savedItems, userSettings, users,
} from './schema'
import { buildSeed } from './seed-data'

const SEED_USER_ID = '00000000-0000-4000-8000-000000000001'

function todayInSeoul(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

async function main() {
  const email = process.env.SEED_USER_EMAIL
  if (!email) throw new Error('SEED_USER_EMAIL이 없습니다. .env에 Google 로그인에 쓸 이메일을 넣으세요.')

  // 이미 Google 로그인으로 만들어진 사용자가 있으면 그 id를 쓴다
  await db.insert(users).values({ id: SEED_USER_ID, email, name: '조간 독자' }).onConflictDoNothing({ target: users.email })
  const user = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (!user) throw new Error('사용자 생성 실패')

  const seed = buildSeed(user.id, todayInSeoul())

  await db.insert(userSettings).values(seed.settings).onConflictDoNothing()
  await db.insert(papers).values(seed.papers).onConflictDoNothing()
  await db.insert(assessments).values(seed.assessments).onConflictDoNothing()
  await db.insert(interests).values(seed.interests).onConflictDoNothing()

  const { items, ...briefRow } = seed.brief
  await db.insert(briefs).values(briefRow).onConflictDoNothing()
  const brief = await db.query.briefs.findFirst({ where: eq(briefs.id, seed.brief.id) })
  if (brief) {
    await db.insert(briefItems).values(items.map((item) => ({ ...item, briefId: brief.id }))).onConflictDoNothing()
  }

  await db.insert(savedItems).values(seed.saved).onConflictDoNothing()

  console.log(`시드 완료: ${email} · 논문 ${seed.papers.length}편 · ${seed.brief.date} 브리핑 제${seed.brief.issueNumber}호`)
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
```

- [ ] **Step 6: 시드 실행·멱등성 확인**

`.env`의 `SEED_USER_EMAIL`에 본인 이메일을 넣은 뒤:
```bash
pnpm db:seed
pnpm db:seed
docker compose exec db psql -U jogan -d jogan -c "select count(*) from papers" -c "select count(*) from brief_items"
pnpm --filter @jogan/db typecheck
```
Expected: 두 번 다 "시드 완료" 출력, papers 5, brief_items 4 (두 번 돌려도 그대로). tsc 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add packages/db
git commit -m "db: 가상 시드 데이터 (논문 5편, 관심사 3개, 오늘 브리핑, 후속 소식)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `apps/web` — Next.js 골격과 디자인 토큰

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/tailwind.config.ts`, `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/manifest.ts`, `apps/web/public/icon.svg`

**Interfaces:**
- Produces: Tailwind 토큰 이름(`bg-paper`, `text-ink`, `font-display`, `font-body` 등 — DESIGN.md §1 표의 토큰명 그대로). `@/` → `apps/web/` 경로 별칭.

- [ ] **Step 1: 패키지·빌드 설정**

`apps/web/package.json`:
```json
{
  "name": "@jogan/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "next typegen && tsc --noEmit"
  },
  "dependencies": {
    "@auth/drizzle-adapter": "^1.11.3",
    "@jogan/core": "workspace:*",
    "@jogan/db": "workspace:*",
    "dotenv": "^18.0.2",
    "next": "^16.3.5",
    "next-auth": "5.0.0-beta.32",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  },
  "devDependencies": {
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "autoprefixer": "^10.6.1",
    "postcss": "^8.5.28",
    "tailwindcss": "^3.4.19"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2023"],
    "jsx": "preserve",
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from 'next'
import { config } from 'dotenv'

// 레포 루트의 .env 하나를 공유한다 (Auth.js·db가 process.env에서 읽는다)
config({ path: '../../.env', quiet: true })

const nextConfig: NextConfig = {
  transpilePackages: ['@jogan/core', '@jogan/db'],
  turbopack: { root: '../..' },
}

export default nextConfig
```

`apps/web/postcss.config.mjs`:
```js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
```

- [ ] **Step 2: Tailwind 토큰 (DESIGN.md §1·§2 그대로)**

`apps/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'

// docs/DESIGN.md §1 색, §2 폰트. 컴포넌트에서 hex를 직접 쓰지 않는다.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F7F4ED', raised: '#F1EDE2', subtle: '#FBFAF6' },
        surface: '#FFFFFF',
        ink: { DEFAULT: '#171512', body: '#241F19', soft: '#3C3730', dim: '#4A4438', muted: '#625C50' },
        line: { DEFAULT: '#DED7C9', strong: '#D3CBBA', hair: '#E2DBCC' },
        verified: {
          DEFAULT: '#23543D', bg: '#E2EDE5', surface: '#ECEFE9', line: '#CFDACD', deep: '#1B3F2C', hover: '#14351F',
        },
        caution: { DEFAULT: '#7A4A08', bg: '#F6E9CC', line: '#E8D9B6', surface: '#FDF6E7' },
        accent: '#9E3B22',
        night: {
          DEFAULT: '#171512', surface: '#221F1A', line: '#2C2924', track: '#33302A',
          text: '#F7F4ED', strong: '#FFFFFF', soft: '#D8D2C4', muted: '#8C8577', dim: '#ADA593',
          faint: '#625C50', fainter: '#4A463D', accent: '#A9CDB6',
        },
      },
      fontFamily: {
        display: ['"Nanum Myeongjo"', 'serif'],
        body: ['"IBM Plex Sans KR"', 'sans-serif'],
      },
      maxWidth: { prose: '660px' },
      screens: { tablet: '720px', desktop: '1080px' },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 3: 전역 스타일·레이아웃·매니페스트**

`apps/web/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { @apply bg-paper text-ink-body font-body antialiased; }
}
```

`apps/web/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: '조간 논문',
  description: '매일 아침, 믿을 만한 논문 4편',
  appleWebApp: { capable: true, title: '조간 논문', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#F7F4ED',
  width: 'device-width',
  initialScale: 1,
}

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
```

`apps/web/app/manifest.ts`:
```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '조간 논문',
    short_name: '조간',
    description: '매일 아침, 믿을 만한 논문 4편',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F4ED',
    theme_color: '#F7F4ED',
    lang: 'ko',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
```

`apps/web/public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#F7F4ED"/>
  <text x="256" y="330" text-anchor="middle" font-family="Nanum Myeongjo, serif" font-weight="800" font-size="220" fill="#171512">朝</text>
</svg>
```

`apps/web/app/page.tsx` (임시 — Task 6에서 인증 붙이며 교체):
```tsx
export default function HomePage() {
  return (
    <main className="mx-auto max-w-prose px-5 py-10">
      <h1 className="font-display text-[27px] font-extrabold tracking-[-1px] text-ink">조간 논문</h1>
      <div className="mt-2 h-[2px] bg-ink" />
      <p className="mt-6 text-ink-muted">브리핑 준비 중</p>
    </main>
  )
}
```

- [ ] **Step 4: 실행·타입 확인**

```bash
pnpm install
pnpm --filter @jogan/web typecheck
pnpm dev &
sleep 8
curl -s http://localhost:3000 | grep -o '조간 논문' | head -1
curl -s http://localhost:3000/manifest.webmanifest | head -c 200
kill %1
```
Expected: tsc 오류 0. 첫 curl이 `조간 논문` 출력, 매니페스트 JSON에 `"name":"조간 논문"`.

- [ ] **Step 5: 커밋**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "web: Next.js 골격, DESIGN.md 토큰을 Tailwind theme에 등록, PWA 매니페스트

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `apps/web` — Auth.js + Google 로그인

**Files:**
- Create: `apps/web/auth.ts`, `apps/web/proxy.ts`, `apps/web/app/api/auth/[...nextauth]/route.ts`, `apps/web/app/login/page.tsx`, `README.md`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `@jogan/db`의 `db`, `users`, `accounts`, `sessions`, `verificationTokens`.
- Produces: `@/auth`의 `auth()`, `signIn`, `signOut`, `handlers`. 이후 모든 서버 컴포넌트는 `const session = await auth()`로 사용자를 얻는다.

- [ ] **Step 1: NextAuth 설정과 라우트**

`apps/web/auth.ts`:
```ts
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { accounts, db, sessions, users, verificationTokens } from '@jogan/db'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // 시드로 먼저 만든 사용자(이메일만 있음)에 Google 계정을 연결하기 위해 허용.
  // Google은 이메일을 검증해서 주므로 안전하다.
  providers: [Google({ allowDangerousEmailAccountLinking: true })],
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
})
```

`apps/web/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from '@/auth'

export const { GET, POST } = handlers
```

- [ ] **Step 2: 프록시 (로그인 안 된 요청 리다이렉트)**

`apps/web/proxy.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = ['/login', '/api/auth']
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token']

// 세션 쿠키 유무만 본다. 실제 검증은 각 페이지의 auth()가 한다.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()
  if (SESSION_COOKIES.some((c) => req.cookies.has(c))) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
}
```

- [ ] **Step 3: 로그인 페이지와 홈**

`apps/web/app/login/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/')

  return (
    <main className="mx-auto flex min-h-dvh max-w-prose flex-col items-center justify-center px-5">
      <h1 className="font-display text-[27px] font-extrabold tracking-[-1px] text-ink">조간 논문</h1>
      <p className="mt-2 text-sm text-ink-muted">매일 아침, 믿을 만한 논문 4편</p>
      <form
        className="mt-10 w-full max-w-xs"
        action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/' })
        }}
      >
        <button
          type="submit"
          className="h-[54px] w-full rounded-xl bg-ink font-medium text-paper hover:bg-ink-body"
        >
          Google로 계속하기
        </button>
      </form>
    </main>
  )
}
```

`apps/web/app/page.tsx` (교체):
```tsx
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/auth'

export default async function HomePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <main className="mx-auto max-w-prose px-5 py-10">
      <header className="flex items-end justify-between">
        <h1 className="font-display text-[27px] font-extrabold tracking-[-1px] text-ink">조간 논문</h1>
        <span className="text-xs text-ink-muted">{session.user.email}</span>
      </header>
      <div className="mt-2 h-[2px] bg-ink" />
      <p className="mt-6 text-ink-muted">브리핑 준비 중 — 화면은 다음 단계에서 붙습니다.</p>
      <form
        className="mt-10"
        action={async () => {
          'use server'
          await signOut({ redirectTo: '/login' })
        }}
      >
        <button type="submit" className="h-11 rounded-lg border border-line-strong px-4 text-sm text-ink-dim">
          로그아웃
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: README — 시작하기와 Google OAuth 절차**

`README.md`:
```markdown
# jogan — 조간 논문

매일 아침 믿을 만한 논문 4편을 골라 요약해 배달하는 PWA. 기획은 `docs/PRD.md`, 디자인은 `docs/DESIGN.md`, 개발 규칙은 `CLAUDE.md`.

## 시작하기

```bash
cp .env.example .env        # 아래 값들을 채운다
pnpm install
docker compose up -d        # 로컬 Postgres + pgvector
pnpm db:migrate
pnpm db:seed                # SEED_USER_EMAIL 필요
pnpm dev                    # http://localhost:3000
```

## .env 채우기

- `AUTH_SECRET` — `openssl rand -base64 32`
- `SEED_USER_EMAIL` — Google 로그인에 쓸 본인 이메일. 시드 브리핑이 이 사용자에게 붙는다.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — 아래 절차

### Google OAuth 클라이언트 만들기

1. https://console.cloud.google.com → 프로젝트 생성(또는 선택)
2. **API 및 서비스 → OAuth 동의 화면** → 외부, 앱 이름 `조간 논문`, 본인 이메일. 테스트 사용자에 본인과 멘토 이메일 추가
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 웹 애플리케이션
   - 승인된 JavaScript 원본: `http://localhost:3000`
   - 승인된 리디렉션 URI: `http://localhost:3000/api/auth/callback/google`
4. 발급된 클라이언트 ID·보안 비밀을 `.env`에 넣는다

배포 후에는 배포 도메인으로 원본·리디렉션 URI를 하나씩 더 추가한다.

## 명령어

`CLAUDE.md` §명령어 참고.
```

- [ ] **Step 5: 로그인 흐름 확인**

`.env`에 `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`을 채운 뒤:
```bash
pnpm --filter @jogan/web typecheck
pnpm dev
```
브라우저에서:
1. `http://localhost:3000` → `/login`으로 리다이렉트되는지
2. "Google로 계속하기" → Google 동의 → `/`에 이메일이 보이는지
3. `docker compose exec db psql -U jogan -d jogan -c "select email from users" -c "select provider from accounts"` → 시드 이메일 1행, `google` 1행 (사용자가 새로 생기지 않고 시드 사용자에 연결됨)
4. 로그아웃 → `/login`으로

Expected: 전부 성공. tsc 오류 0.

Google 클라이언트를 아직 못 만들었다면 1번과 tsc만 확인하고 나머지는 사용자에게 남긴다 — 이 태스크는 그래도 커밋한다.

- [ ] **Step 6: 커밋**

```bash
git add apps/web README.md pnpm-lock.yaml
git commit -m "web: Auth.js + Google 로그인, 로그인 페이지, 세션 가드 프록시

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `services/*` 스텁과 프롬프트 파일

**Files:**
- Create: `services/collector/package.json`, `services/collector/tsconfig.json`, `services/collector/src/index.ts`, `services/evaluator/package.json`, `services/evaluator/tsconfig.json`, `services/evaluator/src/index.ts`, `services/evaluator/prompts/deep-eval.md`, `services/briefer/package.json`, `services/briefer/tsconfig.json`, `services/briefer/src/index.ts`, `services/briefer/prompts/README.md`

**Interfaces:**
- Produces: 각 서비스의 `start` 스크립트. 루트 `pipeline:*`가 이를 호출한다. 프롬프트 파일 경로 `services/evaluator/prompts/deep-eval.md`.

- [ ] **Step 1: 세 서비스 패키지 (이름만 다르게 세 번)**

`services/collector/package.json`:
```json
{
  "name": "@jogan/collector",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  }
}
```
`services/evaluator/package.json`은 `"name": "@jogan/evaluator"`, `services/briefer/package.json`은 `"name": "@jogan/briefer"`로 같은 내용.

세 곳의 `tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

`services/collector/src/index.ts`:
```ts
// 수집 · 중복 제거. 아직 구현 전 — pipeline:collect가 돌아가게 하는 자리표시자.
console.log(`[collector] ${new Date().toISOString()} 아직 구현되지 않았습니다. 수집 대상: arXiv (MVP)`)
```

`services/evaluator/src/index.ts`:
```ts
// 4단계 신뢰도 필터. 아직 구현 전 — pipeline:evaluate가 돌아가게 하는 자리표시자.
console.log(`[evaluator] ${new Date().toISOString()} 아직 구현되지 않았습니다. 프롬프트: prompts/deep-eval.md`)
```

`services/briefer/src/index.ts`:
```ts
// 요약 · 사실 검증 · 오디오. 아직 구현 전 — pipeline:brief가 돌아가게 하는 자리표시자.
console.log(`[briefer] ${new Date().toISOString()} 아직 구현되지 않았습니다.`)
```

- [ ] **Step 2: 프롬프트 파일**

`services/evaluator/prompts/deep-eval.md` (`docs/PRD.md` §9를 옮김):
```markdown
# ③단계 내용 정밀 평가

입력: 논문 본문(오픈액세스 PDF 텍스트), 분야, 게재처 정보
출력: JSON — 항목별 { value, reason }, caveats[], evidence[]

## 평가 항목 (각 0~1 점수 + 근거 문장 1개)

1. reproducibility  코드·데이터 링크가 실제로 접근 가능한가. 환경·시드가 명시되었나
2. design           표본 크기와 대조군/베이스라인이 주장에 비해 충분한가. ablation이 있나
3. statistics       효과크기·신뢰구간을 보고했나. 다중 비교 보정을 했나
4. claimVsEvidence  초록의 주장 강도가 결과 범위를 넘지 않는가. 인과를 과하게 주장하지 않는가
5. limitations      한계를 성실히 적었는가. 적지 않은 한계를 네가 발견했다면 caveats에 넣어라

의학·생명 분야 추가: preregistered (ClinicalTrials.gov 등 사전등록 여부), studyDesign (RCT > 코호트 > 관찰 > 사례보고)

## 금지

- 본문에 없는 수치를 만들지 말 것
- 저자·소속의 명성을 점수에 반영하지 말 것 (그건 ②단계에서 이미 다룬다)
- 판단이 어려우면 낮은 점수 대신 value를 null로 두고 이유를 적어라
- 근거 문장이 없는 점수는 버려진다
```

`services/briefer/prompts/README.md`:
```markdown
요약·사실 검증 프롬프트가 여기에 들어간다. 코드에 인라인하지 않는다 (CLAUDE.md §코딩 규칙).
```

- [ ] **Step 3: 파이프라인 명령 확인**

```bash
pnpm install
pnpm pipeline:run
pnpm typecheck
pnpm test
```
Expected: 세 서비스 로그가 순서대로 출력되고 종료 코드 0. typecheck·test 전부 통과.

- [ ] **Step 4: 커밋**

```bash
git add services pnpm-lock.yaml
git commit -m "services: collector·evaluator·briefer 스텁과 deep-eval 프롬프트

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: 빈 환경에서 전체 흐름 재검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 클린 상태에서 다시 실행**

```bash
docker compose down -v
rm -rf node_modules apps/*/node_modules packages/*/node_modules services/*/node_modules apps/web/.next
pnpm install
docker compose up -d
sleep 3
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm test
pnpm pipeline:run
```
Expected: 전부 종료 코드 0. 실패하면 해당 태스크로 돌아가 고치고 커밋한다.

- [ ] **Step 2: git 상태 확인**

```bash
git status --short
```
Expected: 출력 없음 (`.env`는 gitignore, `next-env.d.ts`도 gitignore).

---

## Self-Review

- **Spec coverage:** 결정 사항(다중 사용자·Auth.js·Vercel+Neon 기록·pnpm only·소스 export·zod core·Tailwind v3·EMBEDDING_DIM) → Task 1~6. 테이블 11개 → Task 3. 시드 구성(사용자 1·관심사 3·논문 4+1·브리핑·후속 소식·멱등) → Task 4. web(토큰·폰트·매니페스트·auth·proxy·login·placeholder) → Task 5·6. services 스텁·프롬프트 → Task 7. 루트 명령어 → Task 1. 테스트 → Task 2·4. 환경변수·README → Task 1·6. 완료 기준 → Task 8. CLAUDE.md 변경은 스펙 커밋 때 이미 반영됨.
- **Placeholder scan:** 없음. 서비스 `index.ts`의 "아직 구현되지 않았습니다"는 의도된 런타임 메시지다.
- **Type consistency:** `PAPER_SOURCES`/`TRACKS`/`FIELDS` 튜플을 core에서 export하고 db `pgEnum`이 소비. `BriefItem`에 `id` 없음, DB PK `(brief_id, position)`. `buildSeed(userId, today)` 시그니처가 테스트·seed.ts에서 동일. 테이블 export 이름(`users`, `accounts`, `sessions`, `verificationTokens`, `userSettings`, `papers`, `assessments`, `interests`, `briefs`, `briefItems`, `savedItems`)이 Task 3·4·6에서 동일.

---

## 실행 결과 (2026-09-22)

브랜치 `feat/project-setup`, 8커밋. 전 태스크 리뷰 통과, 클린 환경 재검증 통과.

### 다음 계획으로 이월한 항목

- **행→도메인 매퍼** (`packages/db/src/queries/`): 읽기는 전부 core `.parse()`를 거친다. `saved_items.follow_up.at`(ISO 문자열 → `coerce.date`), `user_settings.departure_time`(`HH:mm:ss` → `slice(0,5)`)이 여기서 해결된다.
- `packages/db/src/client.ts` — `next dev` HMR용 `globalThis` 캐시, `max`/`idle_timeout` 설정
- 폰트를 `<link>`에서 `next/font/google`로 (서비스워커 세션과 함께)
- 매니페스트 PNG 아이콘(180/192/512), FK 인덱스 + HNSW 마이그레이션
- `next-auth` devDep을 `@auth/core/adapters` import로 대체 (db 패키지 프레임워크 독립)
- Google 동의 화면이 테스트 모드를 벗어나기 전 `ALLOWED_EMAILS` 허용 목록
- `requireUser()` 헬퍼, `/api/*`에는 307 대신 401
- User/Author 단독 스키마 테스트 (온보딩 폼과 함께)
