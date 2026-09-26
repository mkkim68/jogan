import { MAX_INTERESTS } from '@jogan/core'
import { countByInterest } from '@jogan/db'
import { AddInterestForm } from '@/components/interests/AddInterestForm'
import { InterestRow } from '@/components/interests/InterestRow'
import { listInterests } from '@/lib/data'
import { requireUser } from '@/lib/session'

/**
 * `/interests` — 관심사 관리 (docs/DESIGN.md에 이 화면의 시안은 없다. §1 색·§2 타입·§3 간격
 * 토큰과 `/onboarding`·`/saved`의 기존 패턴을 그대로 재사용해 짰다).
 *
 * `listInterests`는 `lib/data.ts`의 요청 캐시 버전을 쓴다 — `(app)/layout.tsx`가 같은
 * 요청 안에서 이미 호출하므로 여기서 다시 불러도 쿼리가 중복되지 않는다.
 * `countByInterest`는 이 화면에서만 쓰므로 `@jogan/db`를 직접 부른다.
 */
export default async function InterestsPage() {
  const user = await requireUser()
  const [interests, counts] = await Promise.all([listInterests(user.id), countByInterest(user.id, 7)])

  const countByInterestId = new Map(counts.map((row) => [row.interestId, row.count]))
  const canDelete = interests.length > 1

  return (
    <div className="mx-auto max-w-prose px-5 pb-12 pt-6 tablet:px-0">
      <h1 className="font-display text-[27px] font-extrabold tracking-[-0.6px] text-ink tablet:text-[30px] tablet:tracking-[-0.9px]">
        관심사
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {interests.length}개 · 최대 {MAX_INTERESTS}개까지 등록할 수 있습니다
      </p>

      <ul className="mt-6 flex flex-col gap-3">
        {interests.map((interest) => (
          <InterestRow
            key={interest.id}
            interestId={interest.id}
            label={interest.label}
            weekCount={countByInterestId.get(interest.id) ?? 0}
            canDelete={canDelete}
          />
        ))}
      </ul>

      <AddInterestForm ownedLabels={interests.map((interest) => interest.label)} />
    </div>
  )
}
