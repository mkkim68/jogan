import { countSaved, getLatestBrief } from '@jogan/db'
import Link from 'next/link'
import type { SessionUser } from '@/lib/session'
import { formatIssueDate } from './Masthead'

type Props = {
  user: SessionUser
  today: string
}

/**
 * 웹 전용 상단바 (docs/DESIGN.md §3, §6). 높이 66px, 좌우 여백 28px.
 * 제호 · 날짜/호수 · 검색(준비 중, disabled) · 아카이브(준비 중, disabled) · 저장함 N · 설정 · 아바타 32px.
 *
 * `설정`은 DESIGN.md §6 시안에는 없다 — `/settings` 화면이 새로 생기며 추가된 항목이라
 * 기존 저장함 링크 옆, 아바타 앞에 같은 스타일(44px 터치 영역)로 붙인다.
 *
 * 호수는 가장 최근 브리핑에서 가져온다. 신규 사용자처럼 브리핑이 아직 없으면 날짜만 표시한다
 * (가짜 호수를 만들지 않는다).
 */
export async function TopBar({ user, today }: Props) {
  const [savedCount, latestBrief] = await Promise.all([countSaved(user.id), getLatestBrief(user.id)])
  const avatarLabel = user.name ?? user.email

  return (
    <header className="hidden h-[66px] items-center justify-between border-b border-line bg-paper-raised px-7 tablet:flex">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-[22px] font-extrabold tracking-[-0.6px] text-ink">조간 논문</span>
        <span className="text-xs tabular-nums text-ink-muted">
          {formatIssueDate(today, latestBrief?.brief.issueNumber ?? null)}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <label htmlFor="archive-search" className="sr-only">
          아카이브 검색
        </label>
        <input
          id="archive-search"
          type="search"
          disabled
          placeholder="아카이브 검색 — 준비 중"
          className="h-11 w-[380px] rounded-[10px] border border-line-strong bg-paper-subtle px-3 text-sm text-ink-muted placeholder:text-ink-muted disabled:opacity-70"
        />
        <button
          type="button"
          disabled
          title="아카이브 — 준비 중"
          className="flex h-11 items-center px-3 text-sm font-medium text-ink-muted disabled:opacity-60"
        >
          아카이브
        </button>
        <Link
          href="/saved"
          className="flex h-11 items-center px-3 text-sm font-medium text-ink-dim hover:text-ink"
        >
          저장함 {savedCount}
        </Link>
        <Link
          href="/settings"
          className="flex h-11 items-center px-3 text-sm font-medium text-ink-dim hover:text-ink"
        >
          설정
        </Link>
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부(Google) 아바타, next/image 도메인 설정 범위 밖
          <img src={user.image} alt={avatarLabel} width={32} height={32} className="h-8 w-8 rounded-full" />
        ) : (
          <span
            aria-label={avatarLabel}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper"
          >
            {avatarLabel.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
    </header>
  )
}
