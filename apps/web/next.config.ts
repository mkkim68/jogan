import path from 'node:path'
import type { NextConfig } from 'next'
import { config } from 'dotenv'

// 레포 루트의 .env 하나를 공유한다 (Auth.js·db가 process.env에서 읽는다)
config({ path: path.join(__dirname, '../../.env'), quiet: true })

const nextConfig: NextConfig = {
  transpilePackages: ['@jogan/core', '@jogan/db'],
  turbopack: { root: path.join(__dirname, '../..') },
  agentRules: false,
}

export default nextConfig
