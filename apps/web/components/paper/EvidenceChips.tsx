import type { Evidence } from '@jogan/core'
import { Chip } from '@/components/ui/Chip'

type Props = {
  evidence: Evidence[]
  /** 폰 기본 3, 웹은 4까지 노출 (docs/DESIGN.md §6) */
  max?: number
  className?: string
}

/**
 * 신뢰도 근거 칩 (CLAUDE.md 절대 규칙 2, docs/DESIGN.md §4).
 * `assessments.evidence`에 있는 문장만 그대로 옮긴다 — 짧은 라벨을 새로 만들지 않는다.
 * `verdict === 'caution'`인 항목은 경고 톤으로 시각적으로 구분한다.
 */
export function EvidenceChips({ evidence, max = 3, className = '' }: Props) {
  const shown = evidence.slice(0, max)
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
