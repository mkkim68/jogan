import type { FollowUp } from '@jogan/core'
import { CheckCircleIcon } from '@/components/icons'

type Props = {
  followUp: FollowUp
  className?: string
}

/**
 * 후속 소식 블록 (docs/DESIGN.md §6 `/saved`) — PRD가 꼽는 가장 큰 차별점인
 * 프리프린트 후속 추적(채택/반박/정정)을 보여준다.
 *
 * `savedItems.followUp.text`에 실제로 기록된 문장만 그대로 옮긴다. 여기서 문구를
 * 새로 짓지 않는다 (CLAUDE.md 절대 규칙 1) — `followUp`이 없는 저장 항목에는 이 컴포넌트를
 * 아예 렌더링하지 않는 쪽이 호출부의 책임이다.
 */
export function FollowUpNote({ followUp, className = '' }: Props) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border border-verified-line bg-verified-surface p-3 text-verified-deep ${className}`}
    >
      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
      <p className="text-sm leading-relaxed">{followUp.text}</p>
    </div>
  )
}
