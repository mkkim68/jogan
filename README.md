# jogan — 조간 논문

매일 아침 믿을 만한 논문 4편을 골라 요약해 배달하는 PWA. 기획은 `docs/PRD.md`, 디자인은 `docs/DESIGN.md`, 개발 규칙은 `CLAUDE.md`.

## 시작하기

```bash
cp .env.example .env        # 아래 값들을 채운다
pnpm install
docker compose up -d        # 로컬 Postgres + pgvector
pnpm db:migrate
pnpm db:seed                # SEED_USER_EMAIL 필요
pnpm dev                    # http://localhost:3100
```

## .env 채우기

- `AUTH_SECRET` — `openssl rand -base64 32`
- `SEED_USER_EMAIL` — Google 로그인에 쓸 본인 이메일. 시드 브리핑이 이 사용자에게 붙는다.
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` — 아래 절차

### Google OAuth 클라이언트 만들기

1. https://console.cloud.google.com → 프로젝트 생성(또는 선택)
2. **API 및 서비스 → OAuth 동의 화면** → 외부, 앱 이름 `조간 논문`, 본인 이메일. 테스트 사용자에 본인과 멘토 이메일 추가
3. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 웹 애플리케이션
   - 승인된 JavaScript 원본: `http://localhost:3100`
   - 승인된 리디렉션 URI: `http://localhost:3100/api/auth/callback/google`
4. 발급된 클라이언트 ID·보안 비밀을 `.env`에 넣는다

배포 후에는 배포 도메인으로 원본·리디렉션 URI를 하나씩 더 추가한다.

## 명령어

`CLAUDE.md` §명령어 참고.
