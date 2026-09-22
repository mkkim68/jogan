import { config } from 'dotenv'

// 레포 루트의 .env 하나를 모든 패키지가 공유한다
config({ path: ['.env', '../../.env'], quiet: true })

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL이 없습니다. 레포 루트에서 `cp .env.example .env` 후 값을 채우세요.')
}

export const env = { DATABASE_URL: url }
