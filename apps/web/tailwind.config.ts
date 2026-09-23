import type { Config } from 'tailwindcss'

// docs/DESIGN.md §1 색, §2 폰트. 컴포넌트에서 hex를 직접 쓰지 않는다.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F7F4ED', raised: '#F1EDE2', subtle: '#FBFAF6' },
        surface: '#FFFFFF',
        ink: { DEFAULT: '#171512', body: '#241F19', soft: '#3C3730', dim: '#4A4438', muted: '#625C50' },
        line: { DEFAULT: '#DED7C9', strong: '#D3CBBA', hair: '#E2DBCC' },
        verified: {
          DEFAULT: '#23543D', bg: '#E2EDE5', surface: '#ECEFE9', line: '#CFDACD', deep: '#1B3F2C', hover: '#14351F',
        },
        caution: { DEFAULT: '#7A4A08', bg: '#F6E9CC', line: '#E8D9B6', surface: '#FDF6E7' },
        accent: '#9E3B22',
        night: {
          DEFAULT: '#171512', surface: '#221F1A', line: '#2C2924', track: '#33302A',
          text: '#F7F4ED', strong: '#FFFFFF', soft: '#D8D2C4', muted: '#8C8577', dim: '#ADA593',
          faint: '#625C50', fainter: '#4A463D', accent: '#A9CDB6',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
      },
      maxWidth: { prose: '660px' },
      screens: { tablet: '720px', desktop: '1080px' },
    },
  },
  plugins: [],
}

export default config
