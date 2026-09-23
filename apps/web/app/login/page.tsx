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
