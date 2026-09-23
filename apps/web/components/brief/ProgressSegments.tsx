type Props = {
  /** 오늘 브리핑 안에서 이 논문의 0-based 위치. 브리핑에 없으면 -1 */
  position: number
  /** 오늘 브리핑의 전체 편수. 0이면 렌더링하지 않는다 (가짜 진행 표시를 만들지 않는다) */
  total: number
  className?: string
}

/**
 * 카드 상세(폰) 상단 진행 세그먼트 (docs/DESIGN.md §6 `/paper/[id]`).
 * "N / total"과 세그먼트 바. 오늘 브리핑에 속하지 않은 논문(저장함에서 바로 들어온 경우 등)은
 * position이 -1이라 렌더링을 건너뛴다 — 없는 진행 상황을 지어내지 않는다.
 */
export function ProgressSegments({ position, total, className = '' }: Props) {
  if (total <= 0 || position < 0) return null

  return (
    <div className={className}>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full ${index <= position ? 'bg-ink' : 'bg-line'}`}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] tabular-nums text-ink-muted">
        {position + 1} / {total}
      </p>
    </div>
  )
}
