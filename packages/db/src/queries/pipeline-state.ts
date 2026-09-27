import { eq } from 'drizzle-orm'
import { db } from '../client'
import { pipelineState } from '../schema'

export async function getPipelineState(key: string): Promise<string | null> {
  const row = await db.query.pipelineState.findFirst({ where: eq(pipelineState.key, key) })
  return row?.value ?? null
}

export async function setPipelineState(key: string, value: string): Promise<void> {
  await db
    .insert(pipelineState)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: pipelineState.key, set: { value, updatedAt: new Date() } })
}
