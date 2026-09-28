import { pathToFileURL } from 'node:url'
import {
  ARXIV_CATEGORIES,
  ARXIV_MIN_INTERVAL_MS,
  ARXIV_PAGE_SIZE,
  CANDIDATES_PER_INTEREST,
  COLLECT_BACKFILL_DAYS,
  COLLECT_MAX_PER_RUN,
  COLLECT_WINDOW_DAYS,
  EmbeddingDimensionError,
  RELEVANCE_THRESHOLD,
} from '@jogan/core'
import {
  db,
  getPipelineState as dbGetPipelineState,
  interests as interestsTable,
  listUnembeddedInterests as dbListUnembeddedInterests,
  listUnembeddedPapers as dbListUnembeddedPapers,
  matchPapersForInterest,
  setInterestEmbedding as dbSetInterestEmbedding,
  setPaperEmbedding as dbSetPaperEmbedding,
  setPipelineState,
  todayInSeoul,
  upsertArxivPapers as dbUpsertArxivPapers,
  upsertCandidates,
  users,
  type NewPaper,
} from '@jogan/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { buildArxivQueryUrl, dedupeByArxivId, entryToPaper, fetchArxivPage, parseArxivFeed, stripVersion } from './arxiv'
import { embedTexts, paperEmbeddingInput } from './embed'
import { createHttpClient, type HttpClient } from './http'
import { selectBestPerPaper, type InterestMatches } from './match'

const WATERMARK_KEY = 'collector:arxiv:last_submitted_at'
/** 워터마크 경계에서 새는 것을 막는 겹침. upsert라 중복 비용이 없다 */
const OVERLAP_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const log = (stage: string, msg: string) => console.log(`[collector:${stage}] ${msg}`)

/** entryToPaper가 이미 검증한 엔트리에서 원본 id(버전 포함)만 다시 뽑는다 */
const EntryId = z.object({ id: z.string() })

export type PaperListRow = { id: string; title: string; abstract: string }
export type InterestListRow = { id: string; label: string; userId: string }

export type CollectDeps = {
  client?: HttpClient
  /** 실제 저장을 담당하는 함수. 성공 시 저장된 행 수를 돌려준다(부분 실패 없이 전부 아니면 전무) */
  upsert?: (rows: NewPaper[]) => Promise<number>
  getWatermark?: (key: string) => Promise<string | null>
}

/**
 * ①② 수집 + 중복 제거.
 * 반환하는 `newest`는 **실제로 DB에 저장이 확인된 논문 중** 가장 늦은 published_at이다.
 * 매핑/파싱 단계에서만 본 값으로는 절대 전진시키지 않는다 — 저장에 실패한 논문 뒤로
 * 워터마크가 넘어가버리면 그 논문은 다음 실행에서도 영원히 조회 구간 밖으로 밀려난다.
 */
export async function collect(deps: CollectDeps = {}): Promise<{ stored: number; newest: Date | null }> {
  const arxiv =
    deps.client ??
    createHttpClient({ minIntervalMs: ARXIV_MIN_INTERVAL_MS, maxRetries: 3, timeoutMs: 30_000 }, {})
  const upsert = deps.upsert ?? dbUpsertArxivPapers
  const getWatermark = deps.getWatermark ?? dbGetPipelineState

  const saved = await getWatermark(WATERMARK_KEY)
  const to = new Date()
  const from = saved
    ? new Date(Date.parse(saved) - OVERLAP_MS)
    : new Date(to.getTime() - COLLECT_BACKFILL_DAYS * DAY_MS)
  log('fetch', `${from.toISOString()} ~ ${to.toISOString()}, 카테고리 ${ARXIV_CATEGORIES.length}개`)

  let start = 0
  let stored = 0
  let skipped = 0
  let newest: Date | null = null
  const bumpNewest = (d: Date) => {
    if (!newest || d > newest) newest = d
  }

  // 루프를 빠져나온 이유. 기본값이 'max-per-run'인 것은 while 조건이 거짓이 되는 경우가
  // 상한 도달 하나뿐이기 때문이다 — 나머지 두 경우는 break 직전에 직접 표시한다.
  let stopReason: 'exhausted' | 'empty-page' | 'max-per-run' = 'max-per-run'

  while (stored < COLLECT_MAX_PER_RUN) {
    const url = buildArxivQueryUrl({ categories: ARXIV_CATEGORIES, from, to, start, pageSize: ARXIV_PAGE_SIZE })
    let xml = await fetchArxivPage(arxiv, url)
    let { entries, totalResults } = parseArxivFeed(xml)
    if (start === 0) log('fetch', `총 ${totalResults}편`)

    if (entries.length === 0) {
      // 정말로 끝까지 받았을 때만 빈 페이지를 "종료"로 믿는다.
      if (start >= totalResults) {
        stopReason = 'exhausted'
        break
      }
      // arXiv는 페이지네이션 도중 빈 페이지를 일시적으로 줄 수 있다고 문서화돼 있다 —
      // 같은 start로 한 번만 재시도한다 (HTTP 래퍼가 이미 요청 간 3초를 보장하므로 추가 sleep은 없다).
      log('fetch', `start=${start}에서 빈 페이지 수신 (총 ${totalResults}편 중), 같은 위치로 재시도`)
      xml = await fetchArxivPage(arxiv, url)
      ;({ entries, totalResults } = parseArxivFeed(xml))
      if (entries.length === 0) {
        if (start >= totalResults) {
          stopReason = 'exhausted'
          break
        }
        log(
          'fetch',
          `start=${start}/총 ${totalResults}편 — 재시도해도 빈 페이지라 이번 실행은 여기서 멈춘다. ` +
            `남은 최대 ${totalResults - start}편은 이번 실행에서 받지 못했다 ` +
            `(오름차순 조회라 워터마크는 여기까지만 전진하고, 다음 실행이 이 지점부터 이어받는다)`,
        )
        stopReason = 'empty-page'
        break
      }
    }

    const rows: { arxivId: string; version: number; paper: NewPaper }[] = []
    for (const e of entries) {
      const paper = entryToPaper(e)
      if (!paper) {
        skipped++
        log('fetch', `매핑 실패로 건너뜀: ${JSON.stringify(e).slice(0, 120)}`)
        continue
      }
      const idParsed = EntryId.safeParse(e)
      if (!idParsed.success) {
        skipped++
        log('fetch', `id 파싱 실패로 건너뜀: ${paper.arxivId}`)
        continue
      }
      const { version } = stripVersion(idParsed.data.id)
      rows.push({ arxivId: paper.arxivId, version, paper })
    }

    const deduped = dedupeByArxivId(rows)
    try {
      stored += await upsert(deduped)
      // 배치 upsert는 단일 SQL 문이다 — 여기 도달했다면 deduped 전체가 저장된 것이므로
      // 전부를 기준으로 워터마크를 전진시켜도 안전하다.
      for (const p of deduped) bumpNewest(p.publishedAt)
    } catch (err) {
      // DOI unique 충돌 등. 배치를 한 편씩 재시도해 나쁜 한 편만 건너뛴다.
      for (const p of deduped) {
        try {
          stored += await upsert([p])
          bumpNewest(p.publishedAt)
        } catch (e2) {
          skipped++
          log('store', `저장 실패로 건너뜀 ${p.arxivId}: ${String(e2)}`)
        }
      }
    }

    start += ARXIV_PAGE_SIZE
    if (start >= totalResults) {
      stopReason = 'exhausted'
      break
    }
  }

  if (stopReason === 'max-per-run') {
    log(
      'fetch',
      `한 실행 상한 COLLECT_MAX_PER_RUN=${COLLECT_MAX_PER_RUN}편에 도달해 조회를 중단한다 — ` +
        '창을 다 훑은 정상 종료가 아니다. 오름차순 조회라 워터마크는 여기까지만 전진하고, ' +
        '남은 구간은 다음 실행이 이어받는다.',
    )
  }

  log('fetch', `저장 ${stored}편, 건너뜀 ${skipped}편`)
  return { stored, newest }
}

export type EmbedDeps = {
  apiKey?: string
  client?: HttpClient
  listPapers?: (limit: number) => Promise<PaperListRow[]>
  setPaper?: (id: string, embedding: number[]) => Promise<void>
  listInterests?: () => Promise<InterestListRow[]>
  setInterest?: (id: string, embedding: number[]) => Promise<void>
}

/**
 * 논문 임베딩. 배치가 실패하면 한 편씩 재시도해 나쁜 한 편만 잃는다.
 * `listPapers`는 정렬 보장이 없어 실패한 논문이 다음 조회에서도 다시 돌아올 수 있으므로,
 * 이번 실행에서 실패로 확인된 id는 `failed`에 남겨 걸러내고, 걸러낸 뒤 배치가 비면 멈춰서
 * 무한 루프 없이 항상 진행(진짜 새 논문을 다 처리하거나, 더 처리할 게 없으면 종료)한다.
 * 차원 불일치(`EmbeddingDimensionError`)는 이 재시도의 대상이 아니다 — 즉시 다시 던진다.
 */
async function embedPapers(
  client: HttpClient,
  apiKey: string,
  listPapers: (limit: number) => Promise<PaperListRow[]>,
  setPaper: (id: string, embedding: number[]) => Promise<void>,
): Promise<number> {
  const failed = new Set<string>()
  let count = 0

  for (;;) {
    const fetched = await listPapers(256)
    const batch = fetched.filter((p) => !failed.has(p.id))
    if (batch.length === 0) break

    try {
      const vectors = await embedTexts(
        client,
        apiKey,
        batch.map((p) => paperEmbeddingInput(p.title, p.abstract)),
        'document',
      )
      for (let i = 0; i < batch.length; i++) {
        const p = batch[i]
        const vector = vectors[i]
        if (!p || !vector) continue
        await setPaper(p.id, vector)
      }
      count += batch.length
      log('embed', `논문 ${count}편`)
    } catch (err) {
      if (err instanceof EmbeddingDimensionError) throw err
      log('embed', `배치 실패, 한 편씩 재시도: ${String(err)}`)
      for (const p of batch) {
        try {
          const [vector] = await embedTexts(client, apiKey, [paperEmbeddingInput(p.title, p.abstract)], 'document')
          if (!vector) throw new Error('Voyage 응답에 벡터가 없다')
          await setPaper(p.id, vector)
          count++
        } catch (e2) {
          if (e2 instanceof EmbeddingDimensionError) throw e2
          failed.add(p.id)
          log('embed', `논문 임베딩 실패로 건너뜀 ${p.id}: ${String(e2)}`)
        }
      }
    }
  }
  return count
}

/**
 * 관심사 임베딩. `listInterests`는 한 번에 전체를 돌려주므로(페이지네이션 없음) 논문과 달리
 * 재조회 루프는 없지만, 같은 이유로 배치 실패 시 한 개씩 재시도해 나쁜 관심사 하나 때문에
 * 나머지가 전부 막히지 않게 한다. 차원 불일치는 여기서도 즉시 다시 던진다.
 */
async function embedInterests(
  client: HttpClient,
  apiKey: string,
  listInterests: () => Promise<InterestListRow[]>,
  setInterest: (id: string, embedding: number[]) => Promise<void>,
): Promise<number> {
  const pending = await listInterests()
  if (pending.length === 0) return 0

  let count = 0
  try {
    const vectors = await embedTexts(
      client,
      apiKey,
      pending.map((i) => i.label),
      'query',
    )
    for (let i = 0; i < pending.length; i++) {
      const it = pending[i]
      const vector = vectors[i]
      if (!it || !vector) continue
      await setInterest(it.id, vector)
    }
    count = pending.length
  } catch (err) {
    if (err instanceof EmbeddingDimensionError) throw err
    log('embed', `관심사 배치 실패, 한 개씩 재시도: ${String(err)}`)
    for (const it of pending) {
      try {
        const [vector] = await embedTexts(client, apiKey, [it.label], 'query')
        if (!vector) throw new Error('Voyage 응답에 벡터가 없다')
        await setInterest(it.id, vector)
        count++
      } catch (e2) {
        if (e2 instanceof EmbeddingDimensionError) throw e2
        log('embed', `관심사 임베딩 실패로 건너뜀 ${it.id}: ${String(e2)}`)
      }
    }
  }
  return count
}

/**
 * ③ 임베딩.
 * `EmbeddingDimensionError`(모델/설정 drift로 응답 차원이 EMBEDDING_DIM과 다른 경우)만은
 * 절대 여기서 삼키지 않는다 — 이 함수를 호출하는 `main()`까지 그대로 전파돼 비정상 종료해야
 * 한다. 그 외 실패(타임아웃, 잘못된 응답, 개별 논문/관심사 문제)는 해당 항목만 건너뛰고 계속한다.
 */
export async function embed(deps: EmbedDeps = {}): Promise<{ papers: number; interests: number }> {
  const apiKey = deps.apiKey ?? process.env.VOYAGE_API_KEY
  if (!apiKey) {
    throw new Error(
      'VOYAGE_API_KEY가 없다. .env에 넣어야 임베딩 단계가 돈다 (https://voyageai.com). ' +
        '수집·중복 제거 결과는 이미 DB에 저장됐으니 키를 넣고 다시 실행하면 이어서 진행한다.',
    )
  }
  const client = deps.client ?? createHttpClient({ minIntervalMs: 0, maxRetries: 3, timeoutMs: 60_000 }, {})
  const listPapers = deps.listPapers ?? dbListUnembeddedPapers
  const setPaper = deps.setPaper ?? dbSetPaperEmbedding
  const listInterests = deps.listInterests ?? dbListUnembeddedInterests
  const setInterest = deps.setInterest ?? dbSetInterestEmbedding

  const paperCount = await embedPapers(client, apiKey, listPapers, setPaper)
  const interestCount = await embedInterests(client, apiKey, listInterests, setInterest)
  log('embed', `논문 ${paperCount}편, 관심사 ${interestCount}개`)
  return { papers: paperCount, interests: interestCount }
}

/** ④ 관련성 매칭 */
export async function match(): Promise<number> {
  const since = new Date(Date.now() - COLLECT_WINDOW_DAYS * DAY_MS)
  const collectedFor = todayInSeoul()
  const allUsers = await db.select({ id: users.id }).from(users)
  let total = 0

  for (const user of allUsers) {
    const owned = await db
      .select({ id: interestsTable.id, embedding: interestsTable.embedding })
      .from(interestsTable)
      .where(eq(interestsTable.userId, user.id))

    const groups: InterestMatches[] = []
    for (const it of owned) {
      if (!it.embedding) {
        log('match', `관심사 ${it.id}는 아직 임베딩이 없어 건너뜀`)
        continue
      }
      groups.push({
        interestId: it.id,
        matches: await matchPapersForInterest(it.embedding, since, CANDIDATES_PER_INTEREST),
      })
    }

    const selected = selectBestPerPaper(groups, RELEVANCE_THRESHOLD, CANDIDATES_PER_INTEREST)
    await upsertCandidates(
      selected.map((s) => ({
        userId: user.id,
        paperId: s.paperId,
        interestId: s.interestId,
        relevance: s.relevance,
        collectedFor,
      })),
    )
    total += selected.length
    log('match', `사용자 ${user.id}: 후보 ${selected.length}편`)
  }
  return total
}

async function main() {
  const started = Date.now()
  const { stored, newest } = await collect()
  if (newest) {
    await setPipelineState(WATERMARK_KEY, newest.toISOString())
    log('fetch', `워터마크 → ${newest.toISOString()}`)
  }
  await embed()
  const candidates = await match()
  log('done', `논문 ${stored}편 저장, 후보 ${candidates}편, ${((Date.now() - started) / 1000).toFixed(1)}초`)
}

// `tsx src/index.ts`로 직접 실행될 때만 돈다 — 테스트가 collect/embed/match를 import할 때는
// 파이프라인이 저절로 실행되면 안 된다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(err)
      process.exit(1)
    })
}
