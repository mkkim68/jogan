import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { accounts, db, sessions, updateUserProfile, users, verificationTokens } from '@jogan/db'
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
  events: {
    // 계정 연결로 들어온 시드 사용자는 이름이 '조간 독자'로 남는다 — 로그인마다 Google 프로필로 맞춘다.
    // 실패해도 로그인은 막지 않는다. 공개 레포라 로그에 이메일·이름을 찍지 않는다.
    async signIn({ user, account, profile }) {
      if (account?.provider !== 'google' || !user.id) return
      try {
        await updateUserProfile(user.id, {
          name: typeof profile?.name === 'string' ? profile.name : null,
          image: typeof profile?.picture === 'string' ? profile.picture : null,
        })
      } catch (err) {
        console.error('프로필 갱신 실패', err instanceof Error ? err.message : 'unknown')
      }
    },
  },
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
})
