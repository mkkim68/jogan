'use client'

import { useActionState } from 'react'
import { TrashIcon } from '@/components/icons'
import { removeInterestAction } from '@/lib/actions/interests'
import { initialRemoveInterestState } from '@/lib/actions/interests-state'

type Props = {
  interestId: string
  label: string
  weekCount: number
  canDelete: boolean
}

/**
 * `/interests` 목록 한 행 — accent 도트 + 라벨 + "이번 주 N편" + 삭제 버튼.
 *
 * 삭제는 진짜 폼 제출이다(`removeInterestAction.bind(null, interestId)`), fetch가 아니다.
 * `removeInterestAction`은 에러 상태를 돌려줘야 해서 `useActionState`로 쓴다 — 각 행이
 * 독립된 컴포넌트 인스턴스이므로 행마다 훅을 하나씩 갖는 게 안전하다(목록 안에서 직접
 * map 콜백에 훅을 넣으면 행 개수가 바뀔 때 훅 규칙을 어긴다).
 *
 * `canDelete`는 서버가 계산해 내려주는 "관심사가 2개 이상인가"다. 마지막 하나만 남았을 때
 * 버튼을 비활성화하고 이유를 보여주지만, 실제 방어선은 `removeInterestAction` 내부의
 * 개수 확인이다 — 여기 disabled는 UI 가드일 뿐이다.
 */
export function InterestRow({ interestId, label, weekCount, canDelete }: Props) {
  const [state, formAction, pending] = useActionState(
    removeInterestAction.bind(null, interestId),
    initialRemoveInterestState,
  )

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink">{label}</p>
          <p className="mt-0.5 text-xs text-ink-muted">이번 주 {weekCount}편</p>
        </div>
        <form action={formAction}>
          <button
            type="submit"
            aria-label={`${label} 삭제`}
            disabled={!canDelete || pending}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-paper-raised hover:text-accent disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </form>
      </div>

      {!canDelete ? (
        <p className="mt-2 text-[11px] text-ink-muted">
          관심사는 최소 1개 이상 있어야 해서 마지막 하나는 삭제할 수 없습니다.
        </p>
      ) : null}

      {state.error ? (
        <p role="alert" className="mt-2 text-[11px] text-caution">
          {state.error}
        </p>
      ) : null}
    </li>
  )
}
