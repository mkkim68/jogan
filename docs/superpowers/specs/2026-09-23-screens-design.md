# 화면 구현 설계 — 폰 6 + 웹 2

2026-09-23. CLAUDE.md 작업 순서 2번: "시드 데이터로 `apps/web` 화면 6+2개 구현 — `docs/DESIGN.md`가 픽셀 단위 명세". 여기까지 가면 사람이 화면을 보면서 필터 기준을 조정할 수 있다. 그 지점을 최대한 빨리 만드는 것이 목표다.

전제: 세팅 PR #1(`feat/project-setup`)이 머지된 `master`. 머지 전이면 그 브랜치에서 분기한다.

## 목표

시드 데이터만으로 `docs/DESIGN.md` §6의 폰 화면 6개와 웹 화면 2개가 실제 라우트에서 뜬다. 같은 라우트가 브레이크포인트(`<720` / `720~1080` / `≥1080`)에 따라 레이아웃만 바뀐다. 데이터는 DB에서 읽고, 모든 읽기는 core 스키마 `.parse()`를 거친다.

## 범위

| 라우트 | 폰 | 웹 | 데이터 |
|---|---|---|---|
| `/onboarding` | 관심사 등록 | 같은 폼, 넓게 | `interests`, `user_settings` 쓰기 |
| `/` | 오늘의 브리핑 | 브리핑 목록 3단 | `briefs` + `brief_items` + `papers` + `assessments` |
| `/paper/[id]` | 카드 상세 | 정독 3단 | 위 + `saved_items` |
| `/paper/[id]/trust` | 신뢰도 근거 | 같은 라우트(웹 우 레일의 "판정 근거 전체 보기" 대상) | `assessments` |
| `/audio` | 오디오 브리핑(다크) | — (폰 전용) | 브리핑. 재생은 비활성 |
| `/saved` | 저장함 | 목록 + 후속 소식 | `saved_items` + `papers` |

범위 밖: 서비스워커·오프라인 캐시, 푸시, 실제 TTS, PDF 뷰어, 검색·아카이브(웹 상단바 검색은 자리만), Zotero 연동, 이의 제기 저장.

## 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 정독 화면의 섹션별 요약 | `BriefItem`을 **확장하지 않는다.** `method`/`results`/`limitations`/`quotes`로 채운다 | briefer가 실제로 무엇을 뽑는지 본 뒤 모델에 넣는다. 지금 넣으면 추측으로 스키마가 굳는다 |
| "함께 읽으면 좋은 논문" · "이번 주 관심사 흐름" · "오늘의 곁가지" | 자리만. 관련 논문은 같은 브리핑의 다른 항목에서 2편을 뽑고 관계 문구는 시드에 고정, 관심사 흐름은 `brief_items`를 관심사별로 센다, 곁가지는 `isSerendipity` 항목 | 추천 로직이 아직 없다. 시안은 재현하되 가짜 관련도 계산을 만들지 않는다 |
| 연속 기록(🔥 N일째) | `briefs` 날짜로 **실제 계산** | 데이터가 이미 있다 |
| 오디오 화면 | DESIGN.md대로 그리되 컨트롤 `disabled`, "준비 중" 표기 | TTS는 MVP 생략 가능이 CLAUDE.md 결정 |
| 폰트 | `<link>` → **`next/font/google`로 전환** | 자체 호스팅, CLS 제거. 레이아웃을 새로 쓰는 김에 |
| 이의 제기 | 버튼 + 안내 토스트만. `disputes` 테이블 없음 | 평가를 실제로 만들 때 함께 |

## 아키텍처

### 1. 쿼리 계층 — `packages/db/src/queries/`

행→도메인 변환은 여기서만 한다(세팅 스펙의 "행→도메인 변환은 `packages/db`가 담당"). 파일은 화면이 아니라 도메인 단위.

```
queries/
├── mappers.ts    rowToPaper, rowToAssessment, rowToBriefItem, rowToSavedItem, rowToUserSettings
│                 전부 core 스키마 .parse()로 끝난다
├── briefs.ts     getTodayBrief(userId, date), getLatestBrief(userId), countStreak(userId)
├── papers.ts     getPaperDetail(paperId) → { paper, assessment }
├── saved.ts      listSaved(userId), savePaper, unsavePaper, markRead
├── interests.ts  listInterests(userId), createInterests, getSettings, upsertSettings
└── index.ts
```

매퍼가 해결하는 세팅 PR의 이월 항목 두 가지:

- `saved_items.follow_up.at` — jsonb가 ISO 문자열로 돌려준다. `FollowUp.parse()`의 `z.coerce.date()`가 `Date`로 복원.
- `user_settings.departure_time` — pg `time`이 `HH:mm:ss`로 돌려준다. `slice(0, 5)` 후 `UserSettings.parse()`.

목록 쿼리는 `columns: { embedding: false }`. core에 `PaperSummary = Paper.omit({ embedding: true })`를 추가하고 목록 매퍼는 이 스키마로 파싱한다 — 1024 float를 목록에 끌고 오지 않는다.

`getTodayBrief`는 JOIN 한 번으로 브리핑·항목·논문·평가를 함께 가져온다(N+1 금지).

### 2. 앱 구조 — `apps/web`

```
app/
├── (app)/                      로그인 필요 그룹
│   ├── layout.tsx              requireUser() + 관심사 없으면 /onboarding. 폰: 하단 탭 / 웹: 상단바
│   ├── page.tsx                /
│   ├── paper/[id]/page.tsx
│   ├── paper/[id]/trust/page.tsx
│   ├── audio/page.tsx
│   └── saved/page.tsx
├── onboarding/page.tsx         (app) 밖 — 탭·상단바 없는 전체 화면
├── login/page.tsx              기존
└── api/auth/                   기존
components/
├── shell/      Masthead(제호 + 2px ink 룰), BottomTabs, TopBar, SideRail
├── paper/      PaperCard, PaperCardView, PaperReadView, TrackBadge, EvidenceChips, TrustSummary
├── brief/      AudioStrip, ProgressSegments, FollowUpNote
├── ui/         Button, Chip, Switch, Stepper, SegmentedControl
└── icons.tsx   인라인 스트로크 SVG (1.3~1.6, round cap). 이모지 금지
lib/
├── session.ts  requireUser()
└── actions/    'use server' — interests.ts, saved.ts
```

- **서버 컴포넌트가 기본.** 클라이언트 컴포넌트는 상태가 있는 것만: Switch, Stepper, 칩 토글, 세그먼트 컨트롤, 오디오 컨트롤.
- **반응형은 CSS로.** 같은 페이지가 `tablet:`/`desktop:` 변형으로 바뀐다. 예외는 `/paper/[id]` — 폰(카드 상세)과 웹(정독)은 정보량이 달라 같은 데이터를 받는 두 뷰 컴포넌트를 두고 페이지가 CSS로 하나만 보인다(`hidden tablet:block` / `tablet:hidden`). 서버에서 뷰포트를 추측하지 않는다.
- 본문 칼럼 `max-w-prose`(660px)를 모든 구간에 적용.
- 배지는 두 종류뿐(`검증됨` 체크 원 / `심사 전` 경고 삼각형). **점수 숫자를 배지에 넣지 않는다.**
- 근거 칩은 `assessments.evidence`에서 만든다. `verdict: 'caution'`이면 `caution` 색. 목록 단계에서 이미 보인다(폰 3개, 웹 4개까지).
- 모든 카드에 원문 링크: DOI > arXiv > `pdfUrl`.
- `AI 보조 의견` 문구는 `/paper/[id]/trust` 하단과 웹 우 레일에 고정.
- 심사 전 논문은 `caution` 테두리로 시각적으로 구분한다.

### 3. 온보딩 게이트

`(app)/layout.tsx`에서 `listInterests(userId)`가 비면 `redirect('/onboarding')`. 온보딩 제출은 서버 액션 → `interests`(임베딩 `null`, 파이프라인이 채움) + `user_settings` 쓰기 → `/`. 관심사가 이미 있으면 `/onboarding`은 `/`로 되돌린다.

### 4. 빈 상태와 에러

- 오늘 브리핑이 없으면 **빈 브리핑을 보여주지 않는다**(PRD §5). 가장 최근 브리핑을 "9월 22일자 · 오늘 브리핑은 새벽에 준비됩니다" 라벨과 함께 보여준다.
- 브리핑이 하나도 없으면(새 사용자) "내일 아침 첫 브리핑이 도착합니다" 안내 + 관심사 확인 링크.
- 논문 id가 없으면 `notFound()`.
- `pnpm db:seed`가 브리핑 날짜를 오늘로 갱신하므로 개발 중엔 항상 오늘 브리핑이 있다.

### 5. 세팅 PR에서 이월된 항목 중 여기서 처리

- `packages/db/src/client.ts` — dev HMR용 `globalThis` 캐시 + `max`/`idle_timeout`
- `requireUser()` 헬퍼, `/api/*`(비인증 경로)는 307 대신 401
- `User`/`Author` 단독 스키마 테스트 — 온보딩 폼과 함께

서비스워커 세션으로 계속 이월: 매니페스트 PNG 아이콘, FK 인덱스 + HNSW 마이그레이션, `next-auth` devDep → `@auth/core/adapters`.

### 6. 구현 순서

계획은 첫 세로 슬라이스가 혼자서도 쓸모 있도록 배열한다: **쿼리 계층 → 디자인 프리미티브(ui/icons) → 셸((app) layout, 탭·상단바) → `/`(폰·웹) → `/paper/[id]`(카드·정독) → `/paper/[id]/trust` → `/saved` → `/onboarding` → `/audio`**. `/`까지 끝나면 이미 시드로 필터 기준을 눈으로 볼 수 있다.

## 테스트

- **매퍼** — 순수 함수. DB 행 모양의 객체를 넣어 도메인 객체가 나오는지, 특히 `departure_time` 잘림과 `follow_up.at` 복원.
- **쿼리** — 로컬 DB 대상 통합 테스트 한 파일. `DATABASE_URL`이 없으면 `describe.skip`.
- **라우트 스모크** — 시드 상태에서 8개 라우트가 200을 반환하고 핵심 문자열(제호, 논문 제목)이 들어 있는지. `next build && next start` 대상 `fetch`, Playwright 없이.
- 접근성(44px, `div onClick` 없음, hex 직접 사용 없음, `aria-label`)은 코드 리뷰와 최종 리뷰에서 검사.

## 완료 기준

```bash
pnpm db:seed && pnpm dev
```
→ 로그인 후 8개 라우트가 DESIGN.md 시안대로 뜬다. `pnpm typecheck`, `pnpm test`, `pnpm build` 전부 종료 코드 0.
