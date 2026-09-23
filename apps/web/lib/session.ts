import { redirect } from 'next/navigation'
import { cache } from 'react'
import { auth } from '@/auth'

export type SessionUser = {
  id: string
  email: string
  name: string | null
  image: string | null
}

/**
 * 로그인이 필요한 모든 페이지의 첫 줄. 세션이 없으면 /login으로 보낸다.
 *
 * `(app)/layout.tsx`와 그 아래 페이지가 매 렌더마다 각자 이 함수를 부르므로, React `cache()`로
 * 감싸 한 요청 안에서는 `auth()`(세션 조회)가 한 번만 실행되게 한다.
 */
export const requireUser = cache(async (): Promise<SessionUser> => {
  const session = await auth()
  const user = session?.user
  if (!user?.id || !user.email) redirect('/login')
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
  }
})
