export type InterestMatches = {
  interestId: string
  /** relevance 내림차순으로 정렬돼 있다고 가정한다 (DB가 그렇게 준다) */
  matches: { paperId: string; relevance: number }[]
}

export type SelectedCandidate = { paperId: string; interestId: string; relevance: number }

/**
 * 관심사별 매칭 결과를 논문 단위로 합친다.
 * 한 논문이 여러 관심사에 걸리면 가장 높은 relevance 하나만 남기고, interestId도 그 관심사의 것이다.
 *
 * 동점 처리: relevance가 완전히 같으면 먼저 본 값을 유지한다(엄격한 `>` 비교).
 * groups의 순서(관심사 나열 순서)에 의존하므로, groups 자체의 순서가 호출자마다 달라지면
 * 동점 시 결과가 달라질 수 있다 — 이 함수는 입력 순서를 그대로 신뢰하며 별도로 재정렬하지 않는다.
 */
export function selectBestPerPaper(
  groups: InterestMatches[],
  threshold: number,
  perInterest: number,
): SelectedCandidate[] {
  const best = new Map<string, SelectedCandidate>()
  for (const g of groups) {
    const top = g.matches.filter((m) => m.relevance >= threshold).slice(0, perInterest)
    for (const m of top) {
      const cur = best.get(m.paperId)
      if (cur === undefined || m.relevance > cur.relevance) {
        best.set(m.paperId, { paperId: m.paperId, interestId: g.interestId, relevance: m.relevance })
      }
    }
  }
  return [...best.values()]
}
