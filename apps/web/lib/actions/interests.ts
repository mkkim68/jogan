'use server'

import { OnboardingInput } from '@jogan/core'
import { createInterests, upsertSettings } from '@jogan/db'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/session'

/**
 * `/onboarding` 제출 서버 액션.
 *
 * `userId`는 클라이언트에서 절대 받지 않는다 — 항상 `requireUser()`로 서버 세션에서 얻는다.
 * `useActionState`로 쓰이므로 시그니처는 (prevState, formData) => 다음 state.
 * 검증 실패는 throw하지 않고 `{ error }`를 돌려줘 폼에 표시한다 — 이때는 아무것도 쓰지 않는다.
 * 검증을 통과했을 때만 `createInterests` + `upsertSettings`를 쓰고, 그 다음에만 `redirect('/')`한다.
 * `redirect()`는 Next 내부적으로 던지는 신호이므로 try/catch로 감싸지 않는다.
 */

export type OnboardingFormState = { error: string | null }

export const initialOnboardingState: OnboardingFormState = { error: null }

export async function submitOnboarding(
  _prevState: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const user = await requireUser()

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

  await createInterests(user.id, validLabels)
  await upsertSettings({ userId: user.id, departureTime, papersPerDay, includePreprints })

  redirect('/')
}
