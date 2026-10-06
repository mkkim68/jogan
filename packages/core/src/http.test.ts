import { describe, expect, it } from 'vitest'
import { createHttpClient } from './http'

function fakeClock() {
  let t = 0
  const sleeps: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => { sleeps.push(ms); t += ms },
    sleeps,
    advance: (ms: number) => { t += ms },
  }
}

const ok = () => new Response('ok', { status: 200 })

describe('createHttpClient', () => {
  it('연속 호출 사이에 최소 간격을 지킨다', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createHttpClient(
      { minIntervalMs: 3000, maxRetries: 0 },
      { fetchImpl: async () => { calls++; return ok() }, sleep: clock.sleep, now: clock.now },
    )
    await client.request('https://x/1')
    await client.request('https://x/2')
    expect(calls).toBe(2)
    expect(clock.sleeps).toEqual([3000])
  })

  it('이미 간격이 지났으면 기다리지 않는다', async () => {
    const clock = fakeClock()
    const client = createHttpClient(
      { minIntervalMs: 3000, maxRetries: 0 },
      { fetchImpl: async () => ok(), sleep: clock.sleep, now: clock.now },
    )
    await client.request('https://x/1')
    clock.advance(5000)
    await client.request('https://x/2')
    expect(clock.sleeps).toEqual([])
  })

  it('429는 Retry-After가 없으면 30초부터 지수 백오프로 재시도한다', async () => {
    const clock = fakeClock()
    const statuses = [429, 429, 200]
    let i = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => new Response('', { status: statuses[i++] }), sleep: clock.sleep, now: clock.now },
    )
    const res = await client.request('https://x/1')
    expect(res.status).toBe(200)
    expect(clock.sleeps).toEqual([30_000, 60_000])
  })

  it('429의 Retry-After(초)를 따른다', async () => {
    const clock = fakeClock()
    const responses = [new Response('', { status: 429, headers: { 'Retry-After': '45' } }), ok()]
    let i = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => responses[i++]!, sleep: clock.sleep, now: clock.now },
    )
    expect((await client.request('https://x/1')).status).toBe(200)
    expect(clock.sleeps).toEqual([45_000])
  })

  it('429의 Retry-After(HTTP 날짜)를 지금부터의 대기로 바꾼다', async () => {
    const clock = fakeClock()
    clock.advance(Date.UTC(2026, 9, 6, 18, 0, 0))
    const retryAt = new Date(Date.UTC(2026, 9, 6, 18, 0, 20)).toUTCString()
    const responses = [new Response('', { status: 429, headers: { 'Retry-After': retryAt } }), ok()]
    let i = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => responses[i++]!, sleep: clock.sleep, now: clock.now },
    )
    expect((await client.request('https://x/1')).status).toBe(200)
    expect(clock.sleeps).toEqual([20_000])
  })

  it('Retry-After가 너무 길면 5분으로 자른다 — 배치 하나가 묶여 있지 않게', async () => {
    const clock = fakeClock()
    const responses = [new Response('', { status: 429, headers: { 'Retry-After': '86400' } }), ok()]
    let i = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => responses[i++]!, sleep: clock.sleep, now: clock.now },
    )
    await client.request('https://x/1')
    expect(clock.sleeps).toEqual([300_000])
  })

  it('Retry-After를 읽을 수 없으면 기본 백오프로 기다린다', async () => {
    const clock = fakeClock()
    const responses = [new Response('', { status: 429, headers: { 'Retry-After': 'soon' } }), ok()]
    let i = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => responses[i++]!, sleep: clock.sleep, now: clock.now },
    )
    await client.request('https://x/1')
    expect(clock.sleeps).toEqual([30_000])
  })

  it('5xx는 1초부터 짧게 재시도한다', async () => {
    const clock = fakeClock()
    const statuses = [503, 502, 200]
    let i = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => new Response('', { status: statuses[i++] }), sleep: clock.sleep, now: clock.now },
    )
    expect((await client.request('https://x/1')).status).toBe(200)
    expect(clock.sleeps).toEqual([1000, 2000])
  })

  it('400은 재시도하지 않고 그대로 돌려준다', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 3 },
      { fetchImpl: async () => { calls++; return new Response('', { status: 400 }) }, sleep: clock.sleep, now: clock.now },
    )
    expect((await client.request('https://x/1')).status).toBe(400)
    expect(calls).toBe(1)
  })

  it('재시도를 다 써도 실패하면 마지막 응답을 돌려준다', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 2 },
      { fetchImpl: async () => { calls++; return new Response('', { status: 503 }) }, sleep: clock.sleep, now: clock.now },
    )
    expect((await client.request('https://x/1')).status).toBe(503)
    expect(calls).toBe(3) // 최초 1 + 재시도 2
  })

  it('네트워크 오류도 재시도하고, 끝내 실패하면 throw한다', async () => {
    const clock = fakeClock()
    let calls = 0
    const client = createHttpClient(
      { minIntervalMs: 0, maxRetries: 1 },
      { fetchImpl: async () => { calls++; throw new Error('boom') }, sleep: clock.sleep, now: clock.now },
    )
    await expect(client.request('https://x/1')).rejects.toThrow('boom')
    expect(calls).toBe(2)
  })
})
