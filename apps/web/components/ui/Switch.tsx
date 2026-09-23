'use client'

type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  'aria-label'?: string
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onChange, disabled, className = '', ...props }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={props['aria-label']}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-11 w-[52px] shrink-0 items-center justify-center disabled:opacity-50 ${className}`}
    >
      <span
        className={`relative h-7 w-[50px] rounded-full transition-colors ${
          checked ? 'bg-verified' : 'bg-line-strong'
        }`}
      >
        <span
          className={`absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-surface shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}
