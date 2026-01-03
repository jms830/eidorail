import { beforeEach, describe, expect, test } from "bun:test"

import { checkNoCorsReachable } from "./reachability"

describe("reachability", () => {
  beforeEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch
  })

  test("checkNoCorsReachable returns true when fetch resolves", async () => {
    globalThis.fetch = (async () => ({ ok: true })) as unknown as typeof fetch

    const ok = await checkNoCorsReachable("http://localhost:1234", 50)

    expect(ok).toBe(true)
  })

  test("checkNoCorsReachable returns false when fetch rejects", async () => {
    globalThis.fetch = (async () => {
      throw new Error("no")
    }) as unknown as typeof fetch

    const ok = await checkNoCorsReachable("http://localhost:1234", 50)

    expect(ok).toBe(false)
  })
})
