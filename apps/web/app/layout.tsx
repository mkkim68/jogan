import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

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

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
