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
 * 대신 철회 조회를 못 한다는 사실을 caveat으로 남긴다.
 *
 * 철회 자체의 조회(Crossref)는 이 함수 밖에서 한다 — 여기는 순수 함수로 둔다.
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

  if (paper.doi === null) {
    caveats.push('DOI가 없어 철회 여부를 조회하지 못했다 (프리프린트에서는 정상이다)')
  }

  return {
    stage1: { passed, retracted: false, predatoryVenue: false, paperMillSignals },
    evidence,
    caveats,
  }
}
