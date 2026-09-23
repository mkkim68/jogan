import { IBM_Plex_Sans_KR, Nanum_Myeongjo } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

const display = Nanum_Myeongjo({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

const body = IBM_Plex_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '조간 논문',
  description: '매일 아침, 믿을 만한 논문 4편',
  appleWebApp: { capable: true, title: '조간 논문', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#F7F4ED',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
