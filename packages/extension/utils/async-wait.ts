/**
 * Unified async wait/timeout/poll helpers.
 *
 * Replaces scattered setTimeout/retry logic across background.ts
 * and capture helpers with one consistent contract.
 *
 * Inspired by opencode-browser's consistent timeoutMs/pollMs semantics.
 */

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_POLL_MS = 200

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Poll a predicate until it returns true or timeout expires.
 * Returns true if predicate succeeded, false on timeout.
 */
export async function pollUntil(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS,
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true
    await sleep(pollMs)
  }
  return false
}

/**
 * Retry an async operation with exponential backoff.
 * Returns the first successful result, or throws the last error.
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 300,
): Promise<T> {
  let lastError: Error | undefined
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn(i)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (i < maxRetries - 1) {
        await sleep(baseDelayMs * (i + 1))
      }
    }
  }
  throw lastError
}

/**
 * Race an async operation against a timeout.
 * Returns `{ ok: true, value }` on success, `{ ok: false, error }` on timeout.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  label = "operation",
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    const value = await Promise.race([fn(), timeout])
    return { ok: true, value }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
