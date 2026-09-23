import { listInterests } from '@jogan/db'
import { redirect } from 'next/navigation'
import { OnboardingForm } from '@/components/onboarding/OnboardingForm'
import { requireUser } from '@/lib/session'

/**
 * `(app)` 그룹 밖의 화면 — 탭·상단바 없이 전체 화면으로 뜬다. 레이아웃이 없으므로
 * 이 페이지가 직접 `requireUser()`를 호출한다.
 *
 * `(app)/layout.tsx`가 관심사 0개인 사용자를 여기로 돌려보낸다. 그러므로 이미 관심사가
 * 있는 사용자가 여기로 오면 `/`로 되돌려야 한다 — 안 그러면 두 리다이렉트가 서로를 돌게 된다.
 */
export default async function OnboardingPage() {
  const user = await requireUser()
  const interests = await listInterests(user.id)
  if (interests.length > 0) redirect('/')

  return (
    <main className="min-h-dvh bg-paper">
      <OnboardingForm />
    </main>
  )
}
