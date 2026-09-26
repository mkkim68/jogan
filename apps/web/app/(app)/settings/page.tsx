import { getSettings } from '@jogan/db'
import { SettingsForm } from '@/components/settings/SettingsForm'
import { requireUser } from '@/lib/session'

// `/onboarding`(`OnboardingForm`)의 기본값과 동일하다 — 두 화면이 같은 세 컨트롤을 공유한다.
const DEFAULT_DEPARTURE_TIME = '08:10'
const DEFAULT_PAPERS_PER_DAY = 4

/**
 * `/settings` — 알림·편수·프리프린트 설정 (docs/DESIGN.md에 이 화면의 시안은 없다.
 * §1 색·§2 타입·§3 간격 토큰과 `/onboarding`·`/interests`의 기존 패턴을 그대로 재사용해 짰다).
 *
 * `getSettings`가 null이면(정상 플로우에서는 `(app)/layout.tsx`가 관심사 0개인 사용자를
 * `/onboarding`으로 이미 돌려보내므로 거의 일어나지 않지만, `completeOnboarding`이 관심사와
 * 설정을 한 트랜잭션으로 묶어도 방어적으로 대비한다) `/onboarding`과 같은 기본값을 보여주되,
 * 그 값이 이미 저장된 값인 것처럼 말하지 않는다 — 저장 전까지는 여전히 기본값일 뿐이다.
 */
export default async function SettingsPage() {
  const user = await requireUser()
  const settings = await getSettings(user.id)

  return (
    <div className="mx-auto max-w-prose px-5 pb-12 pt-6 tablet:px-0">
      <h1 className="font-display text-[27px] font-extrabold tracking-[-0.6px] text-ink tablet:text-[30px] tablet:tracking-[-0.9px]">
        설정
      </h1>
      {settings ? (
        <p className="mt-1 text-sm text-ink-muted">알림·하루 편수·프리프린트 포함 여부를 바꿀 수 있습니다</p>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">
          아직 저장된 설정이 없어 기본값을 보여줍니다 — 저장해야 다음 새벽 배치부터 반영됩니다
        </p>
      )}

      <SettingsForm
        departureTime={settings?.departureTime ?? DEFAULT_DEPARTURE_TIME}
        papersPerDay={settings?.papersPerDay ?? DEFAULT_PAPERS_PER_DAY}
        includePreprints={settings?.includePreprints ?? true}
      />
    </div>
  )
}
