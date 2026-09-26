/** 임베딩 벡터 차원. 모델을 바꾸면 이 값과 DB 마이그레이션을 함께 바꾼다. */
export const EMBEDDING_DIM = 1024

/**
 * 사용자가 가질 수 있는 관심사 총 개수 상한. 온보딩 최초 등록(`OnboardingInput`)과
 * `/interests` 관리 화면(`AddInterestsInput`, `addInterestsAction`)이 같은 값을 쓴다 —
 * 한도가 다르면 규칙이 앞뒤가 안 맞고, `/interests` 목록 화면과 파이프라인의 사용자당
 * 평가 비용(CLAUDE.md 비용 규칙)이 이 값을 전제로 한다.
 */
export const MAX_INTERESTS = 5

export const PAPER_SOURCES = ['arxiv', 'biorxiv', 'medrxiv', 'pubmed', 'openalex'] as const
export const VENUE_KINDS = ['conference', 'journal', 'preprint'] as const
export const TRACKS = ['verified', 'notable'] as const
export const FIELDS = ['cs', 'bio_med', 'social', 'other'] as const
