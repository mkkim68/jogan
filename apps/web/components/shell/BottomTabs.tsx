'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentType } from 'react'
import { BookmarkIcon, HomeIcon, InterestIcon } from '@/components/icons'

type Tab = {
  href: string
  label: string
  Icon: ComponentType<{ className?: string }>
}

const TABS: Tab[] = [
  { href: '/', label: '브리핑', Icon: HomeIcon },
  { href: '/saved', label: '저장함', Icon: BookmarkIcon },
  { href: '/onboarding', label: '관심사', Icon: InterestIcon },
]

/**
 * 폰 전용 하단 탭 (docs/DESIGN.md §3, §6).
 * 탭 바 56px + 하단 여백 10px = 66px. 각 탭은 `<Link>`이며 44px 이상의 터치 영역을 갖는다.
 */
export function BottomTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="주요 이동" className="fixed inset-x-0 bottom-0 z-10 tablet:hidden">
      <div className="flex h-14 border-t border-line bg-paper-raised">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-[1px] transition-colors ${
                active ? 'text-ink' : 'text-ink-muted'
              }`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          )
        })}
      </div>
      <div className="h-[10px] bg-paper-raised" aria-hidden="true" />
    </nav>
  )
}
