# 화면 구현 설계 — 초안 (검토 대기)

> **상태: DRAFT.** 승인 전이다. 아래 "열린 질문"에 답이 나오면 확정 스펙으로 바꾸고 계획을 쓴다.
> CLAUDE.md 작업 순서 2번: "시드 데이터로 `apps/web` 화면 6+2개 구현 — `docs/DESIGN.md`가 픽셀 단위 명세". 이 지점까지 가면 사람이 화면을 보면서 필터 기준을 조정할 수 있다.

## 목표

시드 데이터만으로 `docs/DESIGN.md` §6의 폰 화면 6개와 웹 화면 2개가 실제 라우트에서 뜬다. 같은 라우트가 브레이크포인트(`<720` / `720~1080` / `≥1080`)에 따라 레이아웃만 바뀐다. 데이터는 DB에서 읽고, 모든 읽기는 core 스키마 `.parse()`를 거친다.

## 범위

| 라우트 | 폰 | 웹 | 데이터 |
|---|---|---|---|
| `/onboarding` | 관심사 등록 | (같은 폼, 넓게) | `interests`, `user_settings` 쓰기 |
| `/` | 오늘의 브리핑 | 브리핑 목록 3단 | `briefs` + `brief_items` + `papers` + `assessments` |
| `/paper/[id]` | 카드 상세 | 정독 3단 | 위 + `saved_items` |
| `/paper/[id]/trust` | 신뢰도 근거 | (웹은 우 레일에 요약 + 이 라우트로 "전체 보기") | `assessments` |
| `/audio` | 오디오 브리핑(다크) | — | 브리핑. **재생은 스텁** (오디오는 MVP 생략 가능) |
| `/saved` | 저장함 | (목록 + 후속 소식) | `saved_items` + `papers` |

범위 밖: 서비스워커·오프라인 캐시, 푸시, 실제 TTS, PDF 뷰어, 검색·아카이브(웹 상단바의 검색은 자리만), Zotero 연동, 이의 제기 저장(버튼은 있되 폼 제출은 다음).

## 아키텍처

### 1. 쿼리 계층 — `packages/db/src/queries/`

행→도메인 변환은 여기서만 한다 (스펙 결정). 파일은 화면 단위가 아니라 도메인 단위.

```
queries/
├── mappers.ts        rowToPaper, rowToAssessment, rowToBriefItem, rowToSavedItem, rowToUserSettings
│                     — 전부 core 스키마 .parse()로 끝난다. departure_time slice(0,5), follow_up.at coerce
├── briefs.ts         getTodayBrief(userId, date) → Brief + items의 paper·assessment를 함께 (JOIN 1회)
├── papers.ts         getPaperDetail(paperId) → { paper, assessment }
├── saved.ts          listSaved(userId), savePaper, unsavePaper, markRead
├── interests.ts      listInterests(userId), createInterest, getSettings, upsertSettings
└── index.ts
```

- 목록 쿼리는 `columns: { embedding: false }` — 1024 float를 목록에 끌고 오지 않는다. core에 `PaperSummary = Paper.omit({ embedding: true })` 추가.
- 테스트: 매퍼는 순수 함수라 DB 없이 테스트. 쿼리는 로컬 DB 대상 통합 테스트 1파일(`queries.test.ts`, `DATABASE_URL` 없으면 skip).

### 2. 앱 구조 — `apps/web`

```
app/
├── (app)/                    로그인 필요. layout에서 requireUser() + 관심사 없으면 /onboarding
│   ├── layout.tsx            폰: 하단 탭 3개 / 웹: 상단바 66px. 브레이크포인트로 분기
│   ├── page.tsx              /
│   ├── paper/[id]/page.tsx
│   ├── paper/[id]/trust/page.tsx
│   ├── audio/page.tsx
│   ├── saved/page.tsx
│   └── onboarding/page.tsx   관심사 없을 때만. 있으면 /로
├── login/page.tsx            (기존)
└── api/auth/                 (기존)
components/
├── shell/                    BottomTabs, TopBar, Masthead(제호+2px 룰)
├── paper/                    PaperCard(폰·웹 변형), Badge(verified|caution), EvidenceChips, TrustSummary
├── brief/                    AudioStrip, ProgressSegments
└── ui/                       Button, Chip, Switch, Stepper — DESIGN.md 규칙(44px, 실제 button/a)
lib/
├── auth.ts                   requireUser(): auth() + redirect('/login')
└── actions/                  서버 액션: saveInterests, savePaper, markRead — 'use server' 파일로 분리
```

- **서버 컴포넌트 기본.** 클라이언트 컴포넌트는 Switch·Stepper·칩 토글·오디오 컨트롤처럼 상태가 있는 것만.
- **반응형은 CSS로.** 같은 페이지가 `tablet:`/`desktop:` 변형으로 레이아웃을 바꾼다. 폰/웹 컴포넌트를 둘로 쪼개지 않는다. 단, `/paper/[id]`는 폰(카드 상세)과 웹(정독)의 정보량이 달라 **같은 데이터로 두 뷰 컴포넌트**(`PaperCardView`, `PaperReadView`)를 두고 페이지가 브레이크포인트로 고른다.
- **아이콘**은 `components/icons.tsx`에 인라인 스트로크 SVG(1.3~1.6, round cap). 이모지 금지.
- 신뢰도 배지에 점수 숫자 없음. 근거 칩은 `assessments.evidence`에서 만든다 — `verdict: 'caution'`이면 `caution` 색.
- 모든 카드에 원문 링크(DOI 우선, 없으면 arXiv, 없으면 pdfUrl).
- `AI 보조 의견` 문구는 `/paper/[id]/trust` 하단과 웹 우 레일에 고정.

### 3. 온보딩 게이트

`(app)/layout.tsx`에서 `listInterests(userId)`가 비면 `/onboarding`으로. 온보딩 제출은 서버 액션 → `interests` + `user_settings` 쓰기 → `/`. 임베딩은 이 단계에선 `null`(파이프라인이 채움).

### 4. 에러·빈 상태

- 오늘 브리핑이 없으면(시드 날짜 ≠ 오늘) **빈 브리핑을 보여주지 않는다**(PRD §5): 가장 최근 브리핑을 "9월 22일자 · 오늘 브리핑은 새벽에 준비됩니다" 라벨과 함께.
- 논문 id 없음 → `notFound()`.
- 시드는 `pnpm db:seed`가 날짜를 오늘로 갱신하므로 개발 중엔 항상 오늘 브리핑이 있다.

## 열린 질문 (답 필요)

1. **`/paper/[id]` 웹 정독 화면의 "핵심 3줄"·섹션별 한국어 요약·영문 인용 블록** — `BriefItem`에는 `oneLine`, `whyItMatters`, `method`, `results`, `limitations`, `quotes`만 있다. 정독용 섹션 요약(`sections: {title, summary, quote}[]`)을 `BriefItem`에 **추가**할까, 아니면 이번엔 `quotes`만으로 그리고 파이프라인 세션에서 모델을 확장할까? → 제 추천: **지금 추가하지 않는다.** 정독 화면은 `method`/`results`/`limitations`/`quotes`로 채우고, 섹션 요약은 briefer가 실제로 무엇을 뽑는지 본 뒤 모델에 넣는다.
2. **"함께 읽으면 좋은 논문"·"이번 주 관심사 흐름"·"연속 기록"** — 데이터가 없다. 시드에 고정값을 넣어 그릴까(시안 재현), 이번엔 자리만 둘까? → 제 추천: **자리만 + 시드 고정값 1~2개.** 연속 기록은 `briefs` 날짜로 계산 가능하니 실제 계산.
3. **오디오 화면** — 실제 재생 없이 DESIGN.md대로 그리기만(컨트롤은 disabled)? → 제 추천: 그리기만. TTS는 MVP 생략 가능이 문서 결정.
4. **폰트** — 지금 `<link>`로 Google Fonts. 이 세션에서 `next/font/google`로 바꿀지(CLS·자체 호스팅), 서비스워커 세션까지 미룰지. → 제 추천: **이번에 바꾼다.** 레이아웃을 새로 쓰는 김에.
5. **`/paper/[id]/trust`의 "판정에 이의 제기"** — 버튼만? 아니면 `disputes` 테이블까지? → 제 추천: 버튼 + `mailto`/토스트 자리. 테이블은 파이프라인이 평가를 실제로 만들 때.

## 세팅 PR에서 이월된 항목 중 이 계획에서 처리할 것

- `packages/db/src/client.ts` — `globalThis` 캐시(HMR) + `max`/`idle_timeout`
- `requireUser()` 헬퍼, `/api/*` 401
- User/Author 단독 스키마 테스트(온보딩 폼과 함께)
- 매니페스트 PNG 아이콘 — 서비스워커 세션으로 계속 이월

## 테스트

- 매퍼 단위 테스트(순수), 쿼리 통합 테스트(로컬 DB, 시드 기준)
- 각 라우트가 시드로 200을 반환하는 스모크 테스트(`next start` 대상, Playwright 없이 `fetch`)
- 접근성 규칙은 코드 리뷰 + 최종 리뷰에서 `div onClick`·hex·44px 검사
