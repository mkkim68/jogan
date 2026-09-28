import { eq, sql } from 'drizzle-orm'
import { db } from './client'
import { todayInSeoul } from './queries'
import {
  assessments, briefItems, briefs, interests, papers, savedItems, userSettings, users,
} from './schema'
import { buildSeed } from './seed-data'

const SEED_USER_ID = '00000000-0000-4000-8000-000000000001'

// 로컬 개발용 시드. SEED_USER_EMAIL을 바꾸면 고정 id가 충돌하고, 파이프라인이 실제 브리핑을
// 쓰기 시작하면 briefs_user_date 유니크와 충돌할 수 있다 — 그 시점엔 시드를 지우거나 날짜를 바꾼다.
async function main() {
  const email = process.env.SEED_USER_EMAIL
  if (!email) throw new Error('SEED_USER_EMAIL이 없습니다. .env에 Google 로그인에 쓸 이메일을 넣으세요.')

  // 이미 Google 로그인으로 만들어진 사용자가 있으면 그 id를 쓴다
  await db.insert(users).values({ id: SEED_USER_ID, email, name: '조간 독자' }).onConflictDoNothing({ target: users.email })
  const user = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (!user) throw new Error('사용자 생성 실패')

  const seed = buildSeed(user.id, todayInSeoul())

  await db.insert(userSettings).values(seed.settings).onConflictDoNothing()
  await db.insert(papers).values(seed.papers).onConflictDoNothing()
  await db.insert(assessments).values(seed.assessments).onConflictDoNothing()
  await db.insert(interests).values(seed.interests).onConflictDoNothing()

  // 시드의 관심사 id는 고정이지만, 사용자가 화면에서 관심사를 지웠다 다시 만들면 같은 라벨이
  // 다른 id를 갖게 된다. 그러면 brief_items.interest_id가 없는 행을 가리켜 FK가 깨진다.
  // 그래서 항목의 관심사는 id가 아니라 **라벨로** 다시 해석한다. 라벨이 사라졌으면 null로 둔다
  // (interest_id는 nullable이고, null은 "관심사에 묶이지 않은 항목"이라는 정상 상태다).
  const labelById = new Map(seed.interests.map((i) => [i.id, i.label]))
  const idByLabel = new Map(
    (await db.query.interests.findMany({ where: eq(interests.userId, user.id) })).map((row) => [
      row.label,
      row.id,
    ]),
  )
  const resolveInterestId = (seedInterestId: string | null): string | null => {
    if (!seedInterestId) return null
    const label = labelById.get(seedInterestId)
    return label ? (idByLabel.get(label) ?? null) : null
  }

  const { items, ...briefRow } = seed.brief
  await db
    .insert(briefs)
    .values(briefRow)
    .onConflictDoUpdate({ target: briefs.id, set: { date: briefRow.date } })
  const brief = await db.query.briefs.findFirst({ where: eq(briefs.id, seed.brief.id) })
  if (brief) {
    // 시드는 "코드에 적힌 것이 DB에 그대로 있는 상태"를 만드는 것이 목적이다. onConflictDoNothing이면
    // 한 번 들어간 뒤로는 문구를 고쳐도 영영 반영되지 않으므로, 항목 내용은 갱신한다.
    await db
      .insert(briefItems)
      .values(items.map((item) => ({ ...item, briefId: brief.id, interestId: resolveInterestId(item.interestId) })))
      .onConflictDoUpdate({
        target: [briefItems.briefId, briefItems.position],
        set: {
          paperId: sql`excluded.paper_id`,
          interestId: sql`excluded.interest_id`,
          oneLine: sql`excluded.one_line`,
          whyItMatters: sql`excluded.why_it_matters`,
          method: sql`excluded.method`,
          results: sql`excluded.results`,
          limitations: sql`excluded.limitations`,
          quotes: sql`excluded.quotes`,
          isSerendipity: sql`excluded.is_serendipity`,
        },
      })
  }

  await db
    .insert(savedItems)
    .values(seed.saved.map((s) => ({ ...s, followUp: s.followUp ? { ...s.followUp, at: s.followUp.at.toISOString() } : null })))
    .onConflictDoNothing()

  console.log(`시드 완료: ${email} · 논문 ${seed.papers.length}편 · ${seed.brief.date} 브리핑 제${seed.brief.issueNumber}호`)
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
