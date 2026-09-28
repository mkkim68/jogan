import { EMBEDDING_DIM } from '@jogan/core'
import { describe, expect, it } from 'vitest'
import { chunk, embedTexts, paperEmbeddingInput } from './embed'
import type { HttpClient } from './http'

const vec = (v: number) => Array.from({ length: EMBEDDING_DIM }, () => v)

// noUncheckedIndexedAccess 때문에 배열 인덱싱은 `T | undefined`다. 캐스팅 대신 실제 가드로 좁힌다.
function at<T>(arr: T[], i: number): T {
  const v = arr[i]
  if (v === undefined) throw new Error(`index ${i} out of range`)
  return v
}

function stubClient(handler: (body: unknown) => unknown): HttpClient {
  return {
    async request(_url, init) {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify(handler(body)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    },
  }
}

describe('paperEmbeddingInput', () => {
  it('제목과 초록을 빈 줄로 잇는다', () => {
    expect(paperEmbeddingInput('제목', '초록')).toBe('제목\n\n초록')
  })
  it('8000자에서 자른다', () => {
    const out = paperEmbeddingInput('t', 'a'.repeat(20000))
    expect(out.length).toBe(8000)
  })
})

describe('chunk', () => {
  it('크기대로 나눈다', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  it('빈 배열은 빈 배열', () => {
    expect(chunk([], 3)).toEqual([])
  })
})

describe('embedTexts', () => {
  it('입력 순서대로 벡터를 돌려준다', async () => {
    const client = stubClient((body) => {
      const input = (body as { input: string[] }).input
      return { data: input.map((_, i) => ({ index: i, embedding: vec(i) })) }
    })
    const out = await embedTexts(client, 'k', ['a', 'b'], 'document')
    expect(out).toHaveLength(2)
    expect(at(at(out, 0), 0)).toBe(0)
    expect(at(at(out, 1), 0)).toBe(1)
  })

  it('배치 크기를 넘으면 나눠 보내고 결과를 이어붙인다', async () => {
    let calls = 0
    const client = stubClient((body) => {
      calls++
      const input = (body as { input: string[] }).input
      expect(input.length).toBeLessThanOrEqual(128)
      return { data: input.map((_, i) => ({ index: i, embedding: vec(1) })) }
    })
    const out = await embedTexts(client, 'k', Array.from({ length: 300 }, (_, i) => `t${i}`), 'document')
    expect(out).toHaveLength(300)
    expect(calls).toBe(3)
  })

  it('응답 순서가 뒤섞여 와도 index로 되돌린다', async () => {
    const client = stubClient(() => ({
      data: [
        { index: 1, embedding: vec(9) },
        { index: 0, embedding: vec(5) },
      ],
    }))
    const out = await embedTexts(client, 'k', ['a', 'b'], 'query')
    expect(at(at(out, 0), 0)).toBe(5)
    expect(at(at(out, 1), 0)).toBe(9)
  })

  it('차원이 다르면 throw한다', async () => {
    const client = stubClient(() => ({ data: [{ index: 0, embedding: [1, 2, 3] }] }))
    await expect(embedTexts(client, 'k', ['a'], 'document')).rejects.toThrow(/차원/)
  })

  it('응답 모양이 다르면 throw한다', async () => {
    const client = stubClient(() => ({ nope: true }))
    await expect(embedTexts(client, 'k', ['a'], 'document')).rejects.toThrow()
  })

  it('빈 입력은 호출하지 않는다', async () => {
    let calls = 0
    const client: HttpClient = { async request() { calls++; return new Response('{}') } }
    expect(await embedTexts(client, 'k', [], 'document')).toEqual([])
    expect(calls).toBe(0)
  })
})
