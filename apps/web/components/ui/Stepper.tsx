'use client'

import { MinusIcon, PlusIcon } from '../icons'

type Props = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  decreaseLabel?: string
  increaseLabel?: string
  className?: string
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  decreaseLabel = '줄이기',
  increaseLabel = '늘리기',
  className = '',
}: Props) {
  const canDecrease = value - step >= min
  const canIncrease = value + step <= max

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={!canDecrease}
        onClick={() => onChange(Math.max(min, value - step))}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-line-strong text-ink disabled:opacity-40"
      >
        <MinusIcon className="h-5 w-5" />
      </button>
      <span className="min-w-[2ch] text-center text-base font-semibold tabular-nums text-ink">{value}</span>
      <button
        type="button"
        aria-label={increaseLabel}
        disabled={!canIncrease}
        onClick={() => onChange(Math.min(max, value + step))}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-line-strong text-ink disabled:opacity-40"
      >
        <PlusIcon className="h-5 w-5" />
      </button>
    </div>
  )
}
