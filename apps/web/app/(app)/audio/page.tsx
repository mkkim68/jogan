import { getLatestBrief, getTodayBrief, todayInSeoul } from '@jogan/db'
import Link from 'next/link'
import { ChevronDownIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '@/components/icons'
import { formatAuthors } from '@/lib/paper-format'
import { requireUser } from '@/lib/session'

const ORDER_LABEL = 'text-[11px] font-semibold tracking-[1px] text-night-dim'

/**
 * `/audio` — 오디오 브리핑 (docs/DESIGN.md §6). 앱에서 유일한 다크 전체 화면.
 *
 * 시드의 `audioUrl`/`audioSeconds`는 항상 null이다 — 오디오 파일이 없다. 이 화면은
 * 완성된 레이아웃을 미리 보여주는 자리이고, 재생 관련 컨트롤은 전부 `disabled`다.
 * 진행률은 언제나 0%, 시간은 `--:--`로 고정한다. 진행되는 것처럼 보이는 애니메이션이나
 * 재생 중처럼 보이는 상태는 만들지 않는다 (CLAUDE.md 절대 규칙 1 — 없는 사실을 지어내지 않는다).
 *
 * "현재 읽는 문장" 박스: 실제로 읽고 있는 문장이 없으므로(재생 자체가 없다) 문장의 일부를
 * `night-strong`으로 강조해 "재생 중"처럼 보이게 하지 않는다. 대신 그 논문의 `oneLine`
 * 요약 문장 전체를 같은 톤(`night-soft`)으로 보여준다 — 실제 브리핑 데이터이되, 재생
 * 진행을 흉내 내지는 않는다.
 *
 * 페이지 루트는 `fixed inset-0`으로 뷰포트 전체를 덮는다 — 그렇지 않으면 ≥720px의 밝은
 * `TopBar`와 폰 폭에서 `(app)/layout.tsx`의 하단 패딩이 만드는 `bg-paper` 띠가 다크 화면
 * 아래로 비쳐 보인다("반전"이 절반만 되는 문제). `overflow-y-auto`로 내용이 길 때 이
 * 오버레이 안에서 스크롤한다.
 *
 * 하단 탭은 그와 별개로 숨긴다 (`BottomTabs`가 `pathname === '/audio'`일 때 `null`을 반환) —
 * 오버레이가 시각적으로 가려도 DOM에 탭이 남아 있으면 Tab 키로 오버레이 아래 요소에 도달할
 * 수 있기 때문에 두 가지가 함께 필요하다.
 */
export default async function AudioPage() {
  const user = await requireUser()
  const today = todayInSeoul()

  const todayView = await getTodayBrief(user.id, today)
  const view = todayView ?? (await getLatestBrief(user.id))

  if (!view || view.items.length === 0) {
    return (
      <div className="fixed inset-0 z-20 overflow-y-auto bg-night px-5 pt-4 text-night-text">
        <TopRow />
        <div className="mt-16 flex flex-col items-center gap-2 px-4 text-center">
          <p className="text-sm text-night-soft">아직 들을 브리핑이 없습니다.</p>
          <p className="text-xs text-night-muted">브리핑이 만들어지면 여기서 오디오로 들을 수 있습니다.</p>
          <Link
            href="/"
            className="mt-4 flex h-11 items-center justify-center rounded-[10px] border border-night-line px-5 text-sm font-medium text-night-soft hover:bg-night-surface"
          >
            브리핑으로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  const total = view.items.length
  const current = view.items[0]
  if (!current) return null
  const paper = current.paper

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-night px-5 pb-10 pt-4 text-night-text">
      <TopRow />

      <section className="mt-8">
        <p className="font-display text-xs font-bold tracking-[1.4px] text-night-accent">
          1번째 논문 · {total}편 중
        </p>
        <h1 className="mt-3 font-display text-[27px] font-extrabold leading-[1.3] tracking-[-1px] text-night-strong">
          {paper.title}
        </h1>
        <p className="mt-2 text-[11px] leading-[1.55] text-night-muted">{formatAuthors(paper.authors)}</p>
      </section>

      <section className="mt-6 rounded-2xl bg-night-surface p-4">
        <p className="text-sm leading-[1.68] text-night-soft">{current.item.oneLine}</p>
      </section>

      {/* 진행 바 — 오디오 파일이 없으므로 언제나 0%, 가짜 진행 애니메이션 없음 */}
      <div className="mt-6">
        <div className="h-1 w-full rounded-full bg-night-track" aria-hidden="true">
          <div className="h-1 w-0 rounded-full bg-night-accent" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-night-dim">
          <span>--:--</span>
          <span>--:--</span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled
          className="flex h-11 items-center rounded-[10px] px-2 text-sm font-medium text-night-muted disabled:opacity-60"
        >
          속도 1.2×
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled
            aria-label="이전 논문"
            className="flex h-11 w-11 items-center justify-center rounded-full text-night-soft disabled:opacity-60"
          >
            <SkipBackIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            disabled
            aria-label="재생 — 오디오 브리핑은 준비 중입니다"
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-night-text text-night disabled:opacity-60"
          >
            <PlayIcon className="h-8 w-8" />
          </button>
          <button
            type="button"
            disabled
            aria-label="다음 논문"
            className="flex h-11 w-11 items-center justify-center rounded-full text-night-soft disabled:opacity-60"
          >
            <SkipForwardIcon className="h-5 w-5" />
          </button>
        </div>

        <Link
          href={`/paper/${paper.id}`}
          className="flex h-11 items-center rounded-[10px] px-2 text-sm font-medium text-night-soft hover:bg-night-surface"
        >
          카드로 보기
        </Link>
      </div>

      <section className="mt-10">
        <h2 className={ORDER_LABEL}>오늘의 순서</h2>
        <ul className="mt-3 flex flex-col">
          {view.items.map(({ item, paper: itemPaper }, index) => (
            <li
              key={item.paperId}
              className="flex items-center gap-3 border-b border-night-line py-3 last:border-b-0"
            >
              <span className="w-4 shrink-0 text-xs tabular-nums text-night-muted">{index + 1}</span>
              <p className="min-w-0 flex-1 truncate text-sm text-night-soft">{itemPaper.title}</p>
              <span className="shrink-0 text-xs tabular-nums text-night-muted">대기</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-center text-xs leading-[1.6] text-night-soft">
        오디오 브리핑은 준비 중입니다 — 화면은 완성된 모습입니다
      </p>
    </div>
  )
}

function TopRow() {
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/"
        aria-label="오디오 브리핑 닫기"
        className="flex h-11 w-11 items-center justify-center rounded-full text-night-dim hover:bg-night-surface"
      >
        <ChevronDownIcon className="h-5 w-5" />
      </Link>
      <p className="text-[11px] font-semibold tracking-[1px] text-night-dim">오디오 브리핑</p>
    </div>
  )
}
