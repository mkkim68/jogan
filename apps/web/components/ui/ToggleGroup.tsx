'use client'

type Option<T extends string> = {
  value: T
  label: string
}

type Props<T extends string> = {
  options: [Option<T>, Option<T>]
  value: T
  onChange: (value: T) => void
  'aria-label': string
  className?: string
}

/**
 * 두 상태를 오가는 컴팩트 토글. `SegmentedControl`(탭 패턴, `role="tablist"`)을 대체한다 —
 * `/saved`처럼 라벨에 숫자를 넣으면 좁은 화면에서 줄바꿈되던 문제라, 라벨을 짧게 유지하고
 * (숫자는 호출부가 별도 텍스트로 보여준다) 우측 정렬해도 자연스럽게 한 줄에 맞도록 만들었다.
 *
 * 탭이 아니라 순수 토글이라 각 버튼은 `aria-pressed`로 자기 상태를 알린다.
 */
export function ToggleGroup<T extends string>({ options, value, onChange, className = '', ...props }: Props<T>) {
  return (
    <div
      role="group"
      aria-label={props['aria-label']}
      className={`inline-flex h-11 shrink-0 overflow-hidden rounded-[10px] bg-paper-raised shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)] ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`h-11 whitespace-nowrap px-4 text-sm font-medium transition-colors ${
              active ? 'bg-surface text-ink' : 'text-ink-dim hover:bg-paper'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
