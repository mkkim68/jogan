import { STAGE1_MIN_ABSTRACT, type Evidence, type Stage1 } from '@jogan/core'
import { TORTURED_PHRASES } from './tortured'

export type Stage1Input = {
  title: string
  abstract: string
  authors: { name: string }[]
  doi: string | null
}

export type Stage1Result = { stage1: Stage1; evidence: Evidence[]; caveats: string[] }

/**
 * 비용 0의 하드 필터. 여기서 탈락하면 뒤 단계를 돌리지 않는다.
 *
 * PRD §3.2 ①의 "메타데이터 부실 — DOI 없음"은 뺐다. arXiv 논문의 98%가 DOI가 없는데,
 * 프리프린트는 저널에 실리기 전까지 DOI가 없는 게 정상이라 부실이 아니라 정의다.
 *
 * 철회 조회(Crossref)는 아직 구현하지 않았다 — DOI가 있어도 없어도 이 함수는 철회
 * 여부를 확인하지 않는다. `stage1.retracted`는 항상 false이고, 이것이 "철회 아님을
 * 확인했다"는 뜻이 아니라 "확인한 적이 없다"는 뜻임을 caveat으로 매번 남긴다
 * (CLAUDE.md 절대 규칙 2 — 확인하지 않은 것을 확인했다고 적지 않는다).
 */
export function runStage1(paper: Stage1Input): Stage1Result {
  const evidence: Evidence[] = []
  const caveats: string[] = []
  const problems: string[] = []

  const abstract = paper.abstract.trim()
  if (abstract.length < STAGE1_MIN_ABSTRACT) {
    problems.push(abstract.length === 0 ? '초록이 없다' : `초록이 ${abstract.length}자로 너무 짧다`)
  }
  if (paper.authors.length === 0) problems.push('저자 정보가 없다')
  if (paper.title.trim().length === 0) problems.push('제목이 없다')

  const haystack = `${paper.title} ${abstract}`.toLowerCase()
  const paperMillSignals = TORTURED_PHRASES.filter((p) => haystack.includes(p))

  const passed = problems.length === 0 && paperMillSignals.length === 0

  if (paperMillSignals.length > 0) {
    evidence.push({
      stage: 1,
      verdict: 'caution',
      text: `동의어 치환 흔적이 보인다: ${paperMillSignals.join(', ')}`,
    })
  }
  if (problems.length > 0) {
    evidence.push({ stage: 1, verdict: 'caution', text: `메타데이터가 부실하다 — ${problems.join(', ')}` })
  }
  if (passed) {
    evidence.push({ stage: 1, verdict: 'pass', text: '메타데이터가 갖춰져 있고 동의어 치환 흔적이 없다' })
  }

  // DOI 유무와 무관하다 — Crossref 조회 자체가 구현되어 있지 않아 어느 쪽도 확인하지 못했다.
  caveats.push('철회 여부를 확인하지 않았다 — Crossref 조회가 아직 구현되지 않았다')

  return {
    stage1: { passed, retracted: false, predatoryVenue: false, paperMillSignals },
    evidence,
    caveats,
  }
}
