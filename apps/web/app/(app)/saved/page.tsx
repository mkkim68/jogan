import { listSaved, todayInSeoul } from '@jogan/db'
import type { SavedRow } from '@/components/saved/SavedList'
import { SavedList } from '@/components/saved/SavedList'
import { sourceUrl } from '@/lib/link'
import { formatSavedDate } from '@/lib/paper-format'
import { requireUser } from '@/lib/session'

/** Asia/Seoul 자정 기준 "YYYY-MM-DD" 문자열로 두 날짜를 비교한다 */
function seoulDateString(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

/**
 * `/saved` — 저장함 (docs/DESIGN.md §6).
 *
 * `listSaved`를 한 번만 호출해 세그먼트 필터링용 원본 데이터를 `SavedList`(클라이언트 컴포넌트)에
 * 통째로 넘긴다 — 세그먼트를 바꿀 때 추가 서버 왕복이 없다.
 *
 * "이번 주 N편"과 오늘 저장한 편수는 `savedAt`을 실제로 세어 계산한다 — 지어낸 수치를 쓰지 않는다
 * (CLAUDE.md 절대 규칙 1). 배너의 "PC 웹으로 이어보기"는 이 앱이 이미 반응형 PWA라 사실이지만,
 * Zotero 연동은 없으므로 언급하지 않는다.
 */
export default async function SavedPage() {
  const user = await requireUser()
  const saved = await listSaved(user.id)

  const today = todayInSeoul()
  const weekStart = Date.parse(`${today}T00:00:00+09:00`) - 7 * 86_400_000
  const savedThisWeek = saved.filter((s) => s.item.savedAt.getTime() >= weekStart).length
  const savedToday = saved.filter((s) => seoulDateString(s.item.savedAt) === today).length

  const rows: SavedRow[] = saved.map(({ item, paper, assessment }) => ({
    paperId: paper.id,
    title: paper.title,
    savedLabel: formatSavedDate(item.savedAt),
    isRead: item.readAt != null,
    track: assessment?.track ?? null,
    sourceHref: sourceUrl(paper),
    followUp: item.followUp,
  }))

  return (
    <div className="mx-auto max-w-prose px-5 pb-12 pt-6 tablet:px-0">
      <h1 className="font-display text-[27px] font-extrabold tracking-[-0.6px] text-ink tablet:text-[30px] tablet:tracking-[-0.9px]">
        저장함
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {saved.length}편 · 이번 주 {savedThisWeek}편
      </p>

      {savedToday > 0 ? (
        <div className="mt-4 rounded-xl border border-verified-line bg-verified-surface p-3 text-verified-deep">
          <p className="text-sm leading-relaxed">
            회사 가서 이어보기 — PC 웹으로 오늘 저장한 {savedToday}편이 그대로 열립니다.
          </p>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-ink-muted">아직 저장한 논문이 없습니다.</p>
          <p className="text-xs text-ink-muted">브리핑 카드에서 저장 버튼을 누르면 여기 모입니다.</p>
        </div>
      ) : (
        <SavedList rows={rows} />
      )}
    </div>
  )
}
