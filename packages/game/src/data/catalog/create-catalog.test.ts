import { describe, expect, it, vi } from "vitest"

import { createCatalog } from "@workspace/game/data/catalog/create-catalog"

interface Entry {
  key: string
  name: string
}

const alpha: Entry = { key: "alpha", name: "Alpha" }
const beta: Entry = { key: "beta", name: "Beta" }

const ENTRIES_BY_KEY = { alpha, beta }

describe("createCatalog", () => {
  it("exposes every entry in insertion order", () => {
    const catalog = createCatalog(ENTRIES_BY_KEY)
    expect(catalog.all).toEqual([alpha, beta])
  })

  it("exposes the entry keys", () => {
    const catalog = createCatalog(ENTRIES_BY_KEY)
    expect(catalog.keys).toEqual(["alpha", "beta"])
  })

  it("resolves an entry by its key", () => {
    const catalog = createCatalog(ENTRIES_BY_KEY)
    expect(catalog.get("beta")).toBe(beta)
  })

  it("returns undefined for an unknown key", () => {
    const catalog = createCatalog(ENTRIES_BY_KEY)
    expect(catalog.get("gamma")).toBeUndefined()
  })

  it("runs the validator once per entry at construction", () => {
    const validate = vi.fn()
    createCatalog(ENTRIES_BY_KEY, validate)
    expect(validate).toHaveBeenCalledTimes(2)
    expect(validate).toHaveBeenCalledWith(alpha)
    expect(validate).toHaveBeenCalledWith(beta)
  })

  it("throws from construction when the validator rejects an entry", () => {
    expect(() =>
      createCatalog(ENTRIES_BY_KEY, (entry) => {
        if (entry.key === "beta") throw new Error("bad entry")
      })
    ).toThrow("bad entry")
  })
})
