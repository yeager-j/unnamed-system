import { describe, expect, it } from "vitest"

import type { VersionClass } from "@/lib/db/version-classes"

import {
  mergePingedVersions,
  parseCharacterPing,
} from "./character-version-sync"

function refs(
  current: Record<VersionClass, number>
): Record<VersionClass, { current: number }> {
  return {
    identity: { current: current.identity },
    vitals: { current: current.vitals },
    inventory: { current: current.inventory },
    progression: { current: current.progression },
  }
}

const BASELINE = { identity: 3, vitals: 5, inventory: 2, progression: 7 }

describe("mergePingedVersions", () => {
  it("forwards a fresher class and reports it", () => {
    const local = refs(BASELINE)

    expect(mergePingedVersions({ vitals: 6 }, local)).toBe(true)
    expect(local.vitals.current).toBe(6)
    expect(local.identity.current).toBe(3)
  })

  it("skips an echo — all pinged classes ≤ local", () => {
    const local = refs(BASELINE)

    expect(mergePingedVersions({ vitals: 5 }, local)).toBe(false)
    expect(mergePingedVersions({ vitals: 4, identity: 1 }, local)).toBe(false)
    expect(local.vitals.current).toBe(5)
  })

  it("handles a multi-class ping where only one class is fresher", () => {
    const local = refs(BASELINE)

    expect(mergePingedVersions({ progression: 8, vitals: 5 }, local)).toBe(true)
    expect(local.progression.current).toBe(8)
    expect(local.vitals.current).toBe(5)
  })

  it("ignores junk keys and non-numeric values from the wire", () => {
    const local = refs(BASELINE)
    const junk = {
      bogus: 99,
      vitals: "6",
      identity: Number.NaN,
    } as never

    expect(mergePingedVersions(junk, local)).toBe(false)
    expect(local).toEqual(refs(BASELINE))
  })
})

describe("parseCharacterPing", () => {
  it("extracts the versions map from a well-formed ping", () => {
    expect(parseCharacterPing({ versions: { vitals: 6 } })).toEqual({
      vitals: 6,
    })
  })

  it("returns null for malformed payloads", () => {
    expect(parseCharacterPing(null)).toBeNull()
    expect(parseCharacterPing("ping")).toBeNull()
    expect(parseCharacterPing({})).toBeNull()
    expect(parseCharacterPing({ versions: "vitals" })).toBeNull()
  })
})
