import { EMBEDDING_DIM, EmbeddingDimensionError, VOYAGE_BATCH_SIZE, VOYAGE_MODEL } from '@jogan/core'
import { z } from 'zod'
import type { HttpClient } from './http'

const VOYAGE_API = 'https://api.voyageai.com/v1/embeddings'
/** 제목+초록이 이보다 길 일은 거의 없지만, 비용이 튀지 않게 잘라둔다 */
const MAX_INPUT_CHARS = 8000

export function paperEmbeddingInput(title: string, abstract: string): string {
  return `${title}\n\n${abstract}`.slice(0, MAX_INPUT_CHARS)
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const VoyageResponse = z.object({
  data: z.array(z.object({ index: z.number().int().min(0), embedding: z.array(z.number()) })).min(1),
})

/**
 * 입력 순서와 같은 순서로 벡터를 돌려준다.
 * 응답 차원이 EMBEDDING_DIM과 다르면 즉시 실패한다 — 조용히 저장하면 pgvector가 나중에 터진다.
 */
export async function embedTexts(
  client: HttpClient,
  apiKey: string,
  texts: string[],
  inputType: 'document' | 'query',
): Promise<number[][]> {
  if (texts.length === 0) return []
  const out: number[][] = []

  for (const batch of chunk(texts, VOYAGE_BATCH_SIZE)) {
    const res = await client.request(VOYAGE_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: VOYAGE_MODEL, input: batch, input_type: inputType }),
    })
    if (!res.ok) throw new Error(`Voyage 응답 ${res.status}: ${await res.text()}`)

    const parsed = VoyageResponse.parse(await res.json())
    const byIndex = new Map(parsed.data.map((d) => [d.index, d.embedding]))
    for (let i = 0; i < batch.length; i++) {
      const v = byIndex.get(i)
      if (!v) throw new Error(`Voyage 응답에 index ${i}가 없다`)
      if (v.length !== EMBEDDING_DIM) {
        throw new EmbeddingDimensionError(EMBEDDING_DIM, v.length)
      }
      out.push(v)
    }
  }
  return out
}
