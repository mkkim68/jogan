'use client'

import { useEffect, useState } from 'react'

type Props = {
  message: string
}

/**
 * 저장 성공 등 일시적 알림 토스트 (docs/DESIGN.md §4 접근성 원칙에 따라 포커스를 가로채지
 * 않는 비대화형 요소).
 *
 * `role="status"` + `aria-live="polite"`로 스크린리더에 한 번 알리고 약 2초 뒤 스스로
 * 사라진다. `prefers-reduced-motion`이면 페이드 애니메이션만 건너뛴다(그래도 그대로
 * 사라짐) — 자동 소멸 타이밍 자체는 그대로 유지한다.
 *
 * 호출부가 `saved`(성공 직후 한 렌더만 참인 파생 상태)가 참일 때만 이 컴포넌트를 마운트하고,
 * 다음 제출이 시작되면(`pending`) 언마운트하므로, 매 저장마다 새 인스턴스로 타이머가
 * 자연스럽게 리셋된다 — 별도의 key 관리가 필요 없다.
 */
export function Toast({ message }: Props) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[76px] z-20 flex justify-center px-5 tablet:bottom-8"
    >
      <p className="animate-toast-fade motion-reduce:animate-none rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper shadow-lg">
        {message}
      </p>
    </div>
  )
}
