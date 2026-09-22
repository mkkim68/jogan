/** 임베딩 벡터 차원. 모델을 바꾸면 이 값과 DB 마이그레이션을 함께 바꾼다. */
export const EMBEDDING_DIM = 1024

export const PAPER_SOURCES = ['arxiv', 'biorxiv', 'medrxiv', 'pubmed', 'openalex'] as const
export const VENUE_KINDS = ['conference', 'journal', 'preprint'] as const
export const TRACKS = ['verified', 'notable'] as const
export const FIELDS = ['cs', 'bio_med', 'social', 'other'] as const
