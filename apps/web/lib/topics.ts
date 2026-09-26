/**
 * 추천 주제 칩 6개 (docs/DESIGN.md §6 `/onboarding`). 실제 논문이 아닌 예시 라벨이다.
 *
 * `/onboarding`(OnboardingForm)과 `/interests`(AddInterestForm) 양쪽에서 같은 목록을 써야
 * 사용자가 온보딩 때 본 칩과 관심사 화면에서 추가할 때 보는 칩이 어긋나지 않는다.
 */
export const RECOMMENDED_TOPICS = [
  'LLM 에이전트',
  '수면과 기억',
  '코드 리뷰 자동화',
  '단백질 구조 예측',
  '인과추론',
  '강화학습',
] as const
