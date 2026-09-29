import { describe, expect, it } from 'vitest'
import { selectBestPerPaper } from './match'

/** 사용자 상한이 걸리지 않는 넉넉한 값 — 그 상한을 시험하는 테스트에서만 작은 값을 준다 */
const NO_USER_CAP = 1000

describe('selectBestPerPaper', () => {
  it('하한 미만은 버린다', () => {
    const out = selectBestPerPaper(
      [{ interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.9 }, { paperId: 'p2', relevance: 0.2 }] }],
      0.3,
      20,
      NO_USER_CAP,
    )
    expect(out.map((r) => r.paperId)).toEqual(['p1'])
  })

  it('하한과 정확히 같으면 남긴다 (하한은 포함)', () => {
    const out = selectBestPerPaper(
      [{ interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.3 }] }],
      0.3,
      20,
      NO_USER_CAP,
    )
    expect(out).toEqual([{ paperId: 'p1', interestId: 'i1', relevance: 0.3 }])
  })

  it('관심사당 상위 N편까지만 본다', () => {
    const matches = Array.from({ length: 10 }, (_, i) => ({ paperId: `p${i}`, relevance: 0.9 - i * 0.01 }))
    const out = selectBestPerPaper([{ interestId: 'i1', matches }], 0.3, 3, NO_USER_CAP)
    expect(out).toHaveLength(3)
    expect(out.map((r) => r.paperId)).toEqual(['p0', 'p1', 'p2'])
  })

  // 이 방식의 핵심: 점수가 낮아도 자기 관심사 안에서 상위면 후보가 된다.
  // 절대 점수는 매칭 품질이 아니라 라벨을 어떻게 적었는지를 따라가기 때문이다.
  it('점수가 낮은 관심사도 자기 상위 N편을 가져간다', () => {
    const strong = Array.from({ length: 5 }, (_, i) => ({ paperId: `hi${i}`, relevance: 0.65 - i * 0.01 }))
    const weak = Array.from({ length: 5 }, (_, i) => ({ paperId: `lo${i}`, relevance: 0.36 - i * 0.01 }))
    const out = selectBestPerPaper(
      [
        { interestId: 'strong', matches: strong },
        { interestId: 'weak', matches: weak },
      ],
      0.3,
      3,
      NO_USER_CAP,
    )
    expect(out.filter((r) => r.interestId === 'strong')).toHaveLength(3)
    expect(out.filter((r) => r.interestId === 'weak')).toHaveLength(3)
  })

  it('사용자 상한을 넘으면 relevance가 낮은 쪽부터 버린다', () => {
    const mk = (prefix: string, base: number) =>
      Array.from({ length: 4 }, (_, i) => ({ paperId: `${prefix}${i}`, relevance: base - i * 0.01 }))
    const out = selectBestPerPaper(
      [
        { interestId: 'i1', matches: mk('a', 0.6) },
        { interestId: 'i2', matches: mk('b', 0.5) },
      ],
      0.3,
      4,
      5,
    )
    expect(out).toHaveLength(5)
    // 0.60 0.59 0.58 0.57 (i1 전부) + 0.50 (i2 최상위) — 0.49 아래는 잘린다
    expect(out.map((r) => r.paperId)).toEqual(['a0', 'a1', 'a2', 'a3', 'b0'])
  })

  it('사용자 상한에 걸리지 않으면 순서를 바꾸지 않는다', () => {
    const out = selectBestPerPaper(
      [
        { interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.4 }] },
        { interestId: 'i2', matches: [{ paperId: 'p2', relevance: 0.6 }] },
      ],
      0.3,
      20,
      NO_USER_CAP,
    )
    expect(out.map((r) => r.paperId)).toEqual(['p1', 'p2'])
  })

  it('한 논문이 두 관심사에 걸리면 더 높은 쪽만 남고 interestId도 그쪽이다', () => {
    const out = selectBestPerPaper(
      [
        { interestId: 'i1', matches: [{ paperId: 'p1', relevance: 0.6 }] },
        { interestId: 'i2', matches: [{ paperId: 'p1', relevance: 0.8 }] },
      ],
      0.3,
      20,
      NO_USER_CAP,
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
      0.3,
      20,
      NO_USER_CAP,
    )
    expect(out).toHaveLength(1)
    const [first] = out
    if (first === undefined) throw new Error('결과가 비어 있다')
    expect(first.interestId).toBe('i2')
  })

  it('빈 입력은 빈 결과', () => {
    expect(selectBestPerPaper([], 0.3, 20, NO_USER_CAP)).toEqual([])
    expect(selectBestPerPaper([{ interestId: 'i1', matches: [] }], 0.3, 20, NO_USER_CAP)).toEqual([])
  })
})
