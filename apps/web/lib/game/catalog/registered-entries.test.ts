import { describe, expect, it } from "vitest"

import { findUnregisteredEntries } from "./registered-entries"

const alpha = { key: "alpha" }
const beta = { key: "beta" }

const get = (key: string) => ({ alpha, beta })[key as "alpha" | "beta"]

describe("findUnregisteredEntries", () => {
  it("returns empty when every entry resolves to itself", () => {
    const modules = {
      "alpha.ts": { alpha },
      "beta.ts": { beta },
    }
    expect(findUnregisteredEntries(modules, get)).toEqual([])
  })

  it("names a file whose entry is absent from the catalog", () => {
    const modules = {
      "alpha.ts": { alpha },
      "gamma.ts": { gamma: { key: "gamma" } },
    }
    expect(findUnregisteredEntries(modules, get)).toEqual([
      'gamma.ts (key: "gamma")',
    ])
  })

  it("names a file whose key resolves to a different object", () => {
    const modules = {
      "alpha.ts": { alpha: { key: "alpha" } },
    }
    expect(findUnregisteredEntries(modules, get)).toEqual([
      'alpha.ts (key: "alpha")',
    ])
  })

  it("ignores module exports that are not catalog entries", () => {
    const modules = {
      "alpha.ts": { alpha, somethingElse: 42, aType: undefined },
    }
    expect(findUnregisteredEntries(modules, get)).toEqual([])
  })
})
