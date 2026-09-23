import { todayInSeoul } from '@jogan/db'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { BottomTabs } from '@/components/shell/BottomTabs'
import { TopBar } from '@/components/shell/TopBar'
import { listInterests } from '@/lib/data'
import { requireUser } from '@/lib/session'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser()
  const interests = await listInterests(user.id)
  if (interests.length === 0) redirect('/onboarding')

  return (
    <div className="min-h-dvh bg-paper">
      <TopBar user={user} today={todayInSeoul()} />
      <div className="pb-[66px] tablet:pb-0">{children}</div>
      <BottomTabs />
    </div>
  )
}
