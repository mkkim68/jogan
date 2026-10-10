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
    // 생성: Noto Serif KR 800으로 '朝'를 그린 것 (Nanum Myeongjo에는 이 한자가 없다).
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  }
}
