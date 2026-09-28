import { describe, expect, it } from 'vitest'
import { selectBestPerPaper } from './match'

describe('selectBestPerPaper', () => {
  it('임계값 미만은 버린다', () => {
    const out = selectBestPerPaper(
      [{ interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.9 }, { paperId: 'p2', relevance: 0.2 }] }],
      0.45,
      50,
    )
    expect(out.map((r) => r.paperId)).toEqual(['p1'])
  })

  it('관심사당 상위 N편까지만 본다', () => {
    const matches = Array.from({ length: 10 }, (_, i) => ({ paperId: `p${i}`, relevance: 0.9 - i * 0.01 }))
    const out = selectBestPerPaper([{ interestId: 'i1', matches }], 0.45, 3)
    expect(out).toHaveLength(3)
    expect(out.map((r) => r.paperId)).toEqual(['p0', 'p1', 'p2'])
  })

  it('한 논문이 두 관심사에 걸리면 더 높은 쪽만 남고 interestId도 그쪽이다', () => {
    const out = selectBestPerPaper(
      [
        { interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.6 }] },
        { interestId: 'i2', matches: [{ paperId: 'p1', relevance: 0.8 }] },
      ],
      0.45,
      50,
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ paperId: 'p1', interestId: 'i2', relevance: 0.8 })
  })

  it('순서가 반대로 들어와도 결과는 같다', () => {
    const out = selectBestPerPaper(
      [
        { interestId: 'i2', matches: [{ paperId: 'p1', relevance: 0.8 }] },
        { interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.6 }] },
      ],
      0.45,
      50,
    )
    expect(out).toHaveLength(1)
    const [first] = out
    if (first === undefined) throw new Error('결과가 비어 있다')
    expect(first.interestId).toBe('i2')
  })

  it('임계값과 정확히 같으면 남긴다 (하한은 포함)', () => {
    const out = selectBestPerPaper([{ interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.45 }] }], 0.45, 50)
    expect(out).toEqual([{ paperId: 'p1', interestId: 'i1', relevance: 0.45 }])
  })

  it('빈 입력은 빈 결과', () => {
    expect(selectBestPerPaper([], 0.45, 50)).toEqual([])
    expect(selectBestPerPaper([{ interestId: 'i1', matches: [] }], 0.45, 50)).toEqual([])
  })
})
