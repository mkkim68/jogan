import { getPaperDetail } from '@jogan/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeftIcon } from '@/components/icons'
import { TrustDetail } from '@/components/paper/TrustDetail'
import { requireUser } from '@/lib/session'

/**
 * `/paper/[id]/trust` — 신뢰도 근거 (docs/DESIGN.md §6).
 * 논문이 없으면 404, 평가가 아직 없으면(가짜 단계 카드를 그리지 않고) 안내만 보여준다.
 */
export default async function PaperTrustPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()

  const detail = await getPaperDetail(id, user.id)
  if (!detail) notFound()

  return (
    <div className="mx-auto max-w-prose px-5 pb-12 pt-5 tablet:px-0">
      <div className="flex items-center gap-2">
        <Link
          href={`/paper/${id}`}
          aria-label="뒤로"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-dim hover:bg-paper-raised"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="font-display text-lg font-bold tracking-[-0.3px] text-ink">신뢰도 근거</h1>
      </div>

      {detail.assessment ? (
        <TrustDetail assessment={detail.assessment} title={detail.paper.title} />
      ) : (
        <div className="mt-5 rounded-2xl border border-line bg-surface p-5 text-sm leading-[1.6] text-ink-muted">
          아직 평가되지 않았습니다. 평가가 끝나면 이 논문의 신뢰도 근거가 여기 표시됩니다.
        </div>
      )}
    </div>
  )
}
