'use client'

import { useActionState, useEffect, useState } from 'react'
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
 *
 * `addInterestsAction`은 판별 가능한 상태(`AddInterestsFormState`)를 돌려준다.
 * `status === 'added'`일 때만 입력창·칩 선택을 비운다 — `duplicate`는 아무것도 쓰이지
 * 않았으므로 사용자가 방금 고른 것을 그대로 보면서 메시지만 확인하는 편이 낫다.
 * 이 리셋은 `useEffect`로 한다: `state`는 매 제출마다 새 객체 참조로 바뀌므로, 의존성
 * 배열에 `state`를 두면 실제 제출 결과가 올 때만(로컬 `setSelected`/`setCustomLabel`
 * 호출로 리렌더가 일어나도 `state` 참조 자체는 안 바뀌므로) 정확히 한 번 실행된다.
 */
export function AddInterestForm({ ownedLabels }: Props) {
  const [state, formAction, pending] = useActionState(addInterestsAction, initialAddInterestsState)
  const [selected, setSelected] = useState<string[]>([])
  const [customLabel, setCustomLabel] = useState('')

  useEffect(() => {
    if (state.status === 'added') {
      setSelected([])
      setCustomLabel('')
    }
  }, [state])

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

      {state.status === 'error' ? (
        <p role="alert" className="mt-4 text-sm text-caution">
          {state.error}
        </p>
      ) : null}

      {state.status === 'duplicate' ? (
        <p role="status" className="mt-4 text-sm text-ink-dim">
          이미 등록된 관심사입니다.
        </p>
      ) : null}

      {state.status === 'added' ? (
        <p role="status" className="mt-4 text-sm font-medium text-verified">
          {state.addedCount}개를 추가했습니다.
        </p>
      ) : null}

      <Button type="submit" size="md" disabled={pending} className="mt-5">
        {pending ? '추가하는 중…' : '관심사 추가'}
      </Button>
    </form>
  )
}
