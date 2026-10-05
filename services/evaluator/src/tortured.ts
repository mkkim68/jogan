/**
 * 페이퍼밀이 표절 탐지를 피하려고 동의어 치환기를 돌렸을 때 남는 흔적.
 * 정상적인 논문은 이런 표현을 쓰지 않는다. Cabanac 등의 Problematic Paper Screener가
 * 모은 목록에서 널리 알려진 것만 추렸다 — 길게 가져갈수록 오탐이 는다.
 *
 * `runStage1`은 사람이 보지 않는 0비용 게이트라 여기서 걸리면 그 논문은 그대로 버려진다
 * (2026-09-29 리뷰). 그래서 "정상적인 영어 문장에 이 구절이 그대로 나올 수 있는가"를
 * 기준으로 감사했다 — 가능성이 조금이라도 있으면 뺐다. 실제 페이퍼밀은 뒤 단계
 * (LLM 본문 평가)에서도 잡힌다. 이 목록에서 빠져 통과되는 것보다, 진짜 논문이 여기서
 * 조용히 삭제되는 쪽이 훨씬 나쁘다 — 오탐은 아무도 못 보고 지나간다.
 *
 * 아래는 이 감사에서 제거한 구절과 그 근거다:
 * - 'underlying condition' (structural equation) — "many patients have an
 *   underlying condition such as diabetes"는 의학 논문에서 일상적인 표현이다.
 * - 'choice tree' (decision tree) — 코드가 부분 문자열 일치만 하므로
 *   "a rich choice tree for players"에서도 걸린다. 단어 경계 검사가 없다.
 * - 'huge information' (big data) — "a huge information asymmetry between
 *   principal and agent"는 경제학 논문에서 흔한 표현이다.
 * - 'profound learning' (deep learning) — "students reported a profound
 *   learning experience"는 교육학 논문에서 흔한 표현이다.
 * - 'irregular woodland' (random forest) — "irregular woodland" 또는
 *   "irregular high forest"는 임업·생태학에서 쓰는 실제 조림 방식 용어다.
 * - 'machine learning calculation' / 'support vector machine calculation'
 *   (algorithm) — 전산 재료과학·화학 분야에서 "a machine learning calculation
 *   of the formation energy"처럼 흔히 쓰는 구성이다.
 * - 'lung malignancy' — "CT imaging revealed a lung malignancy"는 영상의학·
 *   종양학 논문의 표준 표현이다. 'malignancy'는 정상적인 의학 용어다.
 * - 'bunching calculation' (clustering algorithm) — 조세 정책 경제학의
 *   "bunching estimator" 문헌에서 "the bunching calculation"이 실제로 쓰인다.
 */
export const TORTURED_PHRASES: readonly string[] = [
  'colossal information', // big data
  'counterfeit consciousness', // artificial intelligence
  'counterfeit neural organization', // artificial neural network
  'bosom malignancy', // breast cancer
  'mean square blunder', // mean squared error
  'flag commotion proportion', // signal to noise ratio
]
