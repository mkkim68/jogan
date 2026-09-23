import { CheckCircleIcon, WarningTriangleIcon } from '@/components/icons'

type Props = {
  track: 'verified' | 'notable'
  className?: string
}

const CONFIG = {
  verified: { label: '검증됨', Icon: CheckCircleIcon, tone: 'bg-verified-bg text-verified' },
  notable: { label: '심사 전', Icon: WarningTriangleIcon, tone: 'bg-caution-bg text-caution' },
} as const

/**
 * 신뢰도 배지 (docs/DESIGN.md §4). 배지는 두 종류뿐이고 점수 숫자는 절대 넣지 않는다 —
 * `검증됨`(체크 원, verified) / `심사 전`(경고 삼각형, caution).
 */
export function TrackBadge({ track, className = '' }: Props) {
  const { label, Icon, tone } = CONFIG[track]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-medium leading-none ${tone} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}
