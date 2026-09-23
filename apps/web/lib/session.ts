import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export type SessionUser = {
  id: string
  email: string
  name: string | null
  image: string | null
}

/** 로그인이 필요한 모든 페이지의 첫 줄. 세션이 없으면 /login으로 보낸다 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth()
  const user = session?.user
  if (!user?.id || !user.email) redirect('/login')
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
  }
}
