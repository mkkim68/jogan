'use server'

import { getPaperDetail, markRead, savePaper, unsavePaper } from '@jogan/db'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/session'

/**
 * 저장 토글 / 읽음 표시 서버 액션.
 *
 * `userId`는 클라이언트에서 절대 받지 않는다 — 항상 `requireUser()`로 서버 세션에서 얻는다.
 * `paperId`만 클라이언트(폼 action의 bind된 인자)에서 넘어온다.
 */

export async function toggleSave(paperId: string): Promise<void> {
  const user = await requireUser()
  const detail = await getPaperDetail(paperId, user.id)

  if (detail?.saved) {
    await unsavePaper(user.id, paperId)
  } else {
    await savePaper(user.id, paperId)
  }

  revalidatePath(`/paper/${paperId}`)
  revalidatePath('/saved')
}

export async function markPaperRead(paperId: string): Promise<void> {
  const user = await requireUser()
  await markRead(user.id, paperId)

  revalidatePath(`/paper/${paperId}`)
  revalidatePath('/saved')
}
