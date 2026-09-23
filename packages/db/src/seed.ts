import { eq } from 'drizzle-orm'
import { db } from './client'
import {
  assessments, briefItems, briefs, interests, papers, savedItems, userSettings, users,
} from './schema'
import { buildSeed } from './seed-data'

const SEED_USER_ID = '00000000-0000-4000-8000-000000000001'

function todayInSeoul(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

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

  const { items, ...briefRow } = seed.brief
  await db
    .insert(briefs)
    .values(briefRow)
    .onConflictDoUpdate({ target: briefs.id, set: { date: briefRow.date } })
  const brief = await db.query.briefs.findFirst({ where: eq(briefs.id, seed.brief.id) })
  if (brief) {
    await db.insert(briefItems).values(items.map((item) => ({ ...item, briefId: brief.id }))).onConflictDoNothing()
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
