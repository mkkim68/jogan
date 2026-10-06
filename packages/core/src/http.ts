export type HttpDeps = {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export type HttpClient = { request(url: string, init?: RequestInit): Promise<Response> }

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** 4xx는 우리 요청이 잘못된 것이라 재시도해도 같다. 429와 5xx만 다시 시도한다 */
function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * 429 대기 상한. 이보다 긴 Retry-After는 기다리지 않고 잘라서 시도한다 —
 * 새벽 배치 하나가 외부 API 한 곳 때문에 묶여 있지 않게.
 */
const MAX_RATE_LIMIT_WAIT_MS = 300_000

/**
 * 재시도 전 대기. 5xx·네트워크 오류는 1·2·4초로 짧게, 429는 Retry-After를 따르고
 * 없으면 30·60·120초 — arXiv 429는 첫 요청부터 나서 몇 초 백오프로는 넘기지 못했다(HISTORY.md 2026-10-05).
 */
function retryDelayMs(res: Response | null, attempt: number, nowMs: number): number {
  if (res?.status !== 429) return 1000 * 2 ** attempt
  const fallback = 30_000 * 2 ** attempt
  const header = res.headers.get('Retry-After')?.trim()
  if (!header) return fallback
  const waitMs = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - nowMs
  if (Number.isNaN(waitMs)) return fallback
  return Math.min(Math.max(waitMs, 0), MAX_RATE_LIMIT_WAIT_MS)
}

/**
 * 외부 API 호출용 래퍼 (CLAUDE.md: 외부 호출은 레이트리밋·재시도를 가진 래퍼를 통해서).
 * arXiv는 요청 간 3초를 요구하고, Voyage는 간격 제한 없이 429/5xx만 재시도하면 된다.
 */
export function createHttpClient(
  opts: { minIntervalMs: number; maxRetries: number; timeoutMs?: number },
  deps: HttpDeps = {},
): HttpClient {
  const fetchImpl = deps.fetchImpl ?? fetch
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? Date.now
  let lastAt: number | null = null

  async function waitForSlot(): Promise<void> {
    if (lastAt === null || opts.minIntervalMs <= 0) return
    const elapsed = now() - lastAt
    if (elapsed < opts.minIntervalMs) await sleep(opts.minIntervalMs - elapsed)
  }

  return {
    async request(url, init) {
      let lastError: unknown = null
      let lastRes: Response | null = null
      for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        await waitForSlot()
        lastAt = now()
        lastRes = null
        try {
          const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined
          const res = await fetchImpl(url, { ...init, signal })
          if (!shouldRetry(res.status) || attempt === opts.maxRetries) return res
          lastRes = res
        } catch (err) {
          lastError = err
          if (attempt === opts.maxRetries) throw err
        }
        await sleep(retryDelayMs(lastRes, attempt, now()))
      }
      // 여기 도달하지 않지만 타입을 위해
      throw lastError ?? new Error('요청 실패')
    },
  }
}
