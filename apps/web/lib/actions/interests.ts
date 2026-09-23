'use server'

import { OnboardingInput } from '@jogan/core'
import { completeOnboarding, listInterests } from '@jogan/db'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'

/**
 * `/onboarding` 제출 서버 액션.
 *
 * `userId`는 클라이언트에서 절대 받지 않는다 — 항상 `requireUser()`로 서버 세션에서 얻는다.
 * `useActionState`로 쓰이므로 시그니처는 (prevState, formData) => 다음 state.
 * 검증 실패는 throw하지 않고 `{ error }`를 돌려줘 폼에 표시한다 — 이때는 아무것도 쓰지 않는다.
 * 관심사 삽입과 설정 upsert는 `@jogan/db`의 `completeOnboarding` 트랜잭션 하나로 묶여 있다 —
 * 이 액션은 그 함수 하나만 호출하고, 두 쓰기를 직접 조율하지 않는다.
 * `redirect()`는 Next 내부적으로 던지는 신호이므로 try/catch로 감싸지 않는다.
 *
 * 재제출 가드: 맨 앞에서 이미 관심사가 있는지 확인한다 — 페이지의 GET 가드
 * (`onboarding/page.tsx`가 `interests.length > 0`이면 `/`로 보내는 것)와 같은 조건을
 * POST 경로에도 건다. bfcache 뒤로가기 후 재제출, 중복 탭, 재전송된 POST 모두 이 가드를 거친다.
 */

export type OnboardingFormState = { error: string | null }

export const initialOnboardingState: OnboardingFormState = { error: null }

export async function submitOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const user = await requireUser()

  const existing = await listInterests(user.id)
  if (existing.length > 0) redirect('/')

  const chipLabels = formData.getAll('labels').map(String)
  const customLabel = String(formData.get('customLabel') ?? '').trim()
  const labels = customLabel ? [...chipLabels, customLabel] : chipLabels

  const parsed = OnboardingInput.safeParse({
    labels,
    departureTime: String(formData.get('departureTime') ?? ''),
    papersPerDay: Number(formData.get('papersPerDay')),
    includePreprints: formData.get('includePreprints') === 'true',
  })

  if (!parsed.success) {
    return {
      error:
        labels.length === 0
          ? '관심사를 하나 이상 골라 주세요.'
          : '입력값을 확인해 주세요 — 관심사는 최대 5개, 출발 시각과 편수를 채워야 합니다.',
    }
  }

  const { labels: validLabels, departureTime, papersPerDay, includePreprints } = parsed.data

  await completeOnboarding(user.id, validLabels, {
    userId: user.id,
    departureTime,
    papersPerDay,
    includePreprints,
  })

  redirect('/')
}
