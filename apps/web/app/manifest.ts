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
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
