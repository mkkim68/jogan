import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'lg' | 'md'
}

const VARIANT = {
  primary: 'bg-ink text-paper hover:bg-ink-body',
  secondary: 'bg-surface text-ink-body border border-line-strong hover:bg-paper-raised',
  ghost: 'text-ink-dim hover:bg-paper-raised',
} as const

const SIZE = { lg: 'h-[54px] rounded-xl text-[15px]', md: 'h-11 rounded-[10px] text-sm' } as const

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center px-4 font-medium transition-colors disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    />
  )
}
