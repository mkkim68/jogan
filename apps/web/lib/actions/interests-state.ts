/**
 * `lib/actions/interests.ts`의 `useActionState` 초기값들.
 *
 * `interests.ts`는 최상단에 `'use server'`가 있는 서버 액션 전용 파일이다. Next.js는
 * `'use server'` 파일의 모든 export를 서버 레퍼런스로 취급하는데, 이 레퍼런스는
 * **async 함수만** 될 수 있다 — 일반 객체를 그 파일에서 export해 클라이언트 컴포넌트가
 * 가져다 쓰면(`useActionState`의 두 번째 인자로), 실제 폼 제출 때 서버가 그 값을 레퍼런스로
 * 풀려다 "A "use server" file can only export async functions, found object" 로 500을 낸다.
 *
 * 그래서 초기 상태 타입·값은 서버 액션 함수들과 분리된 이 평범한 모듈에 둔다. 타입은
 * `interests.ts`가 `import type`으로 가져가고(타입은 컴파일 타임에 지워지므로 이 문제와
 * 무관하다), 값은 클라이언트 컴포넌트(`OnboardingForm`, `InterestRow`, `AddInterestForm`)가
 * 여기서 직접 가져간다.
 */

export type OnboardingFormState = { error: string | null }
export const initialOnboardingState: OnboardingFormState = { error: null }

export type AddInterestsFormState = { error: string | null }
export const initialAddInterestsState: AddInterestsFormState = { error: null }

export type RemoveInterestFormState = { error: string | null }
export const initialRemoveInterestState: RemoveInterestFormState = { error: null }

export type SettingsFormState = { error: string | null }
export const initialSettingsState: SettingsFormState = { error: null }
