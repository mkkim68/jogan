# jogan — 조간 논문

매일 아침 믿을 만한 논문 2-4편을 골라 요약해 배달하는 PWA. 기획은 `docs/PRD.md`, 디자인은 `docs/DESIGN.md`, 개발 규칙은 `CLAUDE.md`.

**배포:** https://jogan-vert.vercel.app (Google 로그인 — OAuth 앱이 테스트 모드라 테스트 사용자로 등록된 계정만 들어갈 수 있다)

## 시작하기

```bash
cp .env.example .env        # 아래 값들을 채운다
pnpm install
docker compose up -d        # 로컬 Postgres + pgvector
pnpm db:migrate
pnpm db:seed                # SEED_USER_EMAIL 필요
pnpm dev                    # http://localhost:3100
```

로컬에서 프로덕션 빌드를 확인하려면 `pnpm build && pnpm --filter @jogan/web start`. 이때는 `.env`에 `AUTH_TRUST_HOST=true`가 있어야 한다(`next dev`는 자동으로 localhost를 신뢰하지만 `next start`는 아니다 — Vercel 배포에서는 필요 없다).

## .env 채우기

- `AUTH_SECRET` — `openssl rand -base64 32`
- `SEED_USER_EMAIL` — Google 로그인에 쓸 본인 이메일. 시드 브리핑이 이 사용자에게 붙는다.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — 아래 절차
- `VOYAGE_API_KEY` — 관심사·논문 임베딩에 쓴다. https://voyageai.com 에서 발급.
- `ANTHROPIC_API_KEY` — `pnpm pipeline:collect`의 관련성 판정(Haiku)과 `pnpm pipeline:evaluate`의 신뢰도 평가에 쓴다. https://console.anthropic.com 에서 발급.
- `OPENALEX_MAILTO` — `pnpm pipeline:evaluate`가 OpenAlex를 조회할 때 쓸 연락처. 없으면 공용 풀로 떨어져 느려진다.

### Google OAuth 클라이언트 만들기

1. https://console.cloud.google.com → 프로젝트 생성(또는 선택)
2. **API 및 서비스 → OAuth 동의 화면** → 외부, 앱 이름 `조간 논문`, 본인 이메일. 테스트 사용자에 로그인할 이메일 추가
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 웹 애플리케이션
   - 승인된 JavaScript 원본: `http://localhost:3100`
   - 승인된 리디렉션 URI: `http://localhost:3100/api/auth/callback/google`
4. 발급된 클라이언트 ID·보안 비밀을 `.env`에 넣는다

배포 도메인도 원본·리디렉션 URI에 하나씩 더 추가한다 — 현재 배포는 `https://jogan-vert.vercel.app`, `https://jogan-vert.vercel.app/api/auth/callback/google`.

## 명령어

`CLAUDE.md` §명령어 참고.
