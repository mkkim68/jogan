import { ARXIV_PAGE_SIZE, COLLECT_MAX_PER_RUN, EmbeddingDimensionError } from '@jogan/core'
import { describe, expect, it } from 'vitest'
import type { NewPaper } from '@jogan/db'
import { collect, embed, type InterestListRow, type PaperListRow } from './index'
import type { HttpClient } from './http'

/** 최소한의 유효한 entry 하나짜리 arXiv Atom 피드. `noUncheckedIndexedAccess` 때문에
 * 응답 큐 접근은 항상 `undefined` 가드를 거친다 (캐스팅 없음). */
function entryXml(id: string, publishedIso: string): string {
  return `<entry>
    <id>http://arxiv.org/abs/${id}v1</id>
    <title>Title ${id}</title>
    <summary>Abstract ${id}</summary>
    <published>${publishedIso}</published>
    <author><name>Author</name></author>
  </entry>`
}

function feed(totalResults: number, entries: string[]): string {
  return `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">` +
    `<opensearch:totalResults>${totalResults}</opensearch:totalResults>${entries.join('')}</feed>`
}

/** 순서대로 하나씩 내주는 고정 응답 큐. 큐가 바닥나면 테스트가 예상보다 많이 호출했다는 뜻이라 던진다. */
function queuedXmlClient(pages: string[]): { client: HttpClient; calls: () => number } {
  const queue = [...pages]
  let calls = 0
  return {
    calls: () => calls,
    client: {
      async request() {
        calls++
        const xml = queue.shift()
        if (xml === undefined) throw new Error(`테스트 픽스처보다 많이 호출됨 (호출 ${calls}번째)`)
        return new Response(xml, { status: 200 })
      },
    },
  }
}

describe('collect — 워터마크는 확정 저장된 논문에서만 전진한다 (finding 1)', () => {
  it('배치 upsert가 실패해 개별 재시도로 넘어가면, 실패한 논문의 published_at은 무시한다', async () => {
    const page = feed(3, [
      entryXml('9000.00001', '2026-09-24T18:00:00Z'), // 가장 최신 — 저장 실패시킬 논문
      entryXml('9000.00002', '2026-09-24T17:00:00Z'),
      entryXml('9000.00003', '2026-09-23T10:00:00Z'),
    ])
    const { client } = queuedXmlClient([page])

    const upsertCalls: NewPaper[][] = []
    const upsert = async (rows: NewPaper[]): Promise<number> => {
      upsertCalls.push(rows)
      if (rows.length > 1) throw new Error('시뮬레이션: 배치 upsert 실패')
      const [p] = rows
      if (p?.arxivId === '9000.00001') throw new Error('시뮬레이션: papers_doi_unique 충돌')
      return rows.length
    }

    const result = await collect({ client, upsert, getWatermark: async () => null })

    // 배치가 통째로 실패했으니 개별 재시도가 일어났어야 한다 (배치 1회 + 개별 3회)
    expect(upsertCalls).toHaveLength(4)
    // 두 편만 실제로 저장됐다
    expect(result.stored).toBe(2)
    // 가장 최신(9000.00001, 18:00)은 저장에 실패했으므로 워터마크가 거기까지 전진하면 안 된다.
    // 실제로 저장된 것 중 가장 늦은 시각(17:00)까지만 전진해야 한다.
    expect(result.newest?.toISOString()).toBe('2026-09-24T17:00:00.000Z')
  })

  it('배치 upsert가 한 번에 성공하면 배치 전체 기준으로 전진한다', async () => {
    const page = feed(2, [
      entryXml('9100.00001', '2026-09-24T18:00:00Z'),
      entryXml('9100.00002', '2026-09-24T17:00:00Z'),
    ])
    const { client } = queuedXmlClient([page])
    const upsert = async (rows: NewPaper[]): Promise<number> => rows.length

    const result = await collect({ client, upsert, getWatermark: async () => null })

    expect(result.stored).toBe(2)
    expect(result.newest?.toISOString()).toBe('2026-09-24T18:00:00.000Z')
  })
})

describe('collect — 한 실행 상한 도달은 정상 종료와 구분해 로그한다', () => {
  it('COLLECT_MAX_PER_RUN에 걸려 멈추면 명시적으로 로그를 남긴다', async () => {
    const perPage = ARXIV_PAGE_SIZE
    const pages = Array.from({ length: COLLECT_MAX_PER_RUN / perPage }, (_, page) =>
      feed(
        COLLECT_MAX_PER_RUN + 1000, // 창에 남은 논문이 상한보다 많다
        Array.from({ length: perPage }, (_, i) =>
          entryXml(`95${String(page * perPage + i).padStart(6, '0')}`, '2026-09-20T00:00:00Z'),
        ),
      ),
    )
    const { client, calls } = queuedXmlClient(pages)

    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg?: unknown) => {
      logs.push(String(msg))
    }
    let result: { stored: number; newest: Date | null }
    try {
      result = await collect({ client, upsert: async (rows) => rows.length, getWatermark: async () => null })
    } finally {
      console.log = originalLog
    }

    expect(result.stored).toBe(COLLECT_MAX_PER_RUN)
    expect(calls()).toBe(pages.length)
    expect(logs.some((m) => m.includes('COLLECT_MAX_PER_RUN') && m.includes('정상 종료가 아니다'))).toBe(true)
  })

  it('창을 다 훑고 끝나면 상한 로그를 남기지 않는다', async () => {
    const { client } = queuedXmlClient([feed(1, [entryXml('9600.00001', '2026-09-20T00:00:00Z')])])

    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg?: unknown) => {
      logs.push(String(msg))
    }
    try {
      await collect({ client, upsert: async (rows) => rows.length, getWatermark: async () => null })
    } finally {
      console.log = originalLog
    }

    expect(logs.some((m) => m.includes('COLLECT_MAX_PER_RUN'))).toBe(false)
  })
})

describe('collect — 빈 페이지 처리 (finding 3)', () => {
  it('페이지네이션 도중 받은 빈 페이지는 같은 위치로 한 번 재시도하고 계속한다', async () => {
    const pageA = feed(500, [entryXml('9200.00001', '2026-09-20T00:00:00Z')])
    const emptyMidWindow = feed(500, [])
    const pageBAfterRetry = feed(500, [entryXml('9200.00002', '2026-09-19T00:00:00Z')])
    const finalExhausted = feed(400, []) // start(400) >= totalResults(400) → 진짜 종료

    const { client, calls } = queuedXmlClient([pageA, emptyMidWindow, pageBAfterRetry, finalExhausted])
    const upsert = async (rows: NewPaper[]): Promise<number> => rows.length

    const result = await collect({ client, upsert, getWatermark: async () => null })

    // pageA, 빈 페이지, 재시도(pageB), 마지막 빈 페이지(정상 종료) = 4번
    expect(calls()).toBe(4)
    expect(result.stored).toBe(2)
    expect(result.newest?.toISOString()).toBe('2026-09-20T00:00:00.000Z')
  })

  it('재시도해도 빈 페이지면 멈추되, 조용히 넘어가지 않고 경고 로그를 남긴다', async () => {
    const pageA = feed(500, [entryXml('9300.00001', '2026-09-20T00:00:00Z')])
    const emptyMidWindow = feed(500, [])
    const { client, calls } = queuedXmlClient([pageA, emptyMidWindow, emptyMidWindow])

    const logs: string[] = []
    const originalLog = console.log
    console.log = (msg?: unknown) => {
      logs.push(String(msg))
    }
    let result: { stored: number; newest: Date | null }
    try {
      result = await collect({ client, upsert: async (rows) => rows.length, getWatermark: async () => null })
    } finally {
      console.log = originalLog
    }

    // pageA, 빈 페이지, 재시도(역시 빈 페이지) = 3번. 네 번째 요청은 없어야 한다(무한 재시도 금지).
    expect(calls()).toBe(3)
    expect(result.stored).toBe(1)
    expect(logs.some((m) => m.includes('재시도해도 빈 페이지'))).toBe(true)
  })

  it('빈 페이지가 정말 끝이면(총 건수 도달) 재시도 없이 정상 종료한다', async () => {
    const onlyPage = feed(0, [])
    const { client, calls } = queuedXmlClient([onlyPage])

    const result = await collect({ client, upsert: async (rows) => rows.length, getWatermark: async () => null })

    expect(calls()).toBe(1)
    expect(result.stored).toBe(0)
    expect(result.newest).toBeNull()
  })
})

const vec = (dim: number, fill = 0.1) => Array.from({ length: dim }, () => fill)

function stubEmbedClient(handler: (input: string[]) => Response): HttpClient {
  return {
    async request(_url, init) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { input: string[] }
      return handler(body.input)
    },
  }
}

function okVectorResponse(dim: number): Response {
  return new Response(JSON.stringify({ data: [{ index: 0, embedding: vec(dim) }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('embed — 차원 불일치는 절대 삼키지 않는다 (finding 2)', () => {
  it('배치 호출에서 바로 차원이 다르면 로그만 남기고 넘어가지 않고 다시 던진다', async () => {
    const client = stubEmbedClient(() => okVectorResponse(3)) // EMBEDDING_DIM(1024)과 다름
    let setPaperCalls = 0

    await expect(
      embed({
        apiKey: 'k',
        client,
        listPapers: async () => [{ id: 'p1', title: 't', abstract: 'a' }],
        setPaper: async () => {
          setPaperCalls++
        },
        listInterests: async () => [],
        setInterest: async () => {},
      }),
    ).rejects.toThrow(EmbeddingDimensionError)

    expect(setPaperCalls).toBe(0)
  })

  it('배치 실패 후 개별 재시도 중 차원 불일치를 만나도 다시 던진다', async () => {
    let call = 0
    const client = stubEmbedClient((input) => {
      call++
      if (input.length > 1) return new Response('boom', { status: 500 }) // 배치는 항상 실패
      // 개별 재시도: 2번째 호출(p1)은 정상 차원, 3번째 호출(p2)은 차원이 틀어짐
      return okVectorResponse(call === 2 ? 1024 : 3)
    })
    const saved: string[] = []

    await expect(
      embed({
        apiKey: 'k',
        client,
        listPapers: async () => [
          { id: 'p1', title: 't1', abstract: 'a1' },
          { id: 'p2', title: 't2', abstract: 'a2' },
        ],
        setPaper: async (id) => {
          saved.push(id)
        },
        listInterests: async () => [],
        setInterest: async () => {},
      }),
    ).rejects.toThrow(EmbeddingDimensionError)

    // p1은 개별 재시도에서 성공해 저장됐고, p2에서 차원 오류가 나 전체가 다시 던져졌다
    expect(saved).toEqual(['p1'])
  })

  it('관심사 임베딩의 차원 불일치도 다시 던진다', async () => {
    const client = stubEmbedClient(() => okVectorResponse(7))

    await expect(
      embed({
        apiKey: 'k',
        client,
        listPapers: async () => [],
        setPaper: async () => {},
        listInterests: async () => [{ id: 'i1', label: '관심사', userId: 'u1' }],
        setInterest: async () => {},
      }),
    ).rejects.toThrow(EmbeddingDimensionError)
  })
})

describe('embed — 한 항목의 실패가 전체 임베딩 단계를 막지 않는다 (finding 4)', () => {
  it('논문 하나가 계속 실패해도 나머지 논문은 계속 처리되고, 진행 없는 배치가 오면 멈춘다', async () => {
    const client = stubEmbedClient((input) => {
      if (input.length > 1) return new Response('boom', { status: 500 }) // 배치는 항상 실패 → 개별 재시도
      const title = input[0]
      // paperEmbeddingInput은 `${title}\n\n${abstract}`를 보낸다 — startsWith로 확인
      if (title?.startsWith('bad-title')) return new Response('nope', { status: 400 }) // 이 논문만 계속 실패
      return okVectorResponse(1024)
    })

    let call = 0
    const listPapers = async (): Promise<PaperListRow[]> => {
      call++
      if (call === 1) {
        return [
          { id: 'bad', title: 'bad-title', abstract: 'x' },
          { id: 'good1', title: 'good-1', abstract: 'x' },
        ]
      }
      if (call === 2) {
        return [
          { id: 'bad', title: 'bad-title', abstract: 'x' },
          { id: 'good2', title: 'good-2', abstract: 'x' },
        ]
      }
      // 세 번째 조회에는 이제 'bad'만 남아 있다 (good1/good2는 이미 임베딩 완료라 조회에 안 잡힘 가정)
      return [{ id: 'bad', title: 'bad-title', abstract: 'x' }]
    }

    const saved: string[] = []
    const result = await embed({
      apiKey: 'k',
      client,
      listPapers,
      setPaper: async (id) => {
        saved.push(id)
      },
      listInterests: async () => [],
      setInterest: async () => {},
    })

    expect(result.papers).toBe(2)
    expect(saved.sort()).toEqual(['good1', 'good2'])
    // 세 번째 조회에서 'bad'만 남았고 이미 실패로 기록돼 있어 필터링되어 빈 배치가 되므로 멈춘다
    expect(call).toBe(3)
  })

  it('관심사 하나가 실패해도 나머지 관심사는 임베딩된다', async () => {
    const client = stubEmbedClient((input) => {
      if (input.length > 1) return new Response('boom', { status: 500 })
      if (input[0] === '나쁜 관심사') return new Response('nope', { status: 400 })
      return okVectorResponse(1024)
    })

    const saved: string[] = []
    const result = await embed({
      apiKey: 'k',
      client,
      listPapers: async () => [],
      setPaper: async () => {},
      listInterests: async (): Promise<InterestListRow[]> => [
        { id: 'i1', label: '나쁜 관심사', userId: 'u1' },
        { id: 'i2', label: '좋은 관심사', userId: 'u1' },
      ],
      setInterest: async (id) => {
        saved.push(id)
      },
    })

    expect(result.interests).toBe(1)
    expect(saved).toEqual(['i2'])
  })
})

describe('embed — 전량 실패는 exit 0으로 숨기지 않는다', () => {
  it('모든 논문 임베딩이 실패하면(키 만료 등) 0편을 반환하지 않고 던진다', async () => {
    // 401은 재시도 대상이 아니라 배치도 개별도 그대로 실패한다 — 키 만료/크레딧 소진의 모습
    const client = stubEmbedClient(() => new Response('unauthorized', { status: 401 }))

    await expect(
      embed({
        apiKey: 'revoked',
        client,
        listPapers: async () => [
          { id: 'p1', title: 't1', abstract: 'a1' },
          { id: 'p2', title: 't2', abstract: 'a2' },
        ],
        setPaper: async () => {},
        listInterests: async () => [],
        setInterest: async () => {},
      }),
    ).rejects.toThrow(/전량 실패/)
  })

  it('모든 관심사 임베딩이 실패해도 던진다', async () => {
    const client = stubEmbedClient((input) =>
      // 논문은 정상이고 관심사만 실패하는 상황 — 관심사 단계도 따로 던져야 한다
      input.some((t) => t.startsWith('관심사')) ? new Response('nope', { status: 401 }) : okVectorResponse(1024),
    )

    let listed = false
    await expect(
      embed({
        apiKey: 'k',
        client,
        listPapers: async () => {
          if (listed) return []
          listed = true
          return [{ id: 'p1', title: 'paper', abstract: 'a' }]
        },
        setPaper: async () => {},
        listInterests: async (): Promise<InterestListRow[]> => [{ id: 'i1', label: '관심사 하나', userId: 'u1' }],
        setInterest: async () => {},
      }),
    ).rejects.toThrow(/전량 실패/)
  })

  it('임베딩할 것이 애초에 없으면 조용히 0을 반환한다 (정상 실행)', async () => {
    const client = stubEmbedClient(() => new Response('호출되면 안 된다', { status: 500 }))

    const result = await embed({
      apiKey: 'k',
      client,
      listPapers: async () => [],
      setPaper: async () => {},
      listInterests: async () => [],
      setInterest: async () => {},
    })

    expect(result).toEqual({ papers: 0, interests: 0 })
  })
})

describe('embed — VOYAGE_API_KEY 부재', () => {
  it('키가 없으면 조용히 넘어가지 않고 명확한 에러로 던진다', async () => {
    const original = process.env.VOYAGE_API_KEY
    delete process.env.VOYAGE_API_KEY
    try {
      await expect(embed()).rejects.toThrow(/VOYAGE_API_KEY/)
    } finally {
      if (original !== undefined) process.env.VOYAGE_API_KEY = original
    }
  })
})
