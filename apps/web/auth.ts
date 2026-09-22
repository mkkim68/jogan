import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { accounts, db, sessions, users, verificationTokens } from '@jogan/db'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // 시드로 먼저 만든 사용자(이메일만 있음)에 Google 계정을 연결하기 위해 허용.
  // 아래 signIn 콜백이 Google이 이메일을 검증한 경우에만 통과시키므로 안전하다.
  providers: [Google({ allowDangerousEmailAccountLinking: true })],
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider === 'google') return profile?.email_verified === true
      return false
    },
  },
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
})
