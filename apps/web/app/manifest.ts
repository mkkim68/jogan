import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '조간 논문',
    short_name: '조간',
    description: '매일 아침, 믿을 만한 논문 4편',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F4ED',
    theme_color: '#F7F4ED',
    lang: 'ko',
    // PNG가 있어야 Android Chrome 설치 조건(192·512)과 iOS 홈 화면 아이콘이 확실하다.
    // 전부 public/jogan-logo.svg 왼쪽 심볼(= icon.svg)에서 렌더한 것. maskable은 안전 영역에 맞춰 80%로 줄였다.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
}
