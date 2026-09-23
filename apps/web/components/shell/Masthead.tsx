/** 신문 지면 상단의 날짜·호수 표기. `TopBar`도 같은 형식을 쓴다. */
export function formatIssueDate(date: string, issueNumber?: number | null): string {
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(new Date(`${date}T00:00:00+09:00`))
  return issueNumber != null ? `${formatted} · 제${issueNumber}호` : formatted
}

type Props = {
  date: string
  issueNumber: number | null
}

/**
 * 폰 `/` 화면 제호 영역 (docs/DESIGN.md §6).
 * `조간 논문` display 27px(폰)/22px(웹) + 날짜·호수 우측 정렬, 아래 2px `ink` 실선.
 */
export function Masthead({ date, issueNumber }: Props) {
  return (
    <header>
      <div className="flex items-end justify-between">
        <h1 className="font-display text-[27px] font-extrabold tracking-[-1px] text-ink tablet:text-[22px] tablet:tracking-[-0.6px]">
          조간 논문
        </h1>
        <p className="text-xs tabular-nums text-ink-muted">{formatIssueDate(date, issueNumber)}</p>
      </div>
      <div className="mt-2 h-[2px] bg-ink" aria-hidden="true" />
    </header>
  )
}
