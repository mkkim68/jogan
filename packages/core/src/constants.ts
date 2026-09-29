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

/**
 * 수집 대상 arXiv 카테고리. 관심사는 자연어라 카테고리와 1:1이 아니므로,
 * 관심사들이 닿는 범위를 덮는 고정 목록으로 볼륨과 비용을 예측 가능하게 한다.
 */
export const ARXIV_CATEGORIES = [
  'cs.AI',    // 인공지능
  'cs.CL',    // 자연어 처리
  'cs.LG',    // 기계학습
  'cs.SE',    // 소프트웨어 공학
  'cs.SD',    // 음성·오디오
  'q-bio.NC', // 신경과학
  'stat.ME',  // 통계 방법론 (인과추론)
] as const

/** 워터마크가 없는 첫 실행에서 거슬러 받을 기간 */
export const COLLECT_BACKFILL_DAYS = 7
/**
 * 관련성 매칭 대상이 되는 논문의 최근성.
 *
 * **COLLECT_BACKFILL_DAYS와 같아서는 안 된다 — 반드시 더 넓게 둔다.** ④ 매칭은
 * "아직 후보가 아닌 논문"이 아니라 `published_at >= now - 이 값`으로 대상을 고르기
 * 때문에, 두 값이 같으면 (a) 첫 실행이 백필 구간의 가장 오래된 쪽을 실행 시간만큼
 * 잘라먹고, (b) 임베딩이 며칠 막혀 있는 동안(Voyage 장애·키 만료) 수집된 논문이
 * 임베딩되는 시점에는 이미 창 밖이라 누구의 후보도 되지 못한다.
 *
 * 제대로 된 해법은 날짜가 아니라 "임베딩됐고 아직 paper_candidates에 없음"으로
 * 거르는 것이지만, 그건 briefer의 소비 마커와 함께 설계해야 한다(스펙 ④ 주의 참고).
 */
export const COLLECT_WINDOW_DAYS = 14
/** 한 실행에서 저장할 논문 수 상한. 넘으면 로그를 남기고 멈춘다 */
export const COLLECT_MAX_PER_RUN = 3000
/** arXiv 한 페이지 크기 */
export const ARXIV_PAGE_SIZE = 200
/** arXiv가 요구하는 요청 간 최소 간격 */
export const ARXIV_MIN_INTERVAL_MS = 3000

/**
 * 후보를 버리는 절대 하한. **선별은 이 값이 아니라 관심사별 순위가 한다.**
 *
 * 절대 점수는 매칭 품질이 아니라 관심사 라벨을 어떻게 적었는지를 따라간다 —
 * 실측(HISTORY.md 2026-09-29)에서 `stt`는 0.35대에 진짜 음성인식 논문이 나온 반면
 * `수면과 기억 공고화`는 0.39대에 무관한 논문이 나왔다. 하나의 임계값으로 이 둘을
 * 구분할 수 없다. 그래서 이 값은 "그 관심사에 정말 아무것도 없을 때 쓰레기를 막는"
 * 용도로만 남기고, 애매한 것을 걸러내는 일은 초록을 읽는 evaluator가 맡는다.
 */
export const RELEVANCE_FLOOR = 0.3
/** 관심사 하나가 하루에 만드는 후보 수. 실질적인 선별자다. */
export const CANDIDATES_PER_INTEREST = 20
/**
 * 사용자 한 명의 하루 후보 총량 상한. MAX_INTERESTS는 "한 번에 추가할 수 있는 개수"일 뿐
 * 총량 상한이 아니라, 관심사를 계속 추가하면 후보가 무한히 늘어난다. 관심사 7개까지는
 * 걸리지 않는 느슨한 안전장치다.
 */
export const CANDIDATES_PER_USER = 150

/**
 * 임베딩 모델. 기본 출력이 1024차원이라 EMBEDDING_DIM과 일치한다 — 차원을 따로 넘기지 않는다.
 * voyage-3는 deprecated라 쓰지 않는다. 모델을 바꾸면 기존 임베딩과 벡터 공간이 달라지므로
 * papers·interests의 embedding을 전부 NULL로 비우고 다시 채워야 한다.
 */
export const VOYAGE_MODEL = 'voyage-4'
/** Voyage가 한 요청에 받는 최대 입력 수 */
export const VOYAGE_BATCH_SIZE = 128
