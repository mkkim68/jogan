'use server'

import { signOut } from '@/auth'

/** 로그아웃 — DB 세션 행을 지우고 /login으로 보낸다. */
export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}
