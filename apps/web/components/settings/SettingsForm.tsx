'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { Switch } from '@/components/ui/Switch'
import { saveSettingsAction } from '@/lib/actions/interests'
import { initialSettingsState } from '@/lib/actions/interests-state'

type Props = {
  departureTime: string
  papersPerDay: number
  includePreprints: boolean
}

/**
 * `/settings` 저장 폼. 세 컨트롤은 `OnboardingForm`(`/onboarding`)과 동일한 컴포넌트·마크업을
 * 그대로 재사용한다 — 관심사 입력·추천 칩만 없다(그건 `/interests`가 맡는다).
 *
 * 초기값은 서버(`/settings/page.tsx`)가 `getSettings`로 읽어 props로 내려준 값이다.
 *
 * 저장 성공 표시: `useActionState`의 초기 상태(`initialSettingsState`)는 모듈 레벨 상수라
 * 액션이 새로 반환하는 `{ error: null }` 객체와 참조가 다르다. 그래서 `state`가
 * `initialSettingsState`와 다른 참조이면서 `error`가 없고 진행 중이 아니면 "이번 렌더는
 * 실제 제출 결과"라고 판단할 수 있다 — 별도의 `useEffect`/`ref` 없이 성공 배너를 띄운다.
 */
export function SettingsForm({
  departureTime,
  papersPerDay: initialPapersPerDay,
  includePreprints: initialIncludePreprints,
}: Props) {
  const [state, formAction, pending] = useActionState(saveSettingsAction, initialSettingsState)
  const [papersPerDay, setPapersPerDay] = useState(initialPapersPerDay)
  const [includePreprints, setIncludePreprints] = useState(initialIncludePreprints)

  const saved = state !== initialSettingsState && state.error === null && !pending

  return (
    <form action={formAction} aria-busy={pending} className="mt-8">
      <div>
        <label htmlFor="departureTime" className="block text-sm font-medium text-ink-dim">
          집에서 나서는 시간
        </label>
        <p className="mt-1 text-xs text-ink-muted">알림은 이 5분 전에 보냅니다</p>
        <input
          id="departureTime"
          name="departureTime"
          type="time"
          required
          defaultValue={departureTime}
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

      {state.error ? (
        <p role="alert" className="mt-6 text-sm text-caution">
          {state.error}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="mt-6 text-sm font-medium text-verified">
          저장했습니다 — 다음 새벽 배치부터 반영됩니다
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending} className="mt-8 w-full tablet:w-auto">
        {pending ? '저장하는 중…' : '저장'}
      </Button>
    </form>
  )
}
