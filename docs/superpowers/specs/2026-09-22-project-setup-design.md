# 프로젝트 세팅 설계 — 골격 · 도메인 타입 · DB 스키마 · 인증

2026-09-22. `CLAUDE.md` 작업 순서 1번("packages/core에 도메인 타입, packages/db에 스키마")과 그 전제가 되는 레포 골격을 다룬다. 화면·파이프라인 본체는 범위 밖이다.

## 목표

다음 명령이 빈 환경에서 전부 성공한다.

```bash
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm typecheck
pnpm test
pnpm dev        # /login → Google 로그인 → / 플레이스홀더
```

## 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 사용자 | 다중 사용자, 처음부터 인증 | 배포해서 본인과 멘토들이 쓴다 |
| 인증 | Auth.js(next-auth v5) + Google + `@auth/drizzle-adapter`, DB 세션 | Next.js와 가장 자연스럽고 DB 선택과 독립 |
| 호스팅 | Vercel + Neon. 로컬은 Docker `pgvector/pgvector:pg17` | CLAUDE.md "교체 가능" 항목의 기본값. CLAUDE.md에 기록 |
| 모노레포 | pnpm workspaces만, Turborepo 없음 | 패키지 6개 규모에 캐시 이득 없음 |
| 공유 패키지 소비 | `.ts` 소스 직접 export. web은 `transpilePackages`, 서비스는 `tsx` | 빌드 단계 제거 |
| 타입 정의 | `packages/core`에 zod 스키마, 타입은 `z.infer` | 외부 API 파싱 규칙과 도메인 타입을 한 곳에서 |
| Tailwind | v3 계열, `tailwind.config.ts` theme에 `docs/DESIGN.md` 토큰 | CLAUDE.md가 config 파일을 명시 |
| 임베딩 차원 | `EMBEDDING_DIM = 1024` 상수 | 모델 확정 전 기본값. 변경은 마이그레이션 한 번 |
| 커밋 메시지 | 한국어 | 레포 안 통일 |

## 레포 골격

```
jogan/
├── CLAUDE.md
├── docs/PRD.md, DESIGN.md, superpowers/specs/
├── package.json              워크스페이스 루트. CLAUDE.md의 명령어 전부
├── pnpm-workspace.yaml
├── tsconfig.base.json        strict, noUncheckedIndexedAccess, moduleResolution bundler
├── docker-compose.yml        pgvector/pgvector:pg17, 5432, 볼륨
├── .env.example
├── apps/web/                 Next.js App Router + Tailwind v3
├── packages/core/            zod 스키마 + 타입. 의존성은 zod만
├── packages/db/              Drizzle 스키마 · migrations/ · seed · client
└── services/{collector,evaluator,briefer}/
                              독립 실행 스크립트. 이번엔 진입점 스텁 + prompts/
```

패키지 이름은 `@jogan/web` `@jogan/core` `@jogan/db` `@jogan/collector` `@jogan/evaluator` `@jogan/briefer`.

## `packages/core`

`docs/PRD.md` §4의 타입을 zod로 옮긴다. 파일 단위:

- `paper.ts` — `Paper`, `PaperSource`, `Venue`, `Author`
- `assessment.ts` — `Assessment`, `Score`, `Track`, `Field`, `Evidence`, `Stage1..4`
- `interest.ts` — `Interest`
- `brief.ts` — `Brief`, `BriefItem`
- `saved.ts` — `SavedItem`, `FollowUp`
- `user.ts` — `User`, `UserSettings` (출발 시각 `HH:mm`, 하루 편수 1~5, 프리프린트 포함 여부)
- `constants.ts` — `EMBEDDING_DIM`
- `index.ts` — 전부 re-export

`Date`는 `z.coerce.date()`, `embedding`은 `z.array(z.number()).length(EMBEDDING_DIM)`. DB 행 → 도메인 객체 변환은 `packages/db`가 담당하고, core는 DB를 모른다.

## `packages/db`

### 테이블

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `users` `accounts` `sessions` `verification_tokens` | Auth.js 어댑터 표준 | 어댑터 문서 스키마 그대로 |
| `user_settings` | `user_id` PK/FK, `departure_time` time, `papers_per_day` int, `include_preprints` bool | 온보딩 값 |
| `papers` | `id` uuid, `doi`, `arxiv_id`, `title`, `authors` jsonb, `abstract`, `published_at`, `source` enum, `venue` jsonb, `pdf_url`, `code_url`, `open_access`, `embedding vector(1024)`, `merged_into` self-FK | `doi` unique(nullable), `arxiv_id` unique(nullable). HNSW 인덱스는 데이터 쌓인 뒤 |
| `assessments` | `paper_id` PK/FK, `track` enum, `field` enum, `stage1..4` jsonb, `evidence` jsonb, `caveats` jsonb, `assessed_at` | 논문당 1행. 사용자 간 공유 캐시 |
| `interests` | `id`, `user_id` FK, `label`, `embedding vector(1024)`, `seed_paper_ids` jsonb | |
| `briefs` | `id`, `user_id` FK, `date` date, `issue_number`, `read_minutes`, `audio_url`, `audio_seconds` | `(user_id, date)` unique |
| `brief_items` | `id`, `brief_id` FK, `paper_id` FK, `interest_id` FK(nullable — 곁가지), `position`, `one_line`, `why_it_matters`, `method`, `results` jsonb, `limitations` jsonb, `quotes` jsonb, `is_serendipity` | `(brief_id, position)` unique |
| `saved_items` | `(user_id, paper_id)` PK, `saved_at`, `read_at`, `memo`, `follow_up` jsonb | |

jsonb 컬럼은 `$type<>()`으로 core 타입을 붙인다. enum은 pg enum.

### 파일

- `src/schema/*.ts` — 테이블별. `src/schema/index.ts`에서 모아 export
- `src/client.ts` — `postgres` + `drizzle`. `DATABASE_URL` 없으면 즉시 throw
- `src/seed.ts` — 아래 시드
- `drizzle.config.ts`, `migrations/` — `drizzle-kit generate` 결과를 커밋. `db:push`는 로컬 편의용
- 첫 마이그레이션에 `CREATE EXTENSION IF NOT EXISTS vector` 포함

### 시드

`docs/DESIGN.md`의 예시를 가상 데이터로 구성한다. 파일 상단에 "전부 허구, 실제 논문 아님"을 명시 (CLAUDE.md 규칙 5).

- 사용자 1명 (`SEED_USER_EMAIL` 환경변수, 기본은 `.env`의 값)
- 관심사 3개
- 논문 4편 (검증 3 + 심사 전 1) + 각 `assessments` (evidence 문장 포함)
- 오늘 날짜 브리핑 1호, 항목 4개 (1개는 `is_serendipity`)
- 저장 항목 1개 + `follow_up: accepted` ("그 뒤 *Sleep*에 채택")

임베딩은 결정적 의사난수(시드 고정)로 채운다. 시드는 멱등: 같은 논문 다시 넣지 않도록 `onConflictDoNothing`.

## `apps/web`

- `create-next-app` 기반 (App Router, TS, Tailwind, ESLint, `src/` 없음)
- `tailwind.config.ts` — DESIGN.md §1 색 전부, §2 폰트 패밀리 등록. 폰트는 `next/font/google`
- `app/manifest.ts` — PWA 매니페스트 (이름, 아이콘 자리, `display: standalone`). 서비스워커는 다음 세션
- `auth.ts` — NextAuth 설정. `app/api/auth/[...nextauth]/route.ts`
- `proxy.ts` — `/login`, `/api/auth/*`, `_next`, 정적 파일 외 전부 로그인 필요
- `app/login/page.tsx` — 제호 + "Google로 계속하기" 버튼 (실제 `<button>`, 44px 이상)
- `app/page.tsx` — 로그인 사용자 이메일 + "브리핑 준비 중" 플레이스홀더. DESIGN.md 화면은 다음 세션
- `next.config.ts` — `transpilePackages: ['@jogan/core', '@jogan/db']`

## `services/*`

각각 `package.json`, `tsconfig.json`, `src/index.ts`. `index.ts`는 이름과 시각을 로그하고 정상 종료한다 — `pipeline:*` 명령이 지금부터 돌아가게만 한다.

- `services/evaluator/prompts/deep-eval.md` — `docs/PRD.md` §9 루브릭을 옮김
- `services/briefer/prompts/` — 빈 디렉토리 대신 `README.md` 한 줄

## 루트 명령어

```json
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
```

## 테스트

vitest, 패키지별 설정.

- `packages/core` — 각 스키마에 대해 정상 예시 파싱 성공 / 필수 필드 누락·범위 밖 값 거부
- `packages/db` — 시드 데이터 객체가 core 스키마를 통과 (DB 연결 없이). 마이그레이션 적용은 `db:migrate` 수동 실행으로 확인

## 환경변수

```
DATABASE_URL=postgres://jogan:jogan@localhost:5432/jogan
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
ANTHROPIC_API_KEY=          # 파이프라인 세션부터 사용
SEED_USER_EMAIL=
```

Google OAuth 클라이언트는 사용자가 Google Cloud 콘솔에서 만든다. 리다이렉트 URI `http://localhost:3000/api/auth/callback/google`. README에 절차를 적는다.

## CLAUDE.md 변경

"교체 가능" 항목에 결정 기록: 호스팅 Vercel + Neon, 인증 Auth.js + Google, 다중 사용자. 배치 실행은 여전히 미정.

## 범위 밖

화면 6+2개, 서비스워커·푸시, 수집·평가·요약 본체, 레이트리밋/재시도 래퍼, 오디오, 온보딩 리다이렉트 로직.
