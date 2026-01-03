import { beforeEach, describe, expect, test } from "bun:test"

import * as ptyManager from "./pty-manager"

type Store = Map<string, string>

function createLocalStorage(store: Store): Storage {
  return {
    getItem(key) {
      return store.get(key) ?? null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null
    },
    get length() {
      return store.size
    },
  } as Storage
}

function createResponse(jsonValue: unknown, ok = true): Response {
  return {
    ok,
    async json() {
      return jsonValue
    },
  } as Response
}

describe("pty-manager", () => {
  const store: Store = new Map()

  beforeEach(() => {
    store.clear()
    globalThis.localStorage = createLocalStorage(store)
    globalThis.localStorage.setItem("eidorail-opencode-port", "4096")
  })

  test("restartOpenChamberSession kills existing session before creating new", async () => {
    const calls: Array<{ url: string; method: string }> = []

    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      const method = init?.method ?? "GET"
      calls.push({ url, method })

      if (url.endsWith("/pty") && method === "GET") {
        return createResponse([
          {
            id: "1",
            title: "OpenChamber",
            command: "openchamber",
            args: [],
            cwd: "",
            status: "running",
            pid: 123,
          },
        ])
      }

      if (url.endsWith("/pty/1") && method === "DELETE") {
        return createResponse(null, true)
      }

      if (url.endsWith("/pty") && method === "POST") {
        return createResponse({
          id: "2",
          title: "OpenChamber",
          command: "openchamber",
          args: ["--port", "4097"],
          cwd: "",
          status: "running",
          pid: 456,
        })
      }

      return createResponse(null, false)
    }) as typeof fetch

    const restart = (ptyManager as unknown as { restartOpenChamberSession?: (args: string[]) => Promise<unknown> })
      .restartOpenChamberSession

    expect(typeof restart).toBe("function")
    if (typeof restart !== "function") return

    const session = await restart(["--port", "4097"])

    expect((session as { id?: string } | undefined)?.id).toBe("2")
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET http://localhost:4096/pty",
      "DELETE http://localhost:4096/pty/1",
      "POST http://localhost:4096/pty",
    ])
  })
})
