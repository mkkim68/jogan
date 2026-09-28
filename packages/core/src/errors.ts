/**
 * 임베딩 벡터 차원이 `EMBEDDING_DIM`과 다를 때 던지는 전용 에러.
 *
 * CLAUDE.md/작업 지시의 예외 규칙: 다른 실패(타임아웃, 잘못된 응답 모양 등)는 해당 항목만
 * 건너뛰고 계속하지만, 차원 불일치만은 즉시 파이프라인을 멈춰야 한다 — 모델/설정이 바뀌었는데
 * 조용히 계속 진행하면 pgvector 컬럼 차원과 어긋난 벡터가 섞여 들어가거나(스키마가 막아주긴
 * 하지만) 임베딩 단계 전체가 매 배치 실패로 조용히 아무 일도 안 하게 된다.
 *
 * `packages/db`(임베딩을 저장하는 쪽)와 `services/collector`(Voyage 응답을 파싱하는 쪽)
 * 양쪽이 이 타입을 던져야 호출부가 `instanceof`로 구분해 재던질 수 있다. `packages/db`는
 * `services/collector`를 import할 수 없으므로 둘 다 의존하는 `packages/core`가 유일한 공유 위치다.
 */
export class EmbeddingDimensionError extends Error {
  readonly expected: number
  readonly actual: number

  constructor(expected: number, actual: number) {
    super(`임베딩 차원이 ${expected}이 아니다: ${actual}`)
    this.name = 'EmbeddingDimensionError'
    this.expected = expected
    this.actual = actual
  }
}
