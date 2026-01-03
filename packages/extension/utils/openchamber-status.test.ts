import { beforeEach, describe, expect, test } from "bun:test"

import { getOpenChamberConnectionMode, setOpenChamberConnectionMode } from "./openchamber-status"

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

describe("openchamber-status", () => {
  const store: Store = new Map()

  beforeEach(() => {
    store.clear()
    globalThis.localStorage = createLocalStorage(store)
  })

  test("getOpenChamberConnectionMode defaults to local", () => {
    expect(getOpenChamberConnectionMode()).toBe("local")
  })

  test("getOpenChamberConnectionMode ignores invalid stored values", () => {
    globalThis.localStorage.setItem("eidorail-openchamber-mode", "nope")
    expect(getOpenChamberConnectionMode()).toBe("local")
  })

  test("setOpenChamberConnectionMode stores and returns value", () => {
    setOpenChamberConnectionMode("remote")
    expect(getOpenChamberConnectionMode()).toBe("remote")
  })
})
