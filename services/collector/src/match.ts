export type InterestMatches = {
  interestId: string
  /** relevance 내림차순으로 정렬돼 있다고 가정한다 (DB가 그렇게 준다) */
  matches: { paperId: string; relevance: number }[]
}

export type SelectedCandidate = { paperId: string; interestId: string; relevance: number }

/**
 * 관심사별 매칭 결과를 논문 단위로 합친다.
 *
 * **선별은 절대 점수가 아니라 관심사별 순위가 한다.** 절대 코사인 유사도는 매칭 품질이
 * 아니라 관심사 라벨을 어떻게 적었는지를 따라간다 — 실측(HISTORY.md 2026-09-29)에서
 * `stt`는 0.35대에 진짜 음성인식 논문이 나온 반면 `수면과 기억 공고화`는 0.39대에
 * 무관한 논문이 나왔다. 하나의 임계값으로 둘을 가를 수 없어서, 관심사마다 자기 기준
 * 상위 `perInterest`편을 가져가게 하고 `floor`는 쓰레기만 막는다. 애매한 것을 걸러내는
 * 일은 초록을 읽는 evaluator가 맡는다 — 이 단계는 재현율을 맡는다.
 *
 * 한 논문이 여러 관심사에 걸리면 가장 높은 relevance 하나만 남기고, interestId도 그 관심사의 것이다.
 *
 * `perUser`는 관심사 수가 늘어도 후보가 무한히 늘지 않게 하는 안전장치다. 여기서만
 * relevance로 자르는데, 이건 관심사별 상한을 이미 통과한 뒤라 약한 관심사를 굶기지
 * 않는다 — 상한에 걸리지 않으면 순서도 건드리지 않는다.
 *
 * 동점 처리: relevance가 완전히 같으면 먼저 본 값을 유지한다(엄격한 `>` 비교).
 * groups의 순서(관심사 나열 순서)에 의존하므로, groups 자체의 순서가 호출자마다 달라지면
 * 동점 시 결과가 달라질 수 있다 — 이 함수는 입력 순서를 그대로 신뢰하며 별도로 재정렬하지 않는다.
 */
export function selectBestPerPaper(
  groups: InterestMatches[],
  floor: number,
  perInterest: number,
  perUser: number,
): SelectedCandidate[] {
  const best = new Map<string, SelectedCandidate>()
  for (const g of groups) {
    const top = g.matches.filter((m) => m.relevance >= floor).slice(0, perInterest)
    for (const m of top) {
      const cur = best.get(m.paperId)
      if (cur === undefined || m.relevance > cur.relevance) {
        best.set(m.paperId, { paperId: m.paperId, interestId: g.interestId, relevance: m.relevance })
      }
    }
  }
  const all = [...best.values()]
  if (all.length <= perUser) return all
  return [...all].sort((a, b) => b.relevance - a.relevance).slice(0, perUser)
}
