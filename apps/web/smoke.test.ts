import { describe, expect, it } from 'vitest'

const base = process.env.SMOKE_BASE_URL

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
