'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { logout } from '@/lib/actions/account'

type Props = {
  name: string | null
  email: string
  image: string | null
}

/**
 * 웹 상단바 우측의 아바타(docs/DESIGN.md §6 "아바타 32px")를 누르면 여는 계정 메뉴.
 * 예전에는 아바타가 표시만 하고 아무 반응이 없었고, 웹 어디에도 로그아웃이 없었다.
 *
 * 원은 시안대로 32px, 버튼 터치 영역은 44px. Esc·바깥 클릭으로 닫힌다.
 */
export function AccountMenu({ name, email, image }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const label = name ?? email

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="계정 메뉴"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 외부(Google) 아바타, next/image 도메인 설정 범위 밖
          <img src={image} alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-paper"
          >
            {label.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-paper-subtle p-2 shadow-lg"
        >
          <div className="px-3 py-2">
            {name ? <p className="truncate text-sm font-semibold text-ink">{name}</p> : null}
            <p className="truncate text-xs text-ink-muted">{email}</p>
          </div>
          <div className="my-1 border-t border-line" />
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex h-11 items-center rounded-lg px-3 text-sm text-ink-dim hover:bg-paper-raised hover:text-ink"
          >
            설정
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm text-ink-dim hover:bg-paper-raised hover:text-ink"
            >
              로그아웃
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
