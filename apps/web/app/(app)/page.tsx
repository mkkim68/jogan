import { countByInterest, countStreak, getLatestBrief, getTodayBrief, todayInSeoul } from '@jogan/db'
import Link from 'next/link'
import { AudioStrip } from '@/components/brief/AudioStrip'
import { ExternalLinkIcon, PlayIcon, PlusIcon } from '@/components/icons'
import { PaperCard } from '@/components/paper/PaperCard'
import { TrackBadge } from '@/components/paper/TrackBadge'
import { Masthead } from '@/components/shell/Masthead'
import { listInterests, listSaved } from '@/lib/data'
import { sourceUrl } from '@/lib/link'
import { requireUser } from '@/lib/session'

const FILTERS = [
  { id: 'filter-peer-review', label: '동료심사 통과만' },
  { id: 'filter-code', label: '코드 공개만' },
  { id: 'filter-kr', label: '한국 기관 참여' },
] as const

const SIDE_LABEL = 'text-[11px] font-semibold tracking-[1px] text-ink-muted'

/** 지난 브리핑에 붙는 라벨. "9월 22일자 · 오늘 브리핑은 새벽에 준비됩니다" */
function formatStaleLabel(date: string): string {
  const formatted = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(new Date(`${date}T00:00:00+09:00`))
  return `${formatted}자 · 오늘 브리핑은 새벽에 준비됩니다`
}

export default async function BriefingPage() {
  const user = await requireUser()
  const today = todayInSeoul()

  const todayView = await getTodayBrief(user.id, today)
  const view = todayView ?? (await getLatestBrief(user.id))

  // 브리핑이 하나도 없다 — 빈 브리핑을 보여주지 않는다 (docs/DESIGN.md §4, PRD §5)
  // 나머지 쿼리는 브리핑이 있을 때만 필요하므로, 없으면 여기서 바로 빈 상태로 반환하고
  // interests·streak·byInterest·saved를 미리 가져와 버리지 않는다.
  if (!view) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-prose flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-xl font-bold text-ink">내일 아침 첫 브리핑이 도착합니다</p>
        <p className="text-sm text-ink-muted">관심사를 등록해 두면 새벽 배치가 그 안에서 논문을 고릅니다.</p>
        <Link
          href="/onboarding"
          className="mt-2 inline-flex h-11 items-center justify-center rounded-[10px] bg-ink px-5 text-sm font-medium text-paper hover:bg-ink-body"
        >
          관심사 보기
        </Link>
      </div>
    )
  }

  const [interests, streak, byInterest, saved] = await Promise.all([
    listInterests(user.id),
    countStreak(user.id, today),
    countByInterest(user.id, 7),
    listSaved(user.id),
  ])

  const staleLabel = view.isToday ? null : formatStaleLabel(view.brief.date)
  // 지난 브리핑을 보여줄 때는 "오늘 N편"이라고 말하지 않는다 — 날짜 라벨과 모순된다
  const todayPrefix = view.isToday ? '오늘 ' : ''
  const totalCount = view.items.length
  const mainItems = view.items.filter((v) => !v.item.isSerendipity)
  const serendipity = view.items.find((v) => v.item.isSerendipity) ?? null
  const followUps = saved.filter((s) => s.item.followUp != null).slice(0, 2)

  const todayCountByInterest = new Map<string, number>()
  for (const { item } of view.items) {
    if (item.interestId) {
      todayCountByInterest.set(item.interestId, (todayCountByInterest.get(item.interestId) ?? 0) + 1)
    }
  }

  return (
    <>
      {/* 폰 (< 720px) — 1칼럼 */}
      <div className="px-5 pb-8 pt-6 tablet:hidden">
        <Masthead date={view.brief.date} issueNumber={view.brief.issueNumber} />
        {staleLabel ? <p className="mt-3 text-xs font-medium text-ink-muted">{staleLabel}</p> : null}
        <p className="mt-4 text-sm text-ink-body">
          관심사 {interests.length}개에서 {todayPrefix}
          <span className="font-semibold text-ink">{totalCount}편</span>을 골랐습니다 · 읽기{' '}
          {view.brief.readMinutes}분
        </p>
        <p className="mt-1.5 text-[11px] text-ink-muted">신뢰도 배지와 근거는 AI 보조 의견입니다</p>
        <AudioStrip seconds={view.brief.audioSeconds} className="mt-4" />
        <ul className="mt-5 flex flex-col gap-3">
          {view.items.map(({ item, paper, assessment }) => (
            <li key={item.paperId}>
              <PaperCard item={item} paper={paper} assessment={assessment} layout="phone" />
            </li>
          ))}
        </ul>
      </div>

      {/* 태블릿(720~1080px) — 중앙 + 우 도구 2단, 좌 레일은 서랍이라 숨김.
          데스크톱(>= 1080px)에서 좌 244 / 중앙 flex / 우 300, 간격 28 */}
      <div className="hidden px-7 py-8 tablet:grid tablet:grid-cols-[minmax(0,1fr)_300px] tablet:gap-7 desktop:grid-cols-[244px_minmax(0,1fr)_300px]">
        <aside className="hidden flex-col gap-8 desktop:flex">
          <div>
            <h2 className={SIDE_LABEL}>내 관심사</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {interests.map((interest) => (
                <li key={interest.id} className="flex items-center justify-between gap-2 text-sm text-ink-body">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                    <span className="truncate">{interest.label}</span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                    {todayCountByInterest.get(interest.id) ?? 0}편
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/onboarding"
              className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong text-sm font-medium text-ink-dim hover:bg-paper-raised"
            >
              <PlusIcon className="h-4 w-4" />
              관심사 추가
            </Link>
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className={SIDE_LABEL}>걸러내기</legend>
            {FILTERS.map((filter) => (
              <div key={filter.id} className="flex min-h-11 items-center gap-2">
                <input
                  id={filter.id}
                  type="checkbox"
                  disabled
                  className="h-4 w-4 rounded border-line-strong text-ink-muted"
                />
                <label htmlFor={filter.id} className="text-sm text-ink-muted">
                  {filter.label}
                </label>
              </div>
            ))}
          </fieldset>

          <div>
            <p className={SIDE_LABEL}>연속 기록</p>
            <p className="mt-1 font-display text-[30px] font-extrabold tabular-nums text-ink">{streak}일째</p>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col gap-6">
          {staleLabel ? <p className="text-xs font-medium text-ink-muted">{staleLabel}</p> : null}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-[30px] font-extrabold tracking-[-0.9px] text-ink">오늘의 브리핑</h1>
              <p className="mt-1 text-sm text-ink-muted">
                {todayPrefix}
                {mainItems.length}편을 골랐습니다
                {serendipity ? ' · 곁가지 1편 포함' : ''}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">신뢰도 배지와 근거는 AI 보조 의견입니다</p>
            </div>
            {view.brief.audioSeconds != null ? (
              <Link
                href="/audio"
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-body"
              >
                <PlayIcon className="h-4 w-4" />
                오디오로 듣기
              </Link>
            ) : (
              <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-line-strong px-4 text-sm font-medium text-ink-muted opacity-60">
                오디오 준비 중
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {mainItems.map(({ item, paper, assessment }) => (
              <PaperCard key={item.paperId} item={item} paper={paper} assessment={assessment} layout="web" />
            ))}
          </div>
        </main>

        <aside className="flex flex-col gap-8">
          <div>
            <h2 className={SIDE_LABEL}>후속 소식</h2>
            {followUps.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-3">
                {followUps.map(({ item, paper }) => (
                  <li
                    key={paper.id}
                    className="rounded-xl border border-verified-line bg-verified-surface p-3 text-verified-deep"
                  >
                    <p className="text-sm font-medium leading-snug">{paper.title}</p>
                    <p className="mt-1 text-xs leading-relaxed">{item.followUp?.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">저장한 논문에 새 소식이 생기면 여기 표시됩니다.</p>
            )}
          </div>

          <div>
            <h2 className={SIDE_LABEL}>이번 주 관심사 흐름</h2>
            {byInterest.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {byInterest.map((row) => (
                  <li key={row.interestId} className="flex items-center justify-between text-sm text-ink-body">
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-ink-muted">{row.count}편</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">최근 7일 기록이 아직 없습니다.</p>
            )}
          </div>

          {serendipity ? (
            <div>
              <h2 className={SIDE_LABEL}>오늘의 곁가지</h2>
              <div
                className={`mt-3 rounded-xl bg-surface p-3 ${
                  serendipity.assessment?.track === 'notable' ? 'border-2 border-caution-line' : 'border border-line'
                }`}
              >
                {serendipity.assessment ? (
                  <TrackBadge track={serendipity.assessment.track} />
                ) : null}
                <Link
                  href={`/paper/${serendipity.paper.id}`}
                  className="mt-2 block font-display text-[15px] font-bold leading-snug text-ink hover:underline"
                >
                  {serendipity.paper.title}
                </Link>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{serendipity.item.oneLine}</p>
                {sourceUrl(serendipity.paper) ? (
                  <a
                    href={sourceUrl(serendipity.paper) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    원문
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="text-xs text-ink-muted">새벽에 수집·평가를 마쳤습니다.</p>
        </aside>
      </div>
    </>
  )
}
