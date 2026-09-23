import type { Evidence } from '@jogan/core'
import { Chip } from '@/components/ui/Chip'

type Props = {
  evidence: Evidence[]
  /** 폰 기본 3, 웹은 4까지 노출 (docs/DESIGN.md §6) */
  max?: number
  className?: string
}

/**
 * 자르기 전에 `caution` 항목을 앞으로 정렬한다(동률은 원래 순서 유지, `Array#sort`는 안정 정렬).
 * `evidence.slice(0, max)`가 배열 순서 그대로 자르면 부정 신호가 뒤에 있다는 이유만으로
 * 먼저 잘려나갈 수 있다 — 초록색 칩만 남는 카드는 CLAUDE.md 절대 규칙 2가 막으려는 상황이다.
 * `PaperReadView.tsx`의 같은 slice도 이 함수를 써서 한 곳에서만 고치면 되게 한다.
 */
export function sortEvidenceForDisplay(evidence: Evidence[]): Evidence[] {
  return [...evidence].sort((a, b) => {
    if (a.verdict === b.verdict) return 0
    return a.verdict === 'caution' ? -1 : 1
  })
}

/**
 * 신뢰도 근거 칩 (CLAUDE.md 절대 규칙 2, docs/DESIGN.md §4).
 * `assessments.evidence`에 있는 문장만 그대로 옮긴다 — 짧은 라벨을 새로 만들지 않는다.
 * `verdict === 'caution'`인 항목은 경고 톤으로 시각적으로 구분한다.
 */
export function EvidenceChips({ evidence, max = 3, className = '' }: Props) {
  const shown = sortEvidenceForDisplay(evidence).slice(0, max)
  if (shown.length === 0) return null

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map((item, index) => (
        <li key={`${item.stage}-${index}`}>
          <Chip tone={item.verdict === 'caution' ? 'caution' : 'neutral'}>{item.text}</Chip>
        </li>
      ))}
    </ul>
  )
}
