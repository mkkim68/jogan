'use client'

type Option = {
  value: string
  label: string
}

type Props = {
  options: Option[]
  value: string
  onChange: (value: string) => void
  'aria-label': string
  className?: string
}

export function SegmentedControl({ options, value, onChange, className = '', ...props }: Props) {
  return (
    <div
      role="tablist"
      aria-label={props['aria-label']}
      className={`inline-flex h-11 overflow-hidden rounded-[10px] bg-paper-raised shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)] ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`h-11 flex-1 px-4 text-sm font-medium transition-colors ${
              selected ? 'bg-surface text-ink' : 'text-ink-dim hover:bg-paper'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
