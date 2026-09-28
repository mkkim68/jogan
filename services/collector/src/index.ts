import {
  ARXIV_CATEGORIES,
  ARXIV_MIN_INTERVAL_MS,
  ARXIV_PAGE_SIZE,
  CANDIDATES_PER_INTEREST,
  COLLECT_BACKFILL_DAYS,
  COLLECT_MAX_PER_RUN,
  COLLECT_WINDOW_DAYS,
  RELEVANCE_THRESHOLD,
} from '@jogan/core'
import {
  db,
  getPipelineState,
  interests as interestsTable,
  listUnembeddedInterests,
  listUnembeddedPapers,
  matchPapersForInterest,
  setInterestEmbedding,
  setPaperEmbedding,
  setPipelineState,
  todayInSeoul,
  upsertArxivPapers,
  upsertCandidates,
  users,
  type NewPaper,
} from '@jogan/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { buildArxivQueryUrl, dedupeByArxivId, entryToPaper, fetchArxivPage, parseArxivFeed, stripVersion } from './arxiv'
import { embedTexts, paperEmbeddingInput } from './embed'
import { createHttpClient } from './http'
import { selectBestPerPaper, type InterestMatches } from './match'

const WATERMARK_KEY = 'collector:arxiv:last_submitted_at'
/** 워터마크 경계에서 새는 것을 막는 겹침. upsert라 중복 비용이 없다 */
const OVERLAP_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const log = (stage: string, msg: string) => console.log(`[collector:${stage}] ${msg}`)

/** entryToPaper가 이미 검증한 엔트리에서 원본 id(버전 포함)만 다시 뽑는다 */
const EntryId = z.object({ id: z.string() })

/** ①② 수집 + 중복 제거. 반환: 저장한 논문 수와 가장 늦은 published_at */
async function collect(): Promise<{ stored: number; newest: Date | null }> {
  const arxiv = createHttpClient(
    { minIntervalMs: ARXIV_MIN_INTERVAL_MS, maxRetries: 3, timeoutMs: 30_000 },
    {},
  )
  const saved = await getPipelineState(WATERMARK_KEY)
  const to = new Date()
  const from = saved
    ? new Date(Date.parse(saved) - OVERLAP_MS)
    : new Date(to.getTime() - COLLECT_BACKFILL_DAYS * DAY_MS)
  log('fetch', `${from.toISOString()} ~ ${to.toISOString()}, 카테고리 ${ARXIV_CATEGORIES.length}개`)

  let start = 0
  let stored = 0
  let skipped = 0
  let newest: Date | null = null

  while (stored < COLLECT_MAX_PER_RUN) {
    const url = buildArxivQueryUrl({ categories: ARXIV_CATEGORIES, from, to, start, pageSize: ARXIV_PAGE_SIZE })
    const xml = await fetchArxivPage(arxiv, url)
    const { entries, totalResults } = parseArxivFeed(xml)
    if (start === 0) log('fetch', `총 ${totalResults}편`)
    if (entries.length === 0) break

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
      if (!newest || paper.publishedAt > newest) newest = paper.publishedAt
    }

    const deduped = dedupeByArxivId(rows)
    try {
      stored += await upsertArxivPapers(deduped)
    } catch (err) {
      // DOI unique 충돌 등. 배치를 한 편씩 재시도해 나쁜 한 편만 건너뛴다
      for (const p of deduped) {
        try {
          stored += await upsertArxivPapers([p])
        } catch (e2) {
          skipped++
          log('store', `저장 실패로 건너뜀 ${p.arxivId}: ${String(e2)}`)
        }
      }
    }

    start += ARXIV_PAGE_SIZE
    if (start >= totalResults) break
  }

  log('fetch', `저장 ${stored}편, 건너뜀 ${skipped}편`)
  return { stored, newest }
}

/** ③ 임베딩 */
async function embed(): Promise<{ papers: number; interests: number }> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    throw new Error(
      'VOYAGE_API_KEY가 없다. .env에 넣어야 임베딩 단계가 돈다 (https://voyageai.com). ' +
        '수집·중복 제거 결과는 이미 DB에 저장됐으니 키를 넣고 다시 실행하면 이어서 진행한다.',
    )
  }
  const voyage = createHttpClient({ minIntervalMs: 0, maxRetries: 3, timeoutMs: 60_000 }, {})

  let paperCount = 0
  for (;;) {
    const batch = await listUnembeddedPapers(256)
    if (batch.length === 0) break
    try {
      const vectors = await embedTexts(
        voyage,
        apiKey,
        batch.map((p) => paperEmbeddingInput(p.title, p.abstract)),
        'document',
      )
      for (let i = 0; i < batch.length; i++) {
        const p = batch[i]
        const vector = vectors[i]
        if (!p || !vector) continue
        await setPaperEmbedding(p.id, vector)
      }
      paperCount += batch.length
      log('embed', `논문 ${paperCount}편`)
    } catch (err) {
      log('embed', `배치 실패, 건너뜀 (다음 실행에서 재시도): ${String(err)}`)
      break
    }
  }

  const pending = await listUnembeddedInterests()
  let interestCount = 0
  if (pending.length > 0) {
    try {
      const vectors = await embedTexts(
        voyage,
        apiKey,
        pending.map((i) => i.label),
        'query',
      )
      for (let i = 0; i < pending.length; i++) {
        const it = pending[i]
        const vector = vectors[i]
        if (!it || !vector) continue
        await setInterestEmbedding(it.id, vector)
      }
      interestCount = pending.length
    } catch (err) {
      log('embed', `관심사 임베딩 실패 (다음 실행에서 재시도): ${String(err)}`)
    }
  }
  log('embed', `논문 ${paperCount}편, 관심사 ${interestCount}개`)
  return { papers: paperCount, interests: interestCount }
}

/** ④ 관련성 매칭 */
async function match(): Promise<number> {
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

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
