# jogan — 조간 논문

매일 아침, 내 관심사에서 **믿을 만한 논문 4편**을 골라 요약해 배달하는 PWA.

핵심 가치는 요약이 아니라 **큐레이션**이다. 하루 수천 편에서 "이건 읽어도 된다"를 골라내는 신뢰도 필터가 이 제품의 전부다. 기능을 덧붙일지 말지 고민될 때는 "이게 신뢰도 필터를 더 믿게 만드는가"로 판단한다.

- 기획 전문: `docs/PRD.md`
- 디자인 시스템과 화면 명세: `docs/DESIGN.md`

---

## 절대 규칙

1. **요약에 없는 수치를 만들지 않는다.** 요약 생성 후 모든 숫자·고유명사를 원문 문장과 대조하고, 검증 실패한 문장은 삭제한다. 통과 못 한 논문은 배달하지 않는다.
2. **신뢰도 판정은 점수 하나로 노출하지 않는다.** 항상 "왜 믿을 만한지" 근거 문장과 함께 보여주고, `AI 보조 의견`임을 명시한다.
3. **심사 전 프리프린트는 반드시 경고 라벨과 함께.** 하루 최대 2편, 검증된 논문과 시각적으로 구분한다.
4. **저작권**: 요약은 오픈액세스 본문과 초록만을 근거로 만든다. 원문 전문을 저장·재배포하지 않고, 모든 카드에 원문 링크(DOI 우선)를 붙인다.
5. **샘플 데이터 주의**: 디자인 시안에 들어간 논문 제목·저자·수치는 전부 가상의 예시다. 실제 논문이 아니므로 시드 데이터로 쓰되 실제 콘텐츠로 착각하지 않는다.

---

## 스택

확정:
- **Next.js (App Router) + TypeScript** — PWA. 같은 라우트가 브레이크포인트에 따라 폰/웹 레이아웃으로 갈린다.
- **Tailwind CSS** — 토큰은 `docs/DESIGN.md`의 값을 `tailwind.config.ts` theme에 그대로 등록한다. 임의의 hex를 컴포넌트에 직접 쓰지 않는다.
- **PostgreSQL + pgvector** — 논문 메타데이터와 관심사 임베딩.
- **Drizzle ORM** — 마이그레이션은 항상 파일로 남긴다.

결정됨 (2026-09-22):
- **호스팅: Vercel + Neon.** 로컬은 `docker compose`의 `pgvector/pgvector:pg17`.
- **인증: Auth.js(next-auth v5) + Google 로그인**, `@auth/drizzle-adapter`, DB 세션. 처음부터 다중 사용자.
- **모노레포: pnpm workspaces만.** 공유 패키지는 빌드 없이 `.ts` 소스를 직접 export (web은 `transpilePackages`, 서비스는 `tsx`).
- **도메인 타입은 `packages/core`의 zod 스키마에서 `z.infer`로 도출.** 외부 API 파싱과 같은 스키마를 쓴다.

교체 가능 (결정 시 이 파일에 기록):
- 배치 실행: Vercel Cron 또는 GitHub Actions (새벽 3시 KST)
- LLM: Anthropic API (평가·요약)
- 임베딩: 차원은 `packages/core`의 `EMBEDDING_DIM`(기본 1024) 하나로 관리. 모델 확정 시 마이그레이션 한 번
- TTS: 오디오 브리핑 생성. MVP에서는 생략 가능

---

## 레포 구조

```
jogan/
├── CLAUDE.md
├── docs/
│   ├── PRD.md              기획
│   └── DESIGN.md           디자인 시스템 · 화면 명세
├── apps/
│   └── web/                Next.js PWA (폰 + 데스크톱)
├── packages/
│   ├── db/                 스키마 · 마이그레이션 · 쿼리
│   └── core/               도메인 타입 (Paper, Assessment, Brief …)
└── services/
    ├── collector/          수집 · 중복 제거 (arXiv, PubMed, OpenAlex …)
    ├── evaluator/          4단계 신뢰도 필터
    └── briefer/            요약 · 사실 검증 · 오디오 생성
```

`services/*`는 각각 독립 실행 가능한 스크립트로 두고, 파이프라인 단계 사이는 DB를 통해 넘긴다. 한 단계가 실패해도 이전 단계 결과가 남아 재시도할 수 있어야 한다.

---

## 명령어

```bash
pnpm dev                 # web 개발 서버
pnpm db:generate         # 마이그레이션 파일 생성 (커밋한다)
pnpm db:migrate          # 마이그레이션 적용
pnpm db:push             # 스키마 즉시 반영 (로컬 편의용)
pnpm db:seed             # 시드 데이터 (docs/PRD.md의 샘플 논문)
pnpm pipeline:collect    # 수집만
pnpm pipeline:evaluate   # 평가만
pnpm pipeline:brief      # 요약 · 브리핑 생성
pnpm pipeline:run        # 전체 (새벽 배치와 동일)
pnpm test
pnpm typecheck
```

---

## 코딩 규칙

- **서버 로직에 `any` 금지.** 외부 API 응답은 zod로 파싱하고, 파싱 실패는 로그와 함께 해당 논문만 건너뛴다. 파이프라인 전체를 죽이지 않는다.
- **외부 API 호출은 반드시 레이트 리밋과 재시도를 가진 래퍼를 통해서.** arXiv·PubMed는 초당 요청 제한이 있다.
- **LLM 호출은 `services/*/prompts/` 아래에 프롬프트를 파일로 분리한다.** 코드에 인라인하지 않는다. 프롬프트 변경은 diff로 보이게.
- **비용**: 파이프라인은 싼 필터가 앞에 오는 깔때기다. 순서를 바꾸지 말 것. LLM 본문 평가는 사용자당 하루 10~50편 이내로 유지한다.
- **접근성**: 모든 터치 타깃 44px 이상, `div`에 `onClick` 금지(실제 `button`/`a` 사용), 아이콘 전용 버튼에 `aria-label`. 시안이 이 규칙으로 그려져 있다.
- 커밋 메시지는 한국어 또는 영어 둘 다 좋지만 한 레포 안에서 통일한다.

---

## 작업 순서 제안

1. `packages/core`에 도메인 타입, `packages/db`에 스키마 — `docs/PRD.md` §4 데이터 모델 참고
2. 시드 데이터로 `apps/web` 화면 6+2개 구현 — `docs/DESIGN.md`가 픽셀 단위 명세
3. `services/collector` — arXiv 하나만으로 시작
4. `services/evaluator` — 1·2단계(규칙·메타데이터)만. 3·4단계는 그 다음
5. `services/briefer` — 요약 + 사실 검증
6. 새벽 배치 연결, 알림
7. 오디오, 프리프린트 후속 추적

2번까지 끝나면 사람이 화면을 보면서 필터 기준을 조정할 수 있다. 그 지점을 최대한 빨리 만드는 것이 목표다.
