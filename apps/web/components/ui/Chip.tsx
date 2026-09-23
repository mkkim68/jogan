import type { HTMLAttributes } from 'react'

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'verified' | 'caution'
}

const TONE = {
  neutral: 'bg-surface text-ink-dim border border-line',
  verified: 'bg-verified-bg text-verified',
  caution: 'bg-caution-surface text-caution border border-caution-line',
} as const

export function Chip({ tone = 'neutral', className = '', ...props }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-[10.5px] font-medium leading-none ${TONE[tone]} ${className}`}
      {...props}
    />
  )
}
