'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { Switch } from '@/components/ui/Switch'
import { initialOnboardingState, submitOnboarding } from '@/lib/actions/interests'

/** docs/DESIGN.md §6 `/onboarding` — 추천 주제 칩 6개. 실제 논문이 아닌 예시 라벨 */
const RECOMMENDED_TOPICS = [
  'LLM 에이전트',
  '수면과 기억',
  '코드 리뷰 자동화',
  '단백질 구조 예측',
  '인과추론',
  '강화학습',
] as const

const DEFAULT_DEPARTURE_TIME = '08:10'
const DEFAULT_PAPERS_PER_DAY = 4

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(submitOnboarding, initialOnboardingState)
  const [selected, setSelected] = useState<string[]>([])
  const [customLabel, setCustomLabel] = useState('')
  const [papersPerDay, setPapersPerDay] = useState(DEFAULT_PAPERS_PER_DAY)
  const [includePreprints, setIncludePreprints] = useState(true)

  function toggleTopic(label: string) {
    setSelected((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]))
  }

  return (
    <form action={formAction} aria-busy={pending} className="flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-prose flex-1 px-5 pb-32 pt-12 tablet:px-0">
        <p className="font-display text-xs font-bold uppercase tracking-[1.4px] text-accent">
          3분이면 끝납니다
        </p>
        <h1 className="mt-2 font-display text-[27px] font-extrabold leading-tight tracking-[-1px] text-ink">
          어떤 논문을
          <br />
          받아보고 싶으신가요
        </h1>

        <div className="mt-8">
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
          <p className="mt-1.5 text-xs text-ink-muted">
            대표 논문 링크를 붙여 넣으면 취향을 더 정확히 잡습니다
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {RECOMMENDED_TOPICS.map((label) => {
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

        <div className="mt-10 border-t border-line-hair pt-8">
          <label htmlFor="departureTime" className="block text-sm font-medium text-ink-dim">
            집에서 나서는 시간
          </label>
          <p className="mt-1 text-xs text-ink-muted">알림은 이 5분 전에 보냅니다</p>
          <input
            id="departureTime"
            name="departureTime"
            type="time"
            required
            defaultValue={DEFAULT_DEPARTURE_TIME}
            className="mt-2 h-12 rounded-[10px] border border-line-strong bg-paper-subtle px-3.5 text-[15px] tabular-nums text-ink"
          />
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-line-hair pt-8">
          <div>
            <p className="text-sm font-medium text-ink-dim">하루 편수</p>
            <p className="mt-1 text-xs text-ink-muted">1~5편 사이에서 고를 수 있습니다</p>
          </div>
          <Stepper
            value={papersPerDay}
            onChange={setPapersPerDay}
            min={1}
            max={5}
            decreaseLabel="하루 편수 줄이기"
            increaseLabel="하루 편수 늘리기"
          />
        </div>
        <input type="hidden" name="papersPerDay" value={papersPerDay} />

        <div className="mt-8 flex items-center justify-between border-t border-line-hair pt-8">
          <div>
            <p className="text-sm font-medium text-ink-dim">심사 전 프리프린트 포함</p>
            <p className="mt-1 text-xs text-ink-muted">하루 최대 2편, 경고 라벨과 함께 보여줍니다</p>
          </div>
          <Switch checked={includePreprints} onChange={setIncludePreprints} aria-label="심사 전 프리프린트 포함" />
        </div>
        <input type="hidden" name="includePreprints" value={String(includePreprints)} />

        {state.error && (
          <p role="alert" className="mt-6 text-sm text-caution">
            {state.error}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper px-5 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 tablet:px-0">
        <div className="mx-auto w-full max-w-prose">
          <Button type="submit" size="lg" disabled={pending} className="w-full">
            {pending ? '등록하는 중…' : '내일 아침부터 받기'}
          </Button>
        </div>
      </div>
    </form>
  )
}
