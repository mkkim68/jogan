import { STAGE1_MIN_ABSTRACT } from '@jogan/core'
import { describe, expect, it } from 'vitest'
import { runStage1 } from './stage1'

const ok = {
  title: 'A Study of Long-Term Memory in Language Agents',
  abstract: 'x'.repeat(400),
  authors: [{ name: 'Jane Doe' }],
  doi: null,
}

describe('runStage1', () => {
  // arXiv 논문의 98%가 DOI가 없다. PRD의 "DOI 없음 = 메타데이터 부실"을 그대로
  // 적용하면 전부 탈락한다 — 프리프린트는 DOI가 없는 게 정상이다.
  it('DOI가 없어도 통과한다', () => {
    const r = runStage1(ok)
    expect(r.stage1.passed).toBe(true)
  })

  // 철회 조회(Crossref)는 구현되어 있지 않다 — DOI가 있어도 없어도 확인한 적이 없으므로
  // caveat은 DOI 유무와 무관하게 항상 남아야 한다 (절대 규칙 2: 확인 안 한 걸 확인했다고 적지 않는다).
  it('철회 여부를 확인하지 않았다는 caveat을 DOI 유무와 무관하게 항상 남긴다', () => {
    const withoutDoi = runStage1(ok)
    const withDoi = runStage1({ ...ok, doi: '10.1234/abcd' })
    expect(withoutDoi.caveats.join(' ')).toContain('철회')
    expect(withDoi.caveats.join(' ')).toContain('철회')
  })

  it('초록이 정확히 최소 길이면 통과한다', () => {
    const r = runStage1({ ...ok, abstract: 'x'.repeat(STAGE1_MIN_ABSTRACT) })
    expect(r.stage1.passed).toBe(true)
  })

  it('초록이 너무 짧으면 탈락한다', () => {
    const r = runStage1({ ...ok, abstract: '짧다' })
    expect(r.stage1.passed).toBe(false)
  })

  it('초록이 없으면 탈락한다', () => {
    const r = runStage1({ ...ok, abstract: '' })
    expect(r.stage1.passed).toBe(false)
  })

  it('저자가 없으면 탈락한다', () => {
    const r = runStage1({ ...ok, authors: [] })
    expect(r.stage1.passed).toBe(false)
  })

  it('제목이 없으면 탈락한다', () => {
    const r = runStage1({ ...ok, title: '   ' })
    expect(r.stage1.passed).toBe(false)
  })

  it('tortured phrase가 있으면 신호로 남기고 탈락시킨다', () => {
    const r = runStage1({ ...ok, abstract: `We apply counterfeit consciousness to ${'x'.repeat(400)}` })
    expect(r.stage1.paperMillSignals).toContain('counterfeit consciousness')
    expect(r.stage1.passed).toBe(false)
  })

  it('tortured phrase 판정은 대소문자를 가리지 않는다', () => {
    const r = runStage1({ ...ok, abstract: `COLOSSAL INFORMATION pipelines ${'x'.repeat(400)}` })
    expect(r.stage1.paperMillSignals).toContain('colossal information')
  })

  it('통과하면 pass 근거 문장이 남는다 (절대 규칙 2)', () => {
    const r = runStage1(ok)
    expect(r.evidence.length).toBeGreaterThan(0)
    expect(r.evidence.every((e) => e.stage === 1)).toBe(true)
    expect(r.evidence.some((e) => e.verdict === 'pass')).toBe(true)
  })

  it('탈락하면 caution 근거 문장이 남는다', () => {
    const r = runStage1({ ...ok, authors: [] })
    expect(r.evidence.some((e) => e.verdict === 'caution')).toBe(true)
  })
})
