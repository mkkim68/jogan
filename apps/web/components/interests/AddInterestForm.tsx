'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { addInterestsAction } from '@/lib/actions/interests'
import { initialAddInterestsState } from '@/lib/actions/interests-state'
import { RECOMMENDED_TOPICS } from '@/lib/topics'

type Props = {
  /** 사용자가 이미 가진 관심사 라벨 — 추천 칩 중 겹치는 것은 토글 대신 "추가됨" 표시로 바꾼다 */
  ownedLabels: string[]
}

/**
 * `/interests` 하단 추가 폼. `OnboardingForm`과 폼 필드 모양을 맞춘다 — 칩으로 고른
 * `labels`(복수, hidden input)와 직접 입력한 `customLabel`(단수)을 함께 제출한다.
 *
 * 이미 가진 라벨은 칩을 눌러도 다시 선택할 수 없게 만드는 대신, 아예 버튼이 아닌
 * 정적 표시로 바꾼다 — 눌러도 아무 일도 없는 버튼보다 "이미 추가됨"이라고 말하는 편이
 * 사용자에게 더 정직하다.
 */
export function AddInterestForm({ ownedLabels }: Props) {
  const [state, formAction, pending] = useActionState(addInterestsAction, initialAddInterestsState)
  const [selected, setSelected] = useState<string[]>([])
  const [customLabel, setCustomLabel] = useState('')

  const owned = new Set(ownedLabels)

  function toggleTopic(label: string) {
    setSelected((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]))
  }

  return (
    <form action={formAction} aria-busy={pending} className="mt-10 border-t border-line-hair pt-8">
      <h2 className="font-display text-[20px] font-bold tracking-[-0.4px] text-ink">관심사 추가</h2>

      <div className="mt-4">
        <label htmlFor="customLabel" className="block text-sm font-medium text-ink-dim">
          관심사
        </label>
        <input
          id="customLabel"
          name="customLabel"
          type="text"
          value={customLabel}
          onChange={(event) => setCustomLabel(event.target.value)}
          placeholder="예: 멀티모달 검색"
          className="mt-2 h-12 w-full rounded-[10px] border border-line-strong bg-paper-subtle px-3.5 text-[15px] text-ink placeholder:text-ink-muted"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {RECOMMENDED_TOPICS.map((label) => {
          if (owned.has(label)) {
            return (
              <span
                key={label}
                className="flex h-11 items-center rounded-full border border-line bg-paper-raised px-4 text-[13px] font-medium text-ink-muted"
              >
                {label} · 추가됨
              </span>
            )
          }

          const isSelected = selected.includes(label)
          return (
            <button
              key={label}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleTopic(label)}
              className={`flex h-11 items-center rounded-full px-4 text-[13px] font-medium transition-colors ${
                isSelected ? 'bg-verified text-paper' : 'border border-line bg-surface text-ink-dim'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {selected.map((label) => (
        <input key={label} type="hidden" name="labels" value={label} />
      ))}

      {state.error ? (
        <p role="alert" className="mt-4 text-sm text-caution">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="md" disabled={pending} className="mt-5">
        {pending ? '추가하는 중…' : '관심사 추가'}
      </Button>
    </form>
  )
}
