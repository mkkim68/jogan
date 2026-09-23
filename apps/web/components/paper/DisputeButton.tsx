'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

type Props = { className?: string }

/**
 * `판정에 이의 제기` (docs/DESIGN.md §6, PRD §3.5 "판정에 이의를 제기하는 경로도 UI에 둔다").
 * 접수 창구가 아직 없으므로 누르면 안내 문구만 보여주는 작은 클라이언트 토글이다.
 */
export function DisputeButton({ className = '' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className={className}>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} aria-expanded={open}>
        판정에 이의 제기
      </Button>
      {open ? (
        <p role="status" className="mt-2 text-xs leading-relaxed text-ink-muted">
          접수 창구는 준비 중입니다.
        </p>
      ) : null}
    </div>
  )
}
