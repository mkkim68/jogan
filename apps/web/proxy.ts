import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PREFIXES = ['/login', '/api/auth']
const SESSION_COOKIES = ['authjs.session-token', '__Secure-authjs.session-token']

// 세션 쿠키 유무만 본다. 실제 검증은 각 페이지의 auth()가 한다.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()
  if (SESSION_COOKIES.some((c) => req.cookies.has(c))) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'],
}
