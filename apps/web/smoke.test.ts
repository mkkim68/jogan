import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const base = process.env.SMOKE_BASE_URL

// 시드가 고정으로 심는 id (packages/db/src/seed.ts, seed-data.ts). 시드 후 값이 바뀌지 않는다.
const SEED_USER_ID = '00000000-0000-4000-8000-000000000001'
const REVIEWBENCH_PAPER_ID = 'b1000000-0000-4000-8000-000000000003'
const REVIEWBENCH_TITLE = 'ReviewBench: Do LLM Code Reviewers Catch Real Regressions?'

describe.skipIf(!base)('라우트 스모크', () => {
  const protectedRoutes = ['/', '/saved', '/audio', '/onboarding']

  it.each(protectedRoutes)('%s 는 미로그인 시 /login으로 보낸다', async (path) => {
    const res = await fetch(`${base}${path}`, { redirect: 'manual' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('/login 은 200이고 로그인 버튼이 있다', async () => {
    const res = await fetch(`${base}/login`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Google로 계속하기')
  })

  it('/api/auth/providers 는 google을 포함한다', async () => {
    const res = await fetch(`${base}/api/auth/providers`)
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty('google')
  })

  it('매니페스트가 뜬다', async () => {
    const res = await fetch(`${base}/manifest.webmanifest`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ name: '조간 논문' })
  })
})

/**
 * 인증이 필요한 8개 라우트 전부가 시드 상태에서 200(또는 정상 리다이렉트)과 핵심 문자열을
 * 반환하는지 확인한다. 쿠키를 위조하지 않고 `sessions` 테이블에 진짜 행을 넣어 그 토큰을
 * 쿠키로 쓴다 — `auth.ts`가 `session: { strategy: 'database' }`이므로 이 방식만 통한다.
 *
 * `@jogan/db`는 모듈 로드 시점에 `DATABASE_URL`이 없으면 던지므로(env.ts), 최상단에서
 * 정적 import하지 않고 `beforeAll` 안에서 동적 import한다 — `SMOKE_BASE_URL`이 없어 이
 * describe가 스킵될 때(`pnpm test`가 DB 없는 환경에서 도는 경우 등) 이 파일의 수집 자체가
 * 깨지지 않게 하기 위해서다.
 */
describe.skipIf(!base)('인증된 라우트 스모크 (시드 사용자, 진짜 DB 세션)', () => {
  let cookie: string
  let token: string

  beforeAll(async () => {
    const { db, sessions } = await import('@jogan/db')
    token = crypto.randomUUID()
    cookie = `authjs.session-token=${token}`
    await db.insert(sessions).values({
      sessionToken: token,
      userId: SEED_USER_ID,
      expires: new Date(Date.now() + 3600_000),
    })
  })

  afterAll(async () => {
    const { db, sessions } = await import('@jogan/db')
    await db.delete(sessions).where(eq(sessions.sessionToken, token))
  })

  it('/ 는 200이고 제호를 보여준다', async () => {
    const res = await fetch(`${base}/`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('조간 논문')
  })

  it('/paper/[id] 는 200이고 시드 논문 제목을 보여준다', async () => {
    const res = await fetch(`${base}/paper/${REVIEWBENCH_PAPER_ID}`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain(REVIEWBENCH_TITLE)
  })

  it('/paper/[id]/trust 는 200이고 신뢰도 근거 화면을 보여준다', async () => {
    const res = await fetch(`${base}/paper/${REVIEWBENCH_PAPER_ID}/trust`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('신뢰도 근거')
  })

  it('/saved 는 200이고 저장함을 보여준다', async () => {
    const res = await fetch(`${base}/saved`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('저장함')
  })

  it('/audio 는 200이고 오디오 브리핑 화면을 보여준다', async () => {
    const res = await fetch(`${base}/audio`, { headers: { cookie } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('오디오 브리핑')
  })

  it('/onboarding 은 이미 관심사가 있는 시드 사용자를 /로 되돌린다', async () => {
    const res = await fetch(`${base}/onboarding`, { headers: { cookie }, redirect: 'manual' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).not.toContain('/login')
  })
})
