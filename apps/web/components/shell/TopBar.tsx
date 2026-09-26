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
 *
 * 제호("조간 논문")는 `/`로 가는 링크다 — 예전에는 웹 상단바에 홈으로 돌아갈 방법이 없었다.
 *
 * 800px 부근에서 제호·날짜/호수·내비 링크가 각각 두 줄로 줄바꿈되던 문제가 있었다.
 * `whitespace-nowrap`으로 줄바꿈을 막고, 검색 입력은 `min-w-0`으로 형제를 밀어내는 대신
 * 스스로 줄어들게 하며, `desktop`(1080px) 미만에서는 어차피 `disabled` 자리표시자인
 * 검색 입력과 `아카이브` 링크를 아예 숨겨 그 폭 다툼 자체를 없앤다(기능 손실 없음).
 */
export async function TopBar({ user, today }: Props) {
  const [savedCount, latestBrief] = await Promise.all([countSaved(user.id), getLatestBrief(user.id)])
  const avatarLabel = user.name ?? user.email

  return (
    <header className="hidden h-[66px] items-center justify-between border-b border-line bg-paper-raised px-7 tablet:flex">
      <div className="flex min-w-0 items-baseline gap-3">
        <Link
          href="/"
          className="whitespace-nowrap font-display text-[22px] font-extrabold tracking-[-0.6px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          조간 논문
        </Link>
        <span className="whitespace-nowrap text-xs tabular-nums text-ink-muted">
          {formatIssueDate(today, latestBrief?.brief.issueNumber ?? null)}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-4">
        <label htmlFor="archive-search" className="sr-only">
          아카이브 검색
        </label>
        <input
          id="archive-search"
          type="search"
          disabled
          placeholder="아카이브 검색 — 준비 중"
          className="hidden h-11 w-[380px] min-w-0 rounded-[10px] border border-line-strong bg-paper-subtle px-3 text-sm text-ink-muted placeholder:text-ink-muted disabled:opacity-70 desktop:block"
        />
        <button
          type="button"
          disabled
          title="아카이브 — 준비 중"
          className="hidden h-11 items-center whitespace-nowrap px-3 text-sm font-medium text-ink-muted disabled:opacity-60 desktop:flex"
        >
          아카이브
        </button>
        <Link
          href="/saved"
          className="flex h-11 items-center whitespace-nowrap px-3 text-sm font-medium text-ink-dim hover:text-ink"
        >
          저장함 {savedCount}
        </Link>
        <Link
          href="/settings"
          className="flex h-11 items-center whitespace-nowrap px-3 text-sm font-medium text-ink-dim hover:text-ink"
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
