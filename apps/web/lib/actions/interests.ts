'use server'

/**
 * 이 파일의 `useActionState` 초기 상태 타입·값(`OnboardingFormState`/`initialOnboardingState` 등)은
 * 여기 두지 않는다 — `lib/actions/interests-state.ts` 참고. `'use server'` 파일의 모든 export는
 * 서버 레퍼런스로 취급되고 async 함수만 그게 될 수 있어서, 일반 객체를 여기서 export해 클라이언트가
 * `useActionState`의 초기값으로 가져다 쓰면 실제 제출 때 500이 난다(타입만은 컴파일 타임에 지워지므로
 * `import type`으로 가져오는 건 안전하다).
 */

import {
  AddInterestsInput,
  Interest,
  MAX_INTERESTS,
  OnboardingInput,
  planInterestAdd,
  SettingsInput,
} from '@jogan/core'
import { addInterests, completeOnboarding, deleteInterest, listInterests, updateSettings } from '@jogan/db'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type {
  AddInterestsFormState,
  OnboardingFormState,
  RemoveInterestFormState,
  SettingsFormState,
} from '@/lib/actions/interests-state'
import { requireUser } from '@/lib/session'

/**
 * `includePreprints`가 `'true'`/`'false'` 중 하나로 명시적으로 왔는지 확인한다.
 * `formData.get('includePreprints') === 'true'`처럼 비교만 하면 필드가 아예 없거나
 * 잘린 POST에서도 조용히 `false`가 되어 프리프린트가 꺼진다 — CLAUDE.md 규칙 3이 신경 쓰는
 * 설정이라 값이 없으면 검증 자체를 거부해야 한다. `null`을 돌려주면 뒤의 zod 스키마가
 * `boolean`이 아니라며 파싱을 실패시킨다.
 */
function parseIncludePreprints(formData: FormData): boolean | null {
  const raw = formData.get('includePreprints')
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

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
    includePreprints: parseIncludePreprints(formData),
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

/**
 * `/interests` 관심사 추가 서버 액션.
 *
 * `userId`는 클라이언트에서 절대 받지 않는다 — 항상 `requireUser()`로 서버 세션에서 얻는다.
 * `useActionState`로 쓰이므로 시그니처는 (prevState, formData) => 다음 state.
 * 폼 필드 모양은 `submitOnboarding`과 맞춘다 — 칩으로 고른 `labels`(복수)와 직접 입력한
 * `customLabel`(단수) 하나를 합쳐 검증한다.
 *
 * `AddInterestsInput`의 `.max(MAX_INTERESTS)`는 "이번 제출 한 건"의 상한일 뿐이다.
 * 반복 호출로 총 개수가 무한정 늘어나는 것을 막기 위해, 여기서 기존 개수 + 새 라벨 수를
 * 합산해 `MAX_INTERESTS`를 넘으면 쓰지 않는다. 이 상한 산술과 "중복은 자리를 안 먹는다"는
 * 순수 규칙은 `@jogan/core`의 `planInterestAdd`로 빼서 단위 테스트한다(`packages/core/src/interest.test.ts`).
 *
 * 반환은 판별 가능한 형태(`AddInterestsFormState`)다 — 이미 가진 라벨만 다시 제출하면
 * `newLabels`가 비어 상한 검사는 통과하지만, DB에 쓸 것도 없어 화면이 한 글자도 안 바뀐다.
 * 예전에는 이걸 `{ error: null }`(=성공)과 구분할 방법이 없어 사용자가 성공/무시/실패를
 * 구분할 수 없었다 — `duplicate` 상태로 명시한다.
 *
 * 재검증: 이 화면 자체(`/interests`)와 `/`(좌 레일의 관심사 목록·관심사별 카운트)만 관심사 데이터를
 * 보여준다 — `TopBar`는 저장함 개수만, `(app)/layout.tsx`는 관심사 유무만 보고 리다이렉트 여부를
 * 판단할 뿐 목록을 렌더하지 않으므로 `/saved`·`/paper/[id]` 등은 건드릴 데이터가 없다.
 */

export async function addInterestsAction(
  _prevState: AddInterestsFormState,
  formData: FormData,
): Promise<AddInterestsFormState> {
  const user = await requireUser()

  const chipLabels = formData.getAll('labels').map(String)
  const customLabel = String(formData.get('customLabel') ?? '').trim()
  const labels = customLabel ? [...chipLabels, customLabel] : chipLabels

  const parsed = AddInterestsInput.safeParse({ labels })

  if (!parsed.success) {
    return {
      status: 'error',
      error:
        labels.length === 0
          ? '관심사를 하나 이상 입력해 주세요.'
          : `관심사는 한 번에 최대 ${MAX_INTERESTS}개까지 추가할 수 있습니다.`,
    }
  }

  const existing = await listInterests(user.id)
  const plan = planInterestAdd(
    existing.map((interest) => interest.label),
    parsed.data.labels,
    MAX_INTERESTS,
  )

  if (!plan.ok) {
    return {
      status: 'error',
      error: `관심사는 최대 ${MAX_INTERESTS}개까지입니다. 지금 ${existing.length}개이므로 ${plan.remaining}개만 더 추가할 수 있습니다.`,
    }
  }

  if (plan.newLabels.length === 0) {
    return { status: 'duplicate', error: null }
  }

  await addInterests(user.id, plan.newLabels)

  revalidatePath('/interests')
  revalidatePath('/')

  return { status: 'added', error: null, addedCount: plan.newLabels.length }
}

/**
 * `/interests` 관심사 삭제 서버 액션.
 *
 * `userId`는 클라이언트에서 절대 받지 않는다 — 항상 `requireUser()`로 서버 세션에서 얻는다.
 * `interestId`만 클라이언트에서 받고, `Interest` 스키마의 `id` 필드(uuid)로 검증한다.
 *
 * 시그니처는 `(interestId, prevState, formData)`다 — 화면에서
 * `removeInterestAction.bind(null, interestId)`로 앞의 `interestId`를 고정하면
 * 남는 `(prevState, formData) => state` 모양이 `useActionState`에 그대로 들어간다
 * (`toggleSave`처럼 폼 action에 직접 bind하는 방식과 달리, 이 액션은 에러 상태를 화면에
 * 돌려줘야 해서 `useActionState`가 필요하다 — 그래서 bind 대상 인자를 맨 앞에 둔다).
 *
 * 마지막 남은 관심사 삭제 금지 규칙의 진짜 방어선은 이제 `deleteInterest` 안에 있다 —
 * 트랜잭션 안에서 이 사용자의 관심사 행 전체를 `SELECT ... FOR UPDATE`로 먼저 잠근 뒤
 * 개수를 세고, 그 잠금이 유지된 채로 DELETE한다(DELETE 문 하나짜리 서브쿼리 `count(*)`
 * 조건은 같은 행을 동시에 지우는 경쟁만 막고 **서로 다른 행**을 동시에 지우는 경쟁은
 * 못 막아 한 번 불충분했던 적이 있다 — 자세한 이유는 `packages/db/src/queries/interests.ts`
 * 참고). 사전 카운트 검사만으로는 TOCTOU 경쟁(거의 동시에 두 삭제 요청이 도착)에서 지면
 * 관심사가 0개가 될 수 있었고, 복구 경로(`/onboarding` 재진입 → `completeOnboarding`)가
 * 온보딩 폼의 하드코딩 기본값으로 `user_settings`를 조용히 덮어써 대가가 컸다. 여기 남은
 * 사전 카운트 검사는 빠른 피드백용일 뿐이고, 비활성화된 버튼과 마찬가지로 UI 가드다 —
 * 조작된 POST는 버튼 상태도, 이 사전 검사도 우회할 수 있지만 `FOR UPDATE` 잠금은 우회할
 * 수 없다.
 *
 * `deleteInterest`가 `false`를 돌려주면(사전 검사를 통과했더라도) 실제로는 아무것도
 * 지워지지 않은 것이다 — 그 사이 마지막 1개가 됐거나, 이미 지워졌거나, 애초에 내 것이
 * 아니었던 경우다. 원인을 구분해 알려준다: 다시 세어봤을 때도 1개 이하면 "마지막 1개",
 * 아니면 "이미 없거나 내 것이 아님"이다. 침묵하지 않는다.
 *
 * 재검증: `addInterestsAction`과 동일한 이유로 `/interests`와 `/`만 대상이다.
 */

export async function removeInterestAction(
  interestId: string,
  _prevState: RemoveInterestFormState,
  _formData: FormData,
): Promise<RemoveInterestFormState> {
  const user = await requireUser()

  const parsedId = Interest.shape.id.safeParse(interestId)
  if (!parsedId.success) {
    return { error: '잘못된 관심사입니다.' }
  }

  const existing = await listInterests(user.id)
  if (existing.length <= 1) {
    return { error: '관심사는 최소 1개 이상 있어야 합니다.' }
  }

  const removed = await deleteInterest(user.id, parsedId.data)

  if (!removed) {
    const stillExisting = await listInterests(user.id)
    return {
      error:
        stillExisting.length <= 1
          ? '관심사는 최소 1개 이상 있어야 합니다.'
          : '이미 삭제되었거나 존재하지 않는 관심사입니다.',
    }
  }

  revalidatePath('/interests')
  revalidatePath('/')

  return { error: null }
}

/**
 * `/settings` 저장 서버 액션.
 *
 * `userId`는 클라이언트에서 절대 받지 않는다 — 항상 `requireUser()`로 서버 세션에서 얻는다.
 * `useActionState`로 쓰이므로 시그니처는 (prevState, formData) => 다음 state.
 * 성공해도 리다이렉트하지 않는다 — `/settings`는 계속 그 화면에 머물며 저장 결과를 보여주는
 * 화면이라 `submitOnboarding`과 달리 `redirect('/')`가 없다.
 *
 * 재검증: 출발 시각·하루 편수·프리프린트 포함 여부는 현재 `/settings` 화면에만 표시된다
 * (`/`의 좌 레일·TopBar 어디에도 이 값들을 렌더하는 곳이 없다) — 그래서 `/settings` 하나만
 * 재검증한다. 파이프라인이 이 값을 다음 새벽 배치부터 읽어가는 것이지 화면이 즉시 바뀌는
 * 다른 경로가 없다.
 */

export async function saveSettingsAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser()

  const parsed = SettingsInput.safeParse({
    departureTime: String(formData.get('departureTime') ?? ''),
    papersPerDay: Number(formData.get('papersPerDay')),
    includePreprints: parseIncludePreprints(formData),
  })

  if (!parsed.success) {
    return { error: '입력값을 확인해 주세요 — 출발 시각과 편수를 채워야 합니다.' }
  }

  await updateSettings({ ...parsed.data, userId: user.id })

  revalidatePath('/settings')

  return { error: null }
}
