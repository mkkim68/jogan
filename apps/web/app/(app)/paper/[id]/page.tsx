import { getPaperDetail, getRelatedInBrief, getTodayBrief, todayInSeoul } from '@jogan/db'
import { notFound } from 'next/navigation'
import { PaperCardView } from '@/components/paper/PaperCardView'
import { PaperReadView } from '@/components/paper/PaperReadView'
import { requireUser } from '@/lib/session'

/**
 * `/paper/[id]` — 카드 상세(폰)와 정독(웹) (docs/DESIGN.md §6).
 * 데이터는 한 번만 가져오고, 폰/웹 어느 뷰를 보여줄지는 CSS(`tablet:` 브레이크포인트)가 고른다.
 * 서버에서 뷰포트를 추정해 분기하지 않는다.
 */
export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()

  const detail = await getPaperDetail(id, user.id)
  if (!detail) notFound()

  const [related, brief] = await Promise.all([
    getRelatedInBrief(id, user.id),
    getTodayBrief(user.id, todayInSeoul()),
  ])
  const position = brief?.items.findIndex((item) => item.paper.id === id) ?? -1
  const total = brief?.items.length ?? 0

  return (
    <>
      <div className="tablet:hidden">
        <PaperCardView detail={detail} position={position} total={total} />
      </div>
      <div className="hidden tablet:block">
        <PaperReadView
          detail={detail}
          related={related}
          position={position}
          total={total}
          briefDate={brief?.brief.date ?? null}
        />
      </div>
    </>
  )
}
