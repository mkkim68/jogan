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
